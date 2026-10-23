import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Banknote, CalendarClock, Gift, Globe, Receipt, Camera, Check, CheckCircle2, ChevronDown, CreditCard, ExternalLink, Phone, Plus, Smartphone, Trash2, XCircle, type LucideIcon } from 'lucide-react'
import { WhatsAppIcon } from './BrandIcons'
import { useAuth } from '../auth/AuthProvider'
import { APPOINTMENT_STATUS } from '../lib/catalog'
import { db } from '../lib/db'
import { formatDate, formatLongDate, formatMoney, formatTime, prDay, todayPR } from '../lib/format'
import { telLink, whatsappLink } from '../lib/links'
import { addPayment, paidSoFar } from '../lib/money'
import { loadSalonMenu, minutesLabel, type SalonService } from '../lib/salon'
import { computeTotals, percent } from '../lib/totals'
import type { AppointmentFull, Invoice, Mechanic, Part, Payment, Photo, WorkOrder } from '../lib/types'
import { must, num, useLoad } from '../lib/useLoad'
import NextService from './NextService'
import PhotoSection from './PhotoSection'
import { Sheet } from './Sheet'
import { Button, ErrorBox, Input, Loading } from './ui'

type Method = NonNullable<Invoice['payment_method']>

/** Cómo pagó la clienta: las tres de siempre en el salón. */
const METHODS: { value: Method; label: string; icon: LucideIcon; color: string }[] = [
  { value: 'ath_movil', label: 'ATH Móvil', icon: Smartphone, color: '#ea580c' },
  { value: 'cash', label: 'Efectivo', icon: Banknote, color: '#15803d' },
  { value: 'other', label: 'Tarjeta', icon: CreditCard, color: '#6d28d9' },
]

const initial = (name: string) => name.trim().charAt(0).toUpperCase()

