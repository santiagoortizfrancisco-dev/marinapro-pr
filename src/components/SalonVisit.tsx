import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Banknote, CalendarClock, Gift, Globe, Receipt, Camera, Check, CheckCircle2, ChevronDown, CreditCard, ExternalLink, Phone, Plus, Smartphone, Trash2, XCircle, type LucideIcon } from 'lucide-react'
import { WhatsAppIcon } from './BrandIcons'
import { useAuth } from '../auth/AuthProvider'
import { APPOINTMENT_STATUS } from '../lib/catalog'
import { db } from '../lib/db'
import { formatDate, formatLongDate, formatMoney, formatTime } from '../lib/format'
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
export default function SalonVisit({ appt: a, woId, onEdit, onCancel, onActivate }: {
  appt: AppointmentFull
  woId: string
  onEdit: () => void
  onCancel: () => void
  onActivate: () => void
}) {
  const { session, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [payOpen, setPayOpen] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [edit, setEdit] = useState<Part | null>(null)
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState<SalonService[]>([])

  const { data, loading, error, reload } = useLoad(async () => {
    const [wo, parts, invoice, mech, next, payments, photos] = await Promise.all([
      db().from('work_orders').select('*').eq('id', woId).single(),
      db().from('work_order_parts').select('*').eq('work_order_id', woId).order('created_at'),
      db().from('invoices').select('*').eq('work_order_id', woId).maybeSingle(),
      db().from('mechanics').select('*').eq('profile_id', session!.user.id).single(),
      db().from('maintenance_schedules').select('service_type, due_date').eq('work_order_id', woId).limit(1),
      db().from('payments').select('*').eq('work_order_id', woId).order('paid_at'),
      db().from('photos').select('*').eq('work_order_id', woId).order('taken_at'),
    ])
    return {
      wo: must(wo) as WorkOrder, parts: must(parts) as Part[], invoice: (invoice.data as Invoice | null) ?? null, mech: must(mech) as Mechanic,
      next: ((next.data ?? [])[0] as { service_type: string; due_date: string } | undefined) ?? null, payments: (payments.data ?? []) as Payment[], photos: (photos.data ?? []) as Photo[],
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

  const { wo, parts, invoice, mech, payments, photos } = data
  const c = a.boats.clients
  const who = (a as unknown as { staff: { name: string; color: string } | null }).staff
  const st = APPOINTMENT_STATUS[a.status]
  const totals = computeTotals(wo, parts, mech.ivu_rate)
  const paid = paidSoFar(payments)
  const tips = payments.reduce((t, p) => t + Number((p as Payment & { tip?: number }).tip ?? 0), 0)
  const done = Boolean(invoice?.paid_at) || wo.status === 'paid'
  const due = invoice && done ? Number(invoice.total) : totals.total
  const balance = done ? 0 : Math.max(0, Math.round((due - paid) * 100) / 100)
  const firstName = c.full_name.split(' ')[0]
  // El precio se pone al cobrar (cambia por persona): el primer servicio que todavía no tiene precio
  const unpriced = parts.find((p) => !(Number(p.unit_cost) > 0)) ?? null
  const sign = profile?.full_name ?? ''

  const confirmMsg = `Hola ${firstName}, te confirmo tu cita el ${formatLongDate(a.starts_at).toLowerCase()} (${formatDate(a.starts_at)}) a las ${formatTime(a.starts_at)}` +
    (a.title ? ` para ${a.title}` : '') + (who ? ` con ${who.name}` : '') + `. Si no puedes llegar, avísame. ¡Te espero! 💅 ${sign}`.trimEnd()
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

  async function saveLine(p: Part, description: string, price: number) {
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

  return (
    <>
      {a.status === 'requested' && (
        <section className="mb-3 rounded-3xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 text-lg font-extrabold text-amber-900"><Globe size={22} /> {(a as unknown as { source?: string }).source === 'online' ? 'La pidió por internet' : 'Cita pedida'}</p>
          <p className="mt-1 text-base text-amber-900">Todavía no está confirmada. Confírmale para que sepa que la esperas.</p>
          <button type="button" onClick={() => { onActivate(); if (c.phone) window.open(whatsappLink(c.phone, confirmMsg), '_blank') }}
            className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-extrabold text-white active:bg-emerald-700">
            <Check /> Confirmar cita{c.phone ? ' por WhatsApp' : ''}
          </button>
        </section>
      )}

      {/* La cita */}
      <section className="rounded-3xl bg-white p-4 shadow-[0_8px_30px_-18px_rgba(157,23,77,0.45)] ring-1 ring-pink-100">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-pink-600 text-2xl font-extrabold text-white">{initial(c.full_name)}</span>
          <Link to={`/clientes/${c.id}`} className="min-w-0 flex-1">
            <span className="block text-xl font-extrabold leading-tight text-slate-900">{c.full_name}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${st.style}`}>{st.label}</span><span className="text-sm font-semibold text-pink-700">Ver su ficha</span></span>
          </Link>
        </div>
        <div className="mt-4 rounded-2xl bg-pink-50 p-3">
          <div className="text-lg font-extrabold text-slate-900">{formatLongDate(a.starts_at)}</div>
          <div className="text-base text-slate-700">{formatTime(a.starts_at)} · {minutesLabel(a.duration_min)}</div>
          {who && (
            <div className="mt-1 flex items-center gap-2 text-base font-bold" style={{ color: who.color }}>
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: who.color }} /> Con {who.name}
            </div>
          )}
          {a.notes && <p className="mt-2 whitespace-pre-line text-base text-slate-700">{a.notes}</p>}
        </div>
        <div className="mt-3 flex">
          {c.phone && <Action label="Confirmar" href={whatsappLink(c.phone, confirmMsg)} external icon={<WhatsAppIcon size={26} />} tone="bg-[#25D366] text-white" />}
          {c.phone && <Action label="Llamar" href={telLink(c.phone)} icon={<Phone size={24} />} tone="bg-sky-100 text-sky-700" />}
          <Action label="Mover" onClick={onEdit} icon={<CalendarClock size={24} />} tone="bg-pink-100 text-pink-700" />
          {a.status === 'cancelled'
            ? <Action label="Activar" onClick={onActivate} icon={<Check size={24} />} tone="bg-emerald-100 text-emerald-700" />
            : <Action label="Cancelar" onClick={onCancel} icon={<XCircle size={24} />} tone="bg-red-50 text-red-600" />}
        </div>
      </section>

      {/* La cuenta, como un recibo */}
      <section className="mt-5">
        <h2 className="mb-2 px-1 text-2xl font-extrabold text-slate-900">La cuenta</h2>
        <div className="overflow-hidden rounded-3xl bg-white shadow-[0_8px_30px_-18px_rgba(157,23,77,0.45)] ring-1 ring-pink-100">
          <div className="divide-y divide-dashed divide-slate-200 px-4">
            {parts.length === 0 && <p className="py-4 text-base text-slate-500">Todavía no hay servicios. Toca “Añadir servicio”.</p>}
            {parts.map((p) => (
              <button key={p.id} type="button" disabled={done} onClick={() => setEdit(p)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
                <span className="min-w-0 flex-1 text-base font-bold text-slate-900">{p.description}</span>
                {Number(p.unit_cost) > 0
                  ? <span className="shrink-0 text-lg font-bold text-slate-900">{formatMoney(Number(p.qty) * Number(p.unit_cost))}</span>
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
            {payments.length > 0 && !done && payments.map((p) => (
              <div key={p.id} className="flex justify-between py-1 text-base text-emerald-700">
                <span>Depósito {formatDate(p.paid_at).slice(0, 5)}</span><span>−{formatMoney(Number(p.amount))}</span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-lg font-extrabold text-slate-900">{payments.length && !done ? 'Falta' : 'Total'}</span>
              <span className="text-3xl font-extrabold text-slate-900" aria-label="Total de la cuenta">{!done && totals.total <= 0 ? '—' : formatMoney(payments.length && !done ? balance : due)}</span>
            </div>
          </div>
        </div>

        {!done ? (
          <button type="button" disabled={busy || (balance <= 0 && !unpriced)} onClick={() => (unpriced ? setEdit(unpriced) : setPayOpen(true))}
            className="mt-4 flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-xl font-extrabold text-white shadow-lg shadow-emerald-900/20 active:bg-emerald-700 disabled:bg-slate-300 disabled:shadow-none">
            {unpriced ? <>Ponle precio a “{unpriced.description}”</> : balance > 0 ? <>Cobrar {formatMoney(balance)}</> : 'Añade lo que vas a cobrar'}
          </button>
        ) : null}
        {!done && invoice && (
          <div className="mt-3 space-y-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-base font-bold text-amber-900">Factura #{invoice.number} hecha · pendiente de cobrar</p>
            {c.phone && (
              <a href={whatsappLink(c.phone, `Hola ${firstName}, aquí está tu factura #${invoice.number} por ${formatMoney(Number(invoice.total))}: ${window.location.origin}/d/${invoice.public_token} . ${sign}`.trim())} target="_blank" rel="noreferrer"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-base font-bold text-white"><WhatsAppIcon size={22} /> Enviar factura por WhatsApp</a>
            )}
            <Link to={`/d/${invoice.public_token}`} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-base font-bold text-slate-800 ring-1 ring-slate-200"><ExternalLink size={18} /> Ver factura o PDF</Link>
          </div>
        )}
        {!done && !invoice && !unpriced && totals.total > 0 && (
          <button type="button" disabled={busy} onClick={invoiceLater}
            className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-slate-700 ring-2 ring-slate-200 active:bg-slate-50">
            <Receipt size={22} /> Hacer factura y cobrar después
          </button>
        )}
        {!done && (
          <button type="button" disabled={busy} onClick={() => setDepositOpen(true)}
            className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-pink-700 ring-2 ring-pink-300 active:bg-pink-50">
            <Banknote size={22} /> Cobrar depósito
          </button>
        )}
        {done && (
          <div className="mt-4 space-y-3">
            <div className="rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <p className="flex items-center gap-2 text-xl font-extrabold text-emerald-800"><CheckCircle2 /> Pagada el {formatDate(invoice?.paid_at ?? payments.at(-1)?.paid_at ?? wo.created_at)}</p>
              <p className="mt-1 text-base text-emerald-900">
                {formatMoney(paid)}{payments.length ? ` · ${payments.map((p) => ((p as Payment & { gift_card_id?: string | null }).gift_card_id ? 'Tarjeta de regalo' : METHODS.find((m) => m.value === p.method)?.label ?? 'Cheque')).filter((v, i, arr) => arr.indexOf(v) === i).join(' y ')}` : ''}
                {tips > 0 && <> · propina {formatMoney(tips)}</>}
              </p>
            </div>
            {invoice && c.phone && (
              <a href={whatsappLink(c.phone, receiptMsg)} target="_blank" rel="noreferrer" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-lg font-bold text-white">
                <WhatsAppIcon size={24} /> Enviar recibo por WhatsApp
              </a>
            )}
            {invoice && (
              <Link to={`/d/${invoice.public_token}`} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-slate-800 ring-2 ring-slate-200">
                <ExternalLink size={20} /> Ver recibo o PDF
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Lo opcional: cuándo vuelve y fotos */}
      <section className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-3xl bg-white ring-1 ring-pink-100">
        {done && (data.next ? (
          <div className="flex min-h-14 items-center gap-3 px-4 py-2">
            <CalendarClock size={22} className="shrink-0 text-pink-700" />
            <span className="min-w-0 flex-1"><span className="block text-base font-bold text-slate-900">Vuelve</span><span className="block text-sm text-slate-600">{data.next.service_type} · {formatDate(data.next.due_date)}</span></span>
          </div>
        ) : (
          <details className="group" open>
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-base font-bold text-slate-900">
              <CalendarClock size={22} className="text-pink-700" /> <span className="flex-1">¿Cuándo vuelve?</span> <ChevronDown size={20} className="text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4">
              <NextService boatId={a.boats.id} workOrderId={woId} defaultService={parts[0]?.description ?? 'Su próxima cita'} onSaved={reload} />
            </div>
          </details>
        ))}
        <details className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-base font-bold text-slate-900">
            <Camera size={22} className="text-pink-700" /> <span className="flex-1">Fotos {photos.length ? `(${photos.length})` : ''}</span>
            <span className="text-sm font-semibold text-slate-400">opcional</span> <ChevronDown size={20} className="text-slate-400 transition group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4"><PhotoSection workOrderId={woId} photos={photos} onChange={reload} only={['before', 'after']} /></div>
        </details>
      </section>

      {done && <Button variant="ghost" disabled={busy} onClick={unmarkPaid} className="mt-3">Desmarcar pagada</Button>}

      <DepositSheet open={depositOpen} hasAth={Boolean(mech.ath_movil_number)} onClose={() => setDepositOpen(false)}
        onSave={async (method, amount) => { await addPayment(woId, amount, method, 0); setDepositOpen(false); reload() }} />
      <CheckoutSheet open={payOpen} balance={balance} hasAth={Boolean(mech.ath_movil_number)} onClose={() => setPayOpen(false)} onPay={receive} />
      <AddServiceSheet open={addOpen} menu={menu} busy={busy} onClose={() => setAddOpen(false)} onAdd={addLine} />
      <LineSheet part={edit} busy={busy} onClose={() => setEdit(null)} onSave={saveLine} onRemove={removeLine} />
    </>
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
function DepositSheet({ open, hasAth, onClose, onSave }: { open: boolean; hasAth: boolean; onClose: () => void; onSave: (m: Method, amount: number) => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('ath_movil')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    setAmount('')
    setMethod(hasAth ? 'ath_movil' : 'cash')
    setError('')
  }, [open, hasAth])
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