/** Botón redondo con su nombre abajo (WhatsApp, llamar, mover, cancelar). */
function Action({ label, icon, href, onClick, tone = 'bg-slate-100 text-slate-700', external }: { label: string; icon: React.ReactNode; href?: string; onClick?: () => void; tone?: string; external?: boolean }) {
  const inner = (
    <>
      <span className={`flex h-14 w-14 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <span className="text-sm font-bold text-slate-700">{label}</span>
    </>
  )
  const cls = 'flex flex-1 flex-col items-center gap-1 rounded-2xl py-1 active:bg-slate-50'
  return href
    ? <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{inner}</a>
    : <button type="button" onClick={onClick} className={cls}>{inner}</button>
}

/**
 * La visita de una clienta en el salón: la cita arriba y la cuenta abajo, como un recibo.
 * Cobrar es un solo botón: propina (si hay), cómo pagó, y listo.
 */
export default function SalonVisit({ appt: a, woId, onEdit, onCancel, onActivate, onDeny }: {
  appt: AppointmentFull
  woId: string
  onEdit: () => void
  onCancel: () => void
  onActivate: () => void
  onDeny: () => void
}) {
  const { session, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [payOpen, setPayOpen] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [edit, setEdit] = useState<Part | null>(null)
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState<SalonService[]>([])
  // Depósito que se le pide al confirmar (null = el que esté puesto en Citas por internet)
  const depKey = `draft:dep:${a.id}`
  const [askDep, setAskDepState] = useState<string | null>(() => { try { return localStorage.getItem(depKey) } catch { return null } })
  const setAskDep = (v: string) => { setAskDepState(v); try { localStorage.setItem(depKey, v) } catch { /* nada */ } }
  const [otherDep, setOtherDep] = useState(false)
  // Ya se le envió la confirmación por WhatsApp (en este celular)
  const sentKey = `sent:${a.id}`
  const [sent, setSent] = useState(() => { try { return Boolean(localStorage.getItem(sentKey)) } catch { return false } })
  const [athInput, setAthInput] = useState('')
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [skipNext, setSkipNext] = useState(false)
  const [remindOpen, setRemindOpen] = useState(false)

  const { data, loading, error, reload } = useLoad(async () => {
    const [wo, parts, invoice, mech, next, payments, photos, link] = await Promise.all([
      db().from('work_orders').select('*').eq('id', woId).single(),
      db().from('work_order_parts').select('*').eq('work_order_id', woId).order('created_at'),
      db().from('invoices').select('*').eq('work_order_id', woId).maybeSingle(),
      db().from('mechanics').select('*').eq('profile_id', session!.user.id).single(),
      db().from('maintenance_schedules').select('service_type, due_date').eq('work_order_id', woId).limit(1),
      db().from('payments').select('*').eq('work_order_id', woId).order('paid_at'),
      db().from('photos').select('*').eq('work_order_id', woId).order('taken_at'),
      db().from('appointments').select('deposit_asked, client_ok_at, deposit_reported_at, deposit_ok_at').eq('id', a.id).single(),
    ])
    return {
      wo: must(wo) as WorkOrder, parts: must(parts) as Part[], invoice: (invoice.data as Invoice | null) ?? null, mech: must(mech) as Mechanic,
      next: ((next.data ?? [])[0] as { service_type: string; due_date: string } | undefined) ?? null, payments: (payments.data ?? []) as Payment[], photos: (photos.data ?? []) as Photo[],
      link: (link.data ?? {}) as { deposit_asked?: number | null; client_ok_at?: string | null; deposit_reported_at?: string | null; deposit_ok_at?: string | null },
      last: await lastPrices((parts.data ?? []) as Part[], woId),
    }
  }, [woId])

  useEffect(() => { loadSalonMenu(session!.user.id).then(setMenu) }, [session])

  // Viene de "Cobrar ahora": se abre el cobro enseguida
  useEffect(() => {
    if (data && params.get('cobrar') === '1') {
      // Sin servicios todavía no hay qué cobrar: primero se añaden en la cuenta
      if (computeTotals(data.wo, data.parts, data.mech.ivu_rate).total > 0) setPayOpen(true)
      setParams({}, { replace: true })
    }
  }, [data, params, setParams])

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se encontró la cuenta.'} onRetry={reload} />

  const { wo, parts, invoice, mech, payments, photos, link } = data
  const c = a.boats.clients
  const who = (a as unknown as { staff: { name: string; color: string } | null }).staff
  const st = APPOINTMENT_STATUS[a.status]
  // Lo que se va escribiendo cuenta enseguida en el total
  const effParts = parts.map((x) => (prices[x.id] !== undefined && (num(prices[x.id]) ?? 0) > 0 ? { ...x, unit_cost: num(prices[x.id])! } : x))
  const totals = computeTotals(wo, effParts, mech.ivu_rate)
  const paid = paidSoFar(payments)
  const tips = payments.reduce((t, p) => t + Number((p as Payment & { tip?: number }).tip ?? 0), 0)
  const done = Boolean(invoice?.paid_at) || wo.status === 'paid'
  const due = invoice && done ? Number(invoice.total) : totals.total
  const balance = done ? 0 : Math.max(0, Math.round((due - paid) * 100) / 100)
  const firstName = c.full_name.split(' ')[0]
  // El precio se pone al cobrar (cambia por persona): el primer servicio que todavía no tiene precio
  const unpriced = effParts.find((p) => !(Number(p.unit_cost) > 0)) ?? null
  const sign = profile?.full_name ?? ''

  // Depósito: se le pide en el mismo WhatsApp que confirma la cita (si todavía no ha dado nada)
  const depositDue = Number((mech as Mechanic & { booking_deposit?: number | null }).booking_deposit) || 0
  const depAmount = paid > 0 || done ? 0 : num(askDep ?? String(Number(link.deposit_asked) || depositDue)) ?? 0
  const citaLink = `${window.location.origin}/cita/${a.id}`
  const confirmMsg = `Hola ${firstName}, te confirmo tu cita el ${formatLongDate(a.starts_at).toLowerCase()} (${formatDate(a.starts_at)}) a las ${formatTime(a.starts_at)}` +
    (a.title ? ` para ${a.title}` : '') + (who ? ` con ${who.name}` : '') +
    (depAmount > 0 ? `. Para separarla, envía el depósito de ${formatMoney(depAmount)}${mech.ath_movil_number ? ` por ATH Móvil al ${mech.ath_movil_number}` : ''}. Sin el depósito no puedo guardarte el turno` : '') +
    `. Aquí ves tu cita y el estimado${depAmount > 0 ? ', y cuando envíes el depósito le das a Aceptar' : ''}: ${citaLink} ` +
    `. Si no puedes llegar, avísame. ¡Te espero! 💅 ${sign}`.trimEnd()
  const receiptMsg = invoice
    ? `Hola ${firstName}, ¡gracias por venir! 💅 Aquí está tu recibo #${invoice.number} por ${formatMoney(Number(invoice.total))}: ${window.location.origin}/d/${invoice.public_token} . ${sign}`.trim()
    : ''

  /** Los servicios de la cuenta pasan también al título de la cita (lo que se ve en la agenda). */
  async function syncTitle(list: Part[]) {
    const title = list.map((p) => p.description).join(' + ') || null
    await Promise.all([
      db().from('appointments').update({ title }).eq('id', a.id),
      db().from('work_orders').update({ complaint: title }).eq('id', woId),
    ])
    await refreshInvoice()
  }

  async function addLine(description: string, price: number) {
    setBusy(true)
    const { data: row } = await db().from('work_order_parts').insert({ work_order_id: woId, kind: 'service', description, qty: 1, unit_cost: price, supplied_by: 'mechanic' }).select('*').single()
    if (row) await syncTitle([...parts, row as Part])
    setBusy(false)
    setAddOpen(false)
    if (row && !(price > 0)) setEdit(row as Part)
    reload()
  }

  /** Si ya hay factura sin cobrar, se pone al día con la cuenta (mismo número, total nuevo). */
  async function refreshInvoice() {
    if (invoice && !done) await db().rpc('create_invoice', { p_wo: woId })
  }

  /** Guarda los precios escritos en la cuenta. */
  async function flushPrices() {
    const pending = parts.filter((x) => prices[x.id] !== undefined && (num(prices[x.id]) ?? 0) > 0 && num(prices[x.id]) !== Number(x.unit_cost))
    if (!pending.length) return
    await Promise.all(pending.map((x) => db().from('work_order_parts').update({ unit_cost: num(prices[x.id]) }).eq('id', x.id)))
    await refreshInvoice()
    reload()
  }

  async function saveLine(p: Part, description: string, price: number) {
    setPrices(({ [p.id]: _drop, ...rest }) => rest)
    setBusy(true)
    await db().from('work_order_parts').update({ description, unit_cost: price }).eq('id', p.id)
    const list = parts.map((x) => (x.id === p.id ? { ...x, description, unit_cost: price } : x))
    await syncTitle(list)
    setBusy(false)
    setEdit(list.find((x) => x.id !== p.id && !(Number(x.unit_cost) > 0)) ?? null)
    reload()
  }

  async function removeLine(p: Part) {
    setBusy(true)
    await db().from('work_order_parts').delete().eq('id', p.id)
    await syncTitle(parts.filter((x) => x.id !== p.id))
    setBusy(false)
    setEdit(null)
    reload()
  }

  async function setIvu(on: boolean) {
    await db().from('work_orders').update({ charge_ivu_labor: on, charge_ivu_parts: on }).eq('id', woId)
    await refreshInvoice()
    reload()
  }

  /** Cobrar: si con esto queda pagada, se hace el recibo (factura) para que quede el récord, y la cita queda hecha. */
  async function receive(method: Method, amount: number, tip: number, giftCode?: string) {
    let giftId: string | undefined
    if (giftCode) {
      const { data: cards } = await db().from('gift_cards').select('id, balance').ilike('code', giftCode.trim())
      const card = (cards ?? [])[0] as { id: string; balance: number } | undefined
      if (!card) throw new Error('No encontré esa tarjeta de regalo. Revisa el código.')
      if (!(Number(card.balance) > 0)) throw new Error('A esa tarjeta ya no le queda dinero.')
      giftId = card.id
      amount = Math.min(amount, Number(card.balance))
      tip = 0
    }
    const full = amount >= totals.total - paid - 0.004
    const outdated = invoice && Math.abs(Number(invoice.total) - totals.total) > 0.004
    if (full && totals.total > 0 && (!invoice || outdated)) {
      const { error } = await db().rpc('create_invoice', { p_wo: woId })
      if (error) throw error
    }
    await addPayment(woId, amount, method, tip, giftId)
    if (full) await db().from('appointments').update({ status: 'done' }).eq('id', a.id)
    setPayOpen(false)
    reload()
  }

  /** Factura hecha, sin cobrar todavía: queda pendiente en Me deben. */
  async function invoiceLater() {
    setBusy(true)
    await flushPrices()
    const { error } = await db().rpc('create_invoice', { p_wo: woId })
    setBusy(false)
    if (!error) reload()
  }

  async function unmarkPaid() {
    if (!window.confirm('¿Quitar el pago? La cuenta vuelve a quedar sin cobrar.')) return
    setBusy(true)
    await db().from('payments').delete().eq('work_order_id', woId)
    if (invoice) await db().from('invoices').update({ paid_at: null, payment_method: null }).eq('id', invoice.id)
    await db().from('work_orders').update({ status: 'invoiced' }).eq('id', woId)
    setBusy(false)
    reload()
  }

  const confirmed = a.status === 'confirmed' || a.status === 'done'
  const methodLabel = (x: Payment) => ((x as Payment & { gift_card_id?: string | null }).gift_card_id ? 'Tarjeta de regalo' : METHODS.find((m) => m.value === x.method)?.label ?? 'Cheque')

  /** Confirmar por WhatsApp: si no tiene teléfono, se lo pide y lo guarda. */
  function saveAsked() {
    setSent(true)
    try { localStorage.setItem(sentKey, '1') } catch { /* nada */ }
    db().from('appointments').update({ deposit_asked: depAmount > 0 ? depAmount : null }).eq('id', a.id).then(() => reload())
  }

  async function confirmWhatsApp() {
    saveAsked()
    if (c.phone) { window.open(whatsappLink(c.phone, confirmMsg), '_blank'); return }
    const phone = window.prompt(`¿Cuál es el teléfono (WhatsApp) de ${firstName}?`)?.trim()
    if (!phone || phone.replace(/\D/g, '').length < 7) return
    const win = window.open('', '_blank')
    await db().from('clients').update({ phone }).eq('id', c.id)
    if (win) win.location.href = whatsappLink(phone, confirmMsg)
    else window.location.href = whatsappLink(phone, confirmMsg)
  }

  const reported = link.deposit_reported_at && !link.deposit_ok_at && paid === 0 ? Number(link.deposit_asked) || 0 : 0

  async function depositArrived() {
    setBusy(true)
    await addPayment(woId, reported, 'ath_movil', 0)
    await db().from('appointments').update({ deposit_ok_at: new Date().toISOString() }).eq('id', a.id)
    setBusy(false)
    reload()
  }

  function depositMissing() {
    if (c.phone) window.open(whatsappLink(c.phone, `Hola ${firstName}, todavía no me ha llegado el depósito de ${formatMoney(reported)} por ATH Móvil. ¿Me envías la foto del recibo? 💅 ${sign}`.trim()), '_blank')
    db().from('appointments').update({ deposit_reported_at: null }).eq('id', a.id).then(() => reload())
  }

  async function removePayment(x: Payment) {
    if (!window.confirm(`¿Borrar el depósito de ${formatMoney(Number(x.amount))}?`)) return
    setBusy(true)
    await db().from('payments').delete().eq('id', x.id)
    setBusy(false)
    reload()
  }

  async function removeInvoice() {
    if (!invoice || !window.confirm(`¿Borrar la factura #${invoice.number}? Los servicios se quedan; solo se quita la factura.`)) return
    setBusy(true)
    await db().from('invoices').delete().eq('id', invoice.id)
    await db().from('work_orders').update({ status: 'in_progress' }).eq('id', woId)
    setBusy(false)
    reload()
  }

  async function removeNext() {
    if (!window.confirm('¿Borrar el recordatorio de cuándo vuelve?')) return
    await db().from('maintenance_schedules').delete().eq('work_order_id', woId)
    reload()
  }

  // Pedida por internet o con depósito que verificar: eso va primero; si no, cerrado abajo
  // Cita para otro día sin confirmar todavía: lo primero es confirmarla y pedir el depósito
  const later = prDay(a.starts_at) > todayPR() && !done && paid === 0 && !sent && a.status !== 'cancelled'
  const urgent = a.status === 'requested' || reported > 0 || later
  const confirmSummary = [a.status === 'requested' ? 'Sin confirmar' : a.status === 'cancelled' ? 'Cancelada' : 'Confirmada ✓',
    payments.length && !done ? `Depósito ${formatMoney(paid)} ✓` : depAmount > 0 ? `Depósito ${formatMoney(depAmount)}` : null].filter(Boolean).join(' · ')
  const changed = params.get('cambio') === '1'
  const changeMsg = `Hola ${firstName}, te cambié la cita: ahora es el ${formatLongDate(a.starts_at).toLowerCase()} (${formatDate(a.starts_at)}) a las ${formatTime(a.starts_at)}` +
    (a.title ? ` para ${a.title}` : '') + (who ? ` con ${who.name}` : '') + `. Si no te funciona, avísame. 💅 ${sign}`.trimEnd()

  function confirmBlock() {
    return (
      <>
      {/* Confirmar y depósito: cerrado en una línea (abierto si hay algo que hacer) */}
      <details className="group mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-pink-100" open={urgent}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-base font-bold text-slate-900">
          <WhatsAppIcon size={22} /> <span className="min-w-0 flex-1">Confirmar cita y depósito<span className="block truncate text-sm font-semibold text-slate-500">{confirmSummary}</span></span>
          <ChevronDown size={20} className="shrink-0 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4">
      <Step flat title={depAmount > 0 ? 'Confirmar y pedir depósito' : 'Confirmar la cita'} ok={confirmed}>
        {a.status !== 'cancelled' && !done && paid === 0 && (
          <div className="mb-3">
            <p className="mb-2 text-base font-bold text-slate-800">¿Le pides depósito?</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Depósito que le pides">
              {['0', '10', '15', '20', '25'].map((v) => {
                const on = !otherDep && depAmount === Number(v)
                return (
                  <button key={v} type="button" role="radio" aria-checked={on} onClick={() => { setOtherDep(false); setAskDep(v) }}
                    className={`min-h-12 min-w-14 rounded-full px-4 text-base font-bold ${on ? 'bg-pink-600 text-white' : 'bg-pink-50 text-pink-800'}`}>{v === '0' ? 'No' : `$${v}`}</button>
                )
              })}
              <button type="button" role="radio" aria-checked={otherDep || ![0, 10, 15, 20, 25].includes(depAmount)} onClick={() => { setOtherDep(true); setAskDep('') }}
                className={`min-h-12 rounded-full px-4 text-base font-bold ${otherDep || ![0, 10, 15, 20, 25].includes(depAmount) ? 'bg-pink-600 text-white' : 'bg-pink-50 text-pink-800'}`}>Otro</button>
            </div>
            {otherDep && <Input aria-label="Depósito ($)" inputMode="decimal" autoFocus placeholder="$" value={askDep ?? ''} onChange={(e) => setAskDep(e.target.value)} className="mt-2" />}
            {depAmount > 0 && !mech.ath_movil_number && (
              <div className="mt-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                <p className="text-sm font-bold text-amber-900">¿A qué número de ATH Móvil te lo envía? (se guarda para siempre)</p>
                <div className="mt-2 flex gap-2">
                  <Input aria-label="Tu número de ATH Móvil" type="tel" inputMode="tel" placeholder="787-555-0100" value={athInput} onChange={(e) => setAthInput(e.target.value)} className="flex-1" />
                  <button type="button" disabled={busy || athInput.replace(/\D/g, '').length < 7} onClick={async () => {
                    setBusy(true)
                    await db().from('mechanics').update({ ath_movil_number: athInput.trim() }).eq('profile_id', session!.user.id)
                    setBusy(false)
                    reload()
                  }} className="min-h-12 shrink-0 rounded-xl bg-pink-600 px-4 text-base font-bold text-white disabled:bg-slate-300">Guardar</button>
                </div>
              </div>
            )}
          </div>
        )}
        {a.status === 'requested' ? (
          <>
            <p className="flex items-center gap-2 text-base font-bold text-amber-900"><Globe size={20} /> {(a as unknown as { source?: string }).source === 'online' ? 'La pidió por internet. ' : ''}Todavía no está confirmada.</p>
            <button type="button" onClick={() => { saveAsked(); onActivate(); if (c.phone) window.open(whatsappLink(c.phone, confirmMsg), '_blank') }}
              className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-extrabold text-white active:bg-emerald-700">
              <Check /> Confirmar cita{depAmount > 0 ? ' y pedir depósito' : ''}{c.phone ? ' por WhatsApp' : ''}
            </button>
            {/* No hay espacio a esa hora: se deniega y se le ofrece otra */}
            <button type="button" onClick={() => {
              if (!window.confirm('¿Denegar esta cita? Queda cancelada.')) return
              onDeny()
              if (c.phone) window.open(whatsappLink(c.phone, `Hola ${firstName}, lo siento, no tengo espacio el ${formatLongDate(a.starts_at).toLowerCase()} a las ${formatTime(a.starts_at)}. ¿Te funciona otro día u hora? 💅 ${sign}`.trim()), '_blank')
            }}
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-base font-bold text-red-700 ring-2 ring-red-200 active:bg-red-50">
              <XCircle size={20} /> No puedo esa hora (denegar)
            </button>
          </>
        ) : link.client_ok_at ? (
          <>
            <p className="mb-3 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-base font-bold text-emerald-800"><CheckCircle2 size={22} /> {firstName} aceptó la cita el {formatDate(link.client_ok_at).slice(0, 5)} a las {formatTime(link.client_ok_at)}</p>
            <a href={citaLink} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 text-base font-bold text-pink-700"><ExternalLink size={18} /> Ver lo que ella ve</a>
          </>
        ) : a.status === 'cancelled' ? (
          <p className="text-base font-bold text-red-700">Esta cita está cancelada. Si fue un error, toca “Activar” arriba.</p>
        ) : (
          <button type="button" onClick={confirmWhatsApp}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-lg font-bold text-white">
            <WhatsAppIcon size={24} /> {depAmount > 0 ? `Confirmar y pedir ${formatMoney(depAmount)}` : 'Confirmar por WhatsApp'}
          </button>
        )}
      </Step>

      <Step flat title="Depósito" hint="opcional" ok={payments.length > 0}>
        {reported > 0 && (
          <div className="mb-3 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-base font-bold text-amber-900">{firstName} dice que envió {formatMoney(reported)} por ATH Móvil.</p>
            <p className="text-sm text-amber-900">Mira tu ATH Móvil y confírmalo.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={depositArrived} className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-emerald-600 text-base font-bold text-white active:bg-emerald-700"><Check size={20} /> Sí, me llegó</button>
              <button type="button" disabled={busy} onClick={depositMissing} className="min-h-12 rounded-xl bg-white text-base font-bold text-red-700 ring-1 ring-red-200 active:bg-red-50">No me ha llegado</button>
            </div>
          </div>
        )}
        {payments.length === 0 && <p className="text-base text-slate-500">{done ? 'No dejó depósito.' : depAmount > 0 ? `Cuando te envíe los ${formatMoney(depAmount)}, anótalo aquí.` : 'Si te deja algo para separar la cita, anótalo aquí.'}</p>}
        {payments.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {payments.map((x) => (
              <li key={x.id} className="flex min-h-12 items-center gap-2">
                <span className="min-w-0 flex-1 text-base text-slate-800">{formatDate(x.paid_at).slice(0, 5)} · {methodLabel(x)}</span>
                <span className="text-base font-bold text-emerald-700">{formatMoney(Number(x.amount))}</span>
                {!done && (
                  <button type="button" disabled={busy} onClick={() => removePayment(x)} aria-label={`Borrar depósito de ${formatMoney(Number(x.amount))}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-red-600 active:bg-red-50"><Trash2 size={20} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!done && (
          <button type="button" disabled={busy} onClick={() => setDepositOpen(true)}
            className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-pink-700 ring-2 ring-pink-300 active:bg-pink-50">
            <Banknote size={22} /> Cobrar depósito{(Number(link.deposit_asked) || depAmount) > 0 ? ` de ${formatMoney(Number(link.deposit_asked) || depAmount)}` : ''}
          </button>
        )}
      </Step>

        </div>
      </details>

      </>
    )
  }

  return (
    <>
      {changed && (
        <section className="mb-3 rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="text-lg font-extrabold text-emerald-900">Cita cambiada ✓</p>
          <p className="mt-1 text-base text-emerald-900">¿Le avisas a {firstName} del cambio?</p>
          {c.phone && (
            <a href={whatsappLink(c.phone, changeMsg)} target="_blank" rel="noreferrer" onClick={() => setParams({}, { replace: true })}
              className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-lg font-bold text-white"><WhatsAppIcon size={24} /> Avisarle del cambio</a>
          )}
          <button type="button" onClick={() => setParams({}, { replace: true })} className="mt-2 min-h-11 w-full text-base font-bold text-emerald-800">No hace falta</button>
        </section>
      )}

      {/* La cita, compacta: cuándo, con quién y los botones (el nombre ya está arriba) */}
      <section className="rounded-3xl bg-white p-3 shadow-[0_8px_30px_-18px_rgba(157,23,77,0.45)] ring-1 ring-pink-100">
        <div className="text-lg font-extrabold leading-tight text-slate-900">{formatLongDate(a.starts_at)} · {formatTime(a.starts_at)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
          <span>{minutesLabel(a.duration_min)}</span>
          {who && <span className="flex items-center gap-1 font-bold" style={{ color: who.color }}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: who.color }} />Con {who.name}</span>}
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.style}`}>{st.label}</span>
          <Link to={`/clientes/${c.id}`} className="font-semibold text-pink-700">Ver su ficha</Link>
        </div>
        {a.notes && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{a.notes}</p>}
        <div className="mt-2 flex gap-2">
          {c.phone && <a href={telLink(c.phone)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-bold bg-sky-50 text-sky-700"><Phone size={18} /> Llamar</a>}
          <button type="button" onClick={onEdit} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-bold bg-pink-50 text-pink-700"><CalendarClock size={18} /> Cambiar</button>
          {a.status === 'cancelled'
            ? <button type="button" onClick={onActivate} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-bold bg-emerald-50 text-emerald-700"><Check size={18} /> Activar</button>
            : <button type="button" onClick={onCancel} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-bold bg-red-50 text-red-600"><XCircle size={18} /> Cancelar</button>}
        </div>
      </section>

      {urgent && confirmBlock()}

      {/* Lo primero: la cuenta (los precios) y cobrar */}
      <Step title="La cuenta" ok={parts.length > 0 && !unpriced}>
        <div className="-mx-4 overflow-hidden border-y border-pink-100">
          <div className="divide-y divide-dashed divide-slate-200 px-4">
            {parts.length === 0 && <p className="py-4 text-base text-slate-500">Todavía no hay servicios. Toca “Añadir servicio”.</p>}
            {parts.map((x) => !done && !(Number(x.unit_cost) > 0) ? (
              <div key={x.id} className="py-2">
                <div className="flex min-h-14 items-center gap-3">
                  <button type="button" onClick={() => setEdit(x)} className="min-w-0 flex-1 text-left text-base font-bold text-slate-900">{x.description}</button>
                  <div className="relative w-32 shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-extrabold text-slate-400">$</span>
                    <Input id={`precio-${x.id}`} aria-label={`Precio de ${x.description}`} inputMode="decimal" placeholder="Precio" value={prices[x.id] ?? ''}
                      onChange={(e) => setPrices((m) => ({ ...m, [x.id]: e.target.value }))} onBlur={flushPrices}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      className="pl-7 text-right text-lg! font-extrabold" />
                  </div>
                </div>
                {data.last[x.description] && prices[x.id] === undefined && (
                  <button type="button" onClick={() => setPrices((m) => ({ ...m, [x.id]: String(data.last[x.description]) }))}
                    className="mt-1 rounded-full bg-pink-50 px-3 py-1 text-sm font-bold text-pink-700 active:bg-pink-100">Última vez: {formatMoney(data.last[x.description])} · usar</button>
                )}
              </div>
            ) : (
              <button key={x.id} type="button" disabled={done} onClick={() => setEdit(x)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
                <span className="min-w-0 flex-1 text-base font-bold text-slate-900">{x.description}</span>
                {Number(x.unit_cost) > 0
                  ? <span className="shrink-0 text-lg font-bold text-slate-900">{formatMoney(Number(x.qty) * Number(x.unit_cost))}</span>
                  : <span className="shrink-0 rounded-full bg-pink-50 px-3 py-1 text-sm font-bold text-pink-700">Poner precio</span>}
              </button>
            ))}
          </div>
          {!done && (
            <button type="button" onClick={() => setAddOpen(true)} className="flex min-h-14 w-full items-center gap-2 border-t border-slate-100 px-4 text-base font-bold text-pink-700 active:bg-pink-50">
              <Plus size={22} /> Añadir servicio
            </button>
          )}
          <div className="border-t-2 border-slate-100 bg-slate-50 px-4 py-3">
            {(totals.ivu > 0 || !done) && (
              <div className="flex items-center justify-between py-1 text-base text-slate-600">
                <span>Subtotal</span><span>{formatMoney(totals.labor + totals.parts)}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-1 text-base text-slate-600">
              {done ? <span>IVU {percent(mech.ivu_rate)}</span> : (
                <label className="flex items-center gap-2">
                  <input type="checkbox" role="switch" aria-label="Cobrar IVU" checked={wo.charge_ivu_labor} onChange={(e) => setIvu(e.target.checked)} className="h-5 w-5 accent-pink-600" />
                  IVU {percent(mech.ivu_rate)}
                </label>
              )}
              <span>{formatMoney(totals.ivu)}</span>
            </div>
            {payments.length > 0 && !done && payments.map((x) => (
              <div key={x.id} className="flex justify-between py-1 text-base text-emerald-700">
                <span>Depósito {formatDate(x.paid_at).slice(0, 5)}</span><span>−{formatMoney(Number(x.amount))}</span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-lg font-extrabold text-slate-900">{payments.length && !done ? 'Falta' : 'Total'}</span>
              <span className="text-3xl font-extrabold text-slate-900" aria-label="Total de la cuenta">{!done && totals.total <= 0 ? '—' : formatMoney(payments.length && !done ? balance : due)}</span>
            </div>
          </div>
        </div>
        {!done && parts.length > 0 && <p className="mt-2 text-sm text-slate-500">Toca un servicio para cambiarle el precio o quitarlo.</p>}
      </Step>

      {/* 4 · Cobrar */}
      <Step title="Cobrar" ok={done}>
        {!done ? (
          <>
            <button type="button" disabled={busy || (balance <= 0 && !unpriced)} onClick={async () => {
              if (unpriced) { document.getElementById(`precio-${unpriced.id}`)?.focus(); return }
              await flushPrices()
              setPayOpen(true)
            }}
              className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-xl font-extrabold text-white shadow-lg shadow-emerald-900/20 active:bg-emerald-700 disabled:bg-slate-300 disabled:shadow-none">
              {unpriced ? <>Falta el precio de “{unpriced.description}”</> : balance > 0 ? <>Cobrar {formatMoney(balance)}</> : 'Añade lo que vas a cobrar'}
            </button>
            {invoice ? (
              <div className="mt-3 space-y-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
                <p className="text-base font-bold text-amber-900">Factura #{invoice.number} hecha · pendiente de cobrar</p>
                {c.phone && (
                  <a href={whatsappLink(c.phone, `Hola ${firstName}, aquí está tu factura #${invoice.number} por ${formatMoney(Number(invoice.total))}: ${window.location.origin}/d/${invoice.public_token} . ${sign}`.trim())} target="_blank" rel="noreferrer"
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-base font-bold text-white"><WhatsAppIcon size={22} /> Enviar factura por WhatsApp</a>
                )}
                <Link to={`/d/${invoice.public_token}`} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-base font-bold text-slate-800 ring-1 ring-slate-200"><ExternalLink size={18} /> Ver factura o PDF</Link>
                {payments.length === 0 && (
                  <button type="button" disabled={busy} onClick={removeInvoice} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-bold text-red-700 active:bg-red-50">
                    <Trash2 size={18} /> Borrar factura
                  </button>
                )}
              </div>
            ) : !unpriced && totals.total > 0 && (
              <button type="button" disabled={busy} onClick={invoiceLater}
                className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-slate-700 ring-2 ring-slate-200 active:bg-slate-50">
                <Receipt size={22} /> Hacer factura y cobrar después
              </button>
            )}
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <p className="flex items-center gap-2 text-xl font-extrabold text-emerald-800"><CheckCircle2 /> Pagada el {formatDate(invoice?.paid_at ?? payments.at(-1)?.paid_at ?? wo.created_at)}</p>
              <p className="mt-1 text-base text-emerald-900">
                {formatMoney(paid)}{payments.length ? ` · ${payments.map(methodLabel).filter((v, i, arr) => arr.indexOf(v) === i).join(' y ')}` : ''}
                {tips > 0 && <> · propina {formatMoney(tips)}</>}
              </p>
            </div>
            <button type="button" disabled={busy} onClick={unmarkPaid} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-bold text-red-700 active:bg-red-50">
              <Trash2 size={18} /> Deshacer el pago
            </button>
          </>
        )}
      </Step>

      {/* Recién cobrada: ¿la próxima cita? (no es obligatorio) */}
      {done && !data.next && !skipNext && (
        <section className="mt-4 rounded-3xl bg-pink-50 p-4 ring-1 ring-pink-200">
          <p className="text-lg font-extrabold text-slate-900">¿Le hacemos la próxima cita a {firstName}?</p>
          <Link to={`/citas/nueva?clienta=${c.id}`} className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 text-lg font-bold text-white active:bg-pink-700">
            <Plus size={22} /> Hacer la próxima cita
          </Link>
          {remindOpen ? (
            <div className="mt-3 rounded-2xl bg-white p-3"><NextService boatId={a.boats.id} workOrderId={woId} defaultService={parts[0]?.description ?? 'Su próxima cita'} onSaved={reload} title="" /></div>
          ) : (
            <button type="button" onClick={() => setRemindOpen(true)} className="mt-2 min-h-12 w-full rounded-2xl bg-white text-base font-bold text-pink-700 ring-1 ring-pink-200">Recordarle en unas semanas</button>
          )}
          <button type="button" onClick={() => setSkipNext(true)} className="mt-2 min-h-11 w-full text-base font-bold text-slate-500">Ahora no</button>
        </section>
      )}

      {/* 5 · Recibo */}
      {done && invoice && <Step title="Enviarle el recibo" ok>
        {done && invoice ? (
          <div className="space-y-2">
            {c.phone && (
              <a href={whatsappLink(c.phone, receiptMsg)} target="_blank" rel="noreferrer" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-lg font-bold text-white">
                <WhatsAppIcon size={24} /> Enviar recibo por WhatsApp
              </a>
            )}
            <Link to={`/d/${invoice.public_token}`} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-slate-800 ring-2 ring-slate-200">
              <ExternalLink size={20} /> Ver recibo o PDF
            </Link>
          </div>
        ) : <p className="text-base text-slate-500">Cuando cobres, aquí le envías el recibo.</p>}
      </Step>}

      {!urgent && confirmBlock()}

      {/* 6 · Cuándo vuelve */}
      <details className="group mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-pink-100">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-base font-bold text-slate-900">
          <CalendarClock size={22} className="text-pink-700" /> <span className="flex-1">¿Cuándo vuelve?{data.next ? ` · ${formatDate(data.next.due_date).slice(0, 5)}` : ''}</span>
          <span className="text-sm font-semibold text-slate-400">opcional</span> <ChevronDown size={20} className="text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4">
        {data.next ? (
          <>
            <div className="flex min-h-12 items-center gap-2">
              <CalendarClock size={22} className="shrink-0 text-pink-700" />
              <span className="min-w-0 flex-1 text-base text-slate-800"><b>{data.next.service_type}</b> · {formatDate(data.next.due_date)}</span>
              <button type="button" onClick={removeNext} aria-label="Borrar cuándo vuelve" className="flex h-11 w-11 items-center justify-center rounded-full text-red-600 active:bg-red-50"><Trash2 size={20} /></button>
            </div>
            <Link to={`/citas/nueva?clienta=${c.id}`} className="mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 text-lg font-bold text-white active:bg-pink-700">
              <Plus size={22} /> Hacerle la próxima cita
            </Link>
          </>
        ) : (
          <NextService boatId={a.boats.id} workOrderId={woId} defaultService={parts[0]?.description ?? 'Su próxima cita'} onSaved={reload} title="" />
        )}
        </div>
      </details>

      {/* Fotos: opcional */}
      <details className="group mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-pink-100">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-base font-bold text-slate-900">
          <Camera size={22} className="text-pink-700" /> <span className="flex-1">Fotos antes y después {photos.length ? `(${photos.length})` : ''}</span>
          <span className="text-sm font-semibold text-slate-400">opcional</span> <ChevronDown size={20} className="text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4"><PhotoSection workOrderId={woId} photos={photos} onChange={reload} only={['before', 'after']} /></div>
      </details>

      <DepositSheet open={depositOpen} hasAth={Boolean(mech.ath_movil_number)} suggested={Number(link.deposit_asked) || depAmount} onClose={() => setDepositOpen(false)}
        onSave={async (method, amount) => { await addPayment(woId, amount, method, 0); setDepositOpen(false); reload() }} />
      <CheckoutSheet open={payOpen} balance={balance} hasAth={Boolean(mech.ath_movil_number)} onClose={() => setPayOpen(false)} onPay={receive} />
      <AddServiceSheet open={addOpen} menu={menu} busy={busy} onClose={() => setAddOpen(false)} onAdd={addLine} />
      <LineSheet part={edit} busy={busy} onClose={() => setEdit(null)} onSave={saveLine} onRemove={removeLine} />
    </>
  )
}

async function lastPrices(parts: Part[], woId: string): Promise<Record<string, number>> {
  const names = parts.filter((x) => !(Number(x.unit_cost) > 0)).map((x) => x.description)
  if (!names.length) return {}
  const { data } = await db().from('work_order_parts').select('description, unit_cost, work_order_id').in('description', names).gt('unit_cost', 0).order('created_at', { ascending: false }).limit(100)
  const out: Record<string, number> = {}
  for (const r of (data ?? []) as { description: string; unit_cost: number; work_order_id: string }[]) {
    if (r.work_order_id !== woId && out[r.description] === undefined) out[r.description] = Number(r.unit_cost)
  }
  return out
}

/** Un paso de la visita: número (o ✓ si ya se hizo), título y lo que se hace ahí. */
function Step({ title, hint, ok, flat, children }: { title: string; hint?: string; ok: boolean; flat?: boolean; children: React.ReactNode }) {
  return (
    <section className={flat ? 'mt-3' : 'mt-4 rounded-3xl bg-white p-4 shadow-[0_8px_30px_-18px_rgba(157,23,77,0.45)] ring-1 ring-pink-100'}>
      <h2 className={`mb-3 flex items-center gap-3 ${flat ? 'text-lg' : 'text-xl'} font-extrabold text-slate-900`}>
        {ok && <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={18} /></span>}
        <span className="flex-1">{title}</span>
        {hint && <span className="text-sm font-semibold text-slate-400">{hint}</span>}
      </h2>
      {children}
    </section>
  )
}

/** Cobrar: el total grande, la propina con un toque, cómo pagó y un solo botón. */
function CheckoutSheet({ open, balance, hasAth, onClose, onPay }: {
  open: boolean; balance: number; hasAth: boolean; onClose: () => void; onPay: (m: Method, amount: number, tip: number, giftCode?: string) => Promise<void>
}) {
  const [method, setMethod] = useState<Method>('ath_movil')
  const [gift, setGift] = useState(false)
  const [code, setCode] = useState('')
  const [cards, setCards] = useState<{ code: string; balance: number; recipient_name: string | null }[] | null>(null)
  const [find, setFind] = useState('')
  // Las tarjetas que todavía tienen dinero (la más nueva primero)
  useEffect(() => {
    if (!gift || cards) return
    db().from('gift_cards').select('code, balance, recipient_name').gt('balance', 0).order('sold_at', { ascending: false }).limit(100)
      .then(({ data }) => setCards((data ?? []) as { code: string; balance: number; recipient_name: string | null }[]))
  }, [gift, cards])
  const [tip, setTip] = useState(0)
  const [otherTip, setOtherTip] = useState('')
  const [part, setPart] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setMethod(hasAth ? 'ath_movil' : 'cash')
    setGift(false)
    setCode('')
    setCards(null)
    setFind('')
    setTip(0)
    setOtherTip('')
    setPart(null)
    setError('')
  }, [open, hasAth])

  const tipValue = gift ? 0 : otherTip ? num(otherTip) ?? 0 : tip
  const amount = part !== null ? num(part) ?? 0 : balance
  const total = Math.round((amount + tipValue) * 100) / 100

  async function save() {
    if (!(amount > 0)) return setError('Escribe cuánto te dio.')
    if (gift && code.trim().length < 4) return setError('Escoge la tarjeta de regalo.')
    setBusy(true)
    setError('')
    try {
      await onPay(gift ? 'other' : method, Math.min(amount, balance), tipValue, gift ? code : undefined)
    } catch (e) {
      setError(e instanceof Error && /tarjeta/i.test(e.message) ? e.message : 'No se pudo guardar el pago. Revisa la señal e intenta otra vez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title="Cobrar" onClose={onClose}>
      <div className="space-y-5">
        <div className="rounded-3xl bg-pink-50 py-4 text-center">
          <div className="text-sm font-bold uppercase tracking-wider text-pink-700">{part !== null ? 'Te dio' : 'La cuenta'}</div>
          <div className="text-4xl font-extrabold text-slate-900">{formatMoney(amount)}</div>
          {part === null ? (
            <button type="button" onClick={() => setPart(balance.toFixed(2))} className="mt-1 text-sm font-bold text-pink-700 underline">¿Te dio solo una parte?</button>
          ) : (
            <div className="mx-auto mt-2 w-48">
              <Input aria-label="¿Cuánto te dio?" inputMode="decimal" autoFocus value={part} onChange={(e) => setPart(e.target.value)} onFocus={(e) => { const box = e.currentTarget; setTimeout(() => box.select(), 0) }} className="text-center text-2xl! font-extrabold" />
              {amount > 0 && amount < balance && <p className="mt-1 text-sm font-bold text-amber-800">Le quedan {formatMoney(balance - amount)}</p>}
            </div>
          )}
        </div>

        {!gift && <div>
          <div className="mb-2 text-base font-extrabold text-slate-800">Propina <span className="font-semibold text-slate-400">(opcional)</span></div>
          <div className="grid grid-cols-4 gap-2">
            {[0, 3, 5, 10].map((t) => {
              const on = !otherTip && tip === t
              return (
                <button key={t} type="button" onClick={() => { setTip(t); setOtherTip('') }} aria-pressed={on}
                  className={`min-h-14 rounded-2xl text-lg font-extrabold transition ${on ? 'bg-pink-600 text-white shadow-md' : 'bg-slate-100 text-slate-700'}`}>
                  {t === 0 ? 'No' : `$${t}`}
                </button>
              )
            })}
          </div>
          <Input aria-label="Otra propina" inputMode="decimal" value={otherTip} onChange={(e) => setOtherTip(e.target.value)} placeholder="Otra cantidad" className="mt-2 text-center" />
        </div>}

        <div>
          <div className="mb-2 text-base font-extrabold text-slate-800">¿Cómo pagó?</div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="¿Cómo pagó?">
            {METHODS.map((m) => {
              const on = !gift && method === m.value
              const Icon = m.icon
              return (
                <button key={m.value} type="button" role="radio" aria-checked={on} onClick={() => { setMethod(m.value); setGift(false) }}
                  className="flex min-h-16 items-center justify-center gap-2 rounded-2xl text-base font-bold transition"
                  style={on ? { backgroundColor: m.color, color: '#fff' } : { backgroundColor: '#f1f5f9', color: '#334155' }}>
                  <Icon size={24} /> {m.label}
                </button>
              )
            })}
            <button type="button" role="radio" aria-checked={gift} onClick={() => setGift(true)}
              className="flex min-h-16 items-center justify-center gap-2 rounded-2xl text-base font-bold transition"
              style={gift ? { backgroundColor: '#db2777', color: '#fff' } : { backgroundColor: '#f1f5f9', color: '#334155' }}>
              <Gift size={24} /> Tarjeta de regalo
            </button>
          </div>
          {gift && (
            <div className="mt-3">
              <div className="mb-2 text-base font-extrabold text-slate-800">¿Cuál tarjeta?</div>
              {cards && cards.length > 5 && (
                <Input aria-label="Buscar tarjeta" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Buscar por nombre o código" className="mb-2" />
              )}
              {cards === null ? <p className="text-base text-slate-500">Buscando…</p> : cards.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-3 text-base text-slate-600">No hay tarjetas de regalo con dinero. Véndelas en Más → Tarjetas de regalo.</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto" role="radiogroup" aria-label="¿Cuál tarjeta?">
                  {cards.filter((c) => !find.trim() || `${c.code} ${c.recipient_name ?? ''}`.toLowerCase().includes(find.trim().toLowerCase())).map((c) => {
                    const on = code === c.code
                    return (
                      <button key={c.code} type="button" role="radio" aria-checked={on} onClick={() => setCode(c.code)}
                        className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left ${on ? 'bg-pink-600 text-white' : 'bg-pink-50 text-slate-900'}`}>
                        <Gift size={22} className={on ? 'text-white' : 'text-pink-600'} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-bold">{c.recipient_name ? `Para ${c.recipient_name}` : 'Tarjeta de regalo'}</span>
                          <span className={`block font-mono text-sm ${on ? 'text-white/85' : 'text-slate-500'}`}>{c.code}</span>
                        </span>
                        <span className="shrink-0 text-lg font-extrabold">{formatMoney(Number(c.balance))}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <button type="button" disabled={busy} onClick={save}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-xl font-extrabold text-white active:bg-emerald-700 disabled:opacity-60">
          <CheckCircle2 /> {busy ? 'Guardando…' : `Cobrar ${formatMoney(total)}`}
        </button>
        {tipValue > 0 && <p className="-mt-3 text-center text-sm text-slate-500">Incluye {formatMoney(tipValue)} de propina para la empleada</p>}
        <Button variant="ghost" onClick={onClose}>No cobrar ahora</Button>
      </div>
    </Sheet>
  )
}

/** Depósito: la cantidad que ella quiera (antes de la cita o al llegar) y cómo pagó. Se resta al cobrar. */
function DepositSheet({ open, hasAth, suggested = 0, onClose, onSave }: { open: boolean; hasAth: boolean; suggested?: number; onClose: () => void; onSave: (m: Method, amount: number) => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('ath_movil')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    // El depósito que se le pidió ya viene puesto (para que no se olvide cuánto era)
    setAmount(suggested > 0 ? String(suggested) : '')
    setMethod(hasAth ? 'ath_movil' : 'cash')
    setError('')
  }, [open, hasAth, suggested])
  const value = num(amount) ?? 0

  async function save() {
    if (!(value > 0)) return setError('Escribe cuánto te dio de depósito.')
    setBusy(true)
    setError('')
    try {
      await onSave(method, value)
    } catch {
      setError('No se pudo guardar. Revisa la señal e intenta otra vez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title="Cobrar depósito" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-extrabold text-slate-400">$</span>
            <Input aria-label="Depósito ($)" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="pl-10 text-2xl! font-extrabold" />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[10, 20, 25, 50].map((v) => (
              <button key={v} type="button" onClick={() => setAmount(String(v))} aria-pressed={value === v}
                className={`min-h-12 rounded-2xl text-lg font-extrabold ${value === v ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-700'}`}>${v}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-base font-extrabold text-slate-800">¿Cómo pagó?</div>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="¿Cómo pagó el depósito?">
            {METHODS.map((m) => {
              const on = method === m.value
              const Icon = m.icon
              return (
                <button key={m.value} type="button" role="radio" aria-checked={on} onClick={() => setMethod(m.value)}
                  className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl text-base font-bold transition"
                  style={on ? { backgroundColor: m.color, color: '#fff' } : { backgroundColor: '#f1f5f9', color: '#334155' }}>
                  <Icon size={26} /> {m.label}
                </button>
              )
            })}
          </div>
        </div>
        <p className="text-sm text-slate-500">Se resta solo cuando le cobres el resto.</p>
        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <button type="button" disabled={busy} onClick={save}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 text-xl font-extrabold text-white active:bg-pink-700 disabled:opacity-60">
          <CheckCircle2 /> {busy ? 'Guardando…' : value > 0 ? `Guardar depósito ${formatMoney(value)}` : 'Guardar depósito'}
        </button>
      </div>
    </Sheet>
  )
}

/** Añadir a la cuenta: del menú con un toque, u otro servicio con su precio. */
function AddServiceSheet({ open, menu, busy, onClose, onAdd }: { open: boolean; menu: SalonService[]; busy: boolean; onClose: () => void; onAdd: (name: string, price: number) => void }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  useEffect(() => { if (open) { setName(''); setPrice('') } }, [open])
  return (
    <Sheet open={open} title="Añadir servicio" onClose={onClose}>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-slate-50">
        {menu.map((m) => (
          <button key={m.id} type="button" disabled={busy} onClick={() => onAdd(m.name, Number(m.last_price ?? 0))} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-pink-50">
            <Plus size={20} className="shrink-0 text-pink-600" />
            <span className="min-w-0 flex-1 text-base font-bold text-slate-900">{m.name}</span>
            {m.last_price != null && <span className="shrink-0 text-base font-bold text-slate-600">{formatMoney(Number(m.last_price))}</span>}
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-pink-50 p-3">
        <div className="mb-2 text-base font-extrabold text-pink-900">Otro servicio</div>
        <div className="flex gap-2">
          <Input aria-label="Nombre del servicio" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Diseño especial" className="flex-1" />
          <Input aria-label="Precio" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" className="w-24! text-center" />
        </div>
        <Button disabled={busy || name.trim().length < 2} onClick={() => onAdd(name.trim(), num(price) ?? 0)} className="mt-2 bg-pink-600! active:bg-pink-700!">Añadir</Button>
      </div>
    </Sheet>
  )
}

/** Cambiar el precio (o el nombre) de un servicio de la cuenta, o quitarlo. */
function LineSheet({ part, busy, onClose, onSave, onRemove }: { part: Part | null; busy: boolean; onClose: () => void; onSave: (p: Part, name: string, price: number) => void; onRemove: (p: Part) => void }) {
  return (
    <Sheet open={Boolean(part)} title="¿Cuánto es?" onClose={onClose}>
      {/* Con key: cada servicio empieza con su nombre y su precio (no se queda el del anterior) */}
      {part && <LineForm key={part.id} part={part} busy={busy} onSave={onSave} onRemove={onRemove} />}
    </Sheet>
  )
}

function LineForm({ part, busy, onSave, onRemove }: { part: Part; busy: boolean; onSave: (p: Part, name: string, price: number) => void; onRemove: (p: Part) => void }) {
  const [name, setName] = useState(part.description)
  const [price, setPrice] = useState(Number(part.unit_cost) > 0 ? String(Number(part.unit_cost)) : '')
  return (
    <div className="space-y-3">
      <Input aria-label="Servicio" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-extrabold text-slate-400">$</span>
        <Input aria-label="Precio ($)" inputMode="decimal" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="pl-10 text-2xl! font-extrabold" />
      </div>
      <Button disabled={busy || name.trim().length < 2} onClick={() => onSave(part, name.trim(), num(price) ?? 0)} className="bg-pink-600! active:bg-pink-700!"><Check /> Guardar precio</Button>
      <Button variant="ghost" disabled={busy} onClick={() => onRemove(part)} className="text-red-700!"><Trash2 size={20} /> Quitar de la cuenta</Button>
    </div>
  )
}
