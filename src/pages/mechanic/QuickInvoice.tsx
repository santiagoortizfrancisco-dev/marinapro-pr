import { JOB_IDEAS, useWords } from '../../lib/trade'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { CheckCircle2, ExternalLink, Plus, Search, Ship, Trash2, UserPlus, X, Zap } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { db } from '../../lib/db'
import { addPayment } from '../../lib/money'
import { formatDate, formatMoney } from '../../lib/format'
import { whatsappLink } from '../../lib/links'
import { computeTotals, percent } from '../../lib/totals'
import type { Invoice } from '../../lib/types'
import { num } from '../../lib/useLoad'
import { useMechanic } from '../../lib/useMechanic'
import { WhatsAppIcon } from '../../components/BrandIcons'
import type { CatalogItem } from '../../components/PartSheet'
import PaySheet from '../../components/PaySheet'
import { BackTitle, Button, ErrorBox, Input, LinkButton, Loading } from '../../components/ui'

interface ClientRow { id: string; full_name: string; phone: string | null; boats: { id: string; name: string }[] }
type Pick = { kind: 'boat'; boatId: string; clientId: string } | { kind: 'client'; clientId: string } | { kind: 'new' } | null
interface Line { key: number; kind: 'service' | 'part'; desc: string; price: string }

function plain(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

let nextKey = 1
const newLine = (kind: Line['kind'] = 'service'): Line => ({ key: nextKey++, kind, desc: '', price: '' })

/**
 * Factura rápida: sin cita ni estimado. Cliente (o uno nuevo), qué se hizo, lo que se cobra y listo.
 * Queda guardado como un trabajo terminado con su factura, igual que los demás.
 */
export default function QuickInvoice() {
  const tw = useWords()
  const navigate = useNavigate()
  const { session, profile } = useAuth()
  const { data: mech, loading, error: mechError } = useMechanic()
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [pick, setPick] = useState<Pick>(null)
  const [search, setSearch] = useState('')
  const [newClient, setNewClient] = useState({ full_name: '', phone: '' })
  const [boatName, setBoatName] = useState('')
  const [workDone, setWorkDone] = useState('')
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [ivu, setIvu] = useState(true)
  const [payOpen, setPayOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ woId: string; invoice: Invoice; phone: string | null; first: string; boat: string; paid: number } | null>(null)

  useEffect(() => {
    db().from('clients').select('id, full_name, phone, boats(id, name)').order('full_name').then(({ data }) => setClients((data ?? []) as unknown as ClientRow[]))
    db().from('catalog_items').select('*').then(({ data }) => setCatalog((data ?? []) as CatalogItem[]))
  }, [])
  useEffect(() => {
    if (mech) setIvu(mech.ivu_on_labor)
  }, [mech])

  // Buscar cliente por nombre, bote o teléfono
  const results = useMemo(() => {
    if (!clients) return []
    const term = plain(search.trim())
    const digits = term.replace(/\D/g, '')
    const rows: { key: string; title: string; sub: string; pick: Pick }[] = []
    for (const c of clients) {
      const match = (s: string | null) => !term || plain(s ?? '').includes(term)
      const phoneMatch = digits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digits)
      if (c.boats.length === 0 && (match(c.full_name) || phoneMatch)) rows.push({ key: c.id, title: c.full_name, sub: c.phone ?? '', pick: { kind: 'client', clientId: c.id } })
      for (const b of c.boats) {
        if (match(c.full_name) || match(b.name) || phoneMatch) rows.push({ key: b.id, title: `${c.full_name} · ${b.name}`, sub: c.phone ?? '', pick: { kind: 'boat', boatId: b.id, clientId: c.id } })
      }
    }
    return rows.slice(0, term ? 12 : 5)
  }, [clients, search])

  const chosen = pick && pick.kind !== 'new' ? clients?.find((c) => c.id === pick.clientId) ?? null : null
  const chosenBoat = pick?.kind === 'boat' ? chosen?.boats.find((b) => b.id === pick.boatId) ?? null : null

  // Precio guardado del mecánico para lo que escribe (ej. "Cambio de impeller" → $150)
  const myPrice = (_kind: Line['kind'], desc: string) =>
    catalog.find((c) => c.mechanic_id && plain(c.name) === plain(desc.trim()))?.last_price ?? null
  /** Si ya lo tiene guardado como pieza, sigue siendo pieza; si no, cuenta como servicio (mano de obra). */
  const kindOf = (desc: string): Line['kind'] => catalog.find((c) => c.mechanic_id && plain(c.name) === plain(desc.trim()))?.kind ?? 'service'
  const suggestions = (kind: Line['kind']) => {
    const mine = catalog.filter((c) => c.kind === kind && c.mechanic_id).sort((a, b) => b.use_count - a.use_count).map((c) => c.name)
    const common = catalog.filter((c) => c.kind === kind && !c.mechanic_id).map((c) => c.name)
    return [...new Set([...mine, ...common])]
  }

  /** Añade una línea nueva (si la única línea está vacía, la usa) y pone el cursor para escribir. */
  function addLine(kind: Line['kind']) {
    const line = newLine(kind)
    setLines((ls) => (ls.length === 1 && !ls[0].desc && !ls[0].price ? [line] : [...ls, line]))
    setTimeout(() => document.getElementById(`qi-desc-${line.key}`)?.focus(), 50)
  }

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => {
      if (l.key !== key) return l
      const next = { ...l, ...patch }
      // Si escoge algo que ya cobró antes y no ha puesto precio, el precio sale solo
      if (patch.desc !== undefined) next.kind = kindOf(next.desc)
      if (patch.desc !== undefined && !l.price) {
        const p = myPrice(next.kind, next.desc)
        if (p != null) next.price = String(p)
      }
      return next
    }))
  }

  // Todo lo que escribió va en la factura, tenga precio o no (sin precio sale como "Incluido")
  const filled = lines.filter((l) => l.desc.trim())
  const noName = lines.findIndex((l) => !l.desc.trim() && (num(l.price) ?? 0) > 0)
  const totals = computeTotals(
    { labor_hours: 0, labor_rate: 0, charge_ivu_labor: ivu, charge_ivu_parts: ivu },
    filled.map((l) => ({ qty: 1, unit_cost: num(l.price) ?? 0, supplied_by: 'mechanic' as const, kind: l.kind })),
    mech?.ivu_rate ?? 0.115,
  )

  function check(): string | null {
    if (!pick) return 'Escoge el cliente o toca “Cliente nuevo”.'
    if (pick.kind === 'new' && newClient.full_name.trim().length < 2) return 'Escribe el nombre del cliente.'
    if (noName >= 0) return `Escribe qué es la línea ${noName + 1} (tiene precio pero no dice qué es).`
    if (filled.length === 0) return 'Escribe por lo menos una cosa de lo que cobras.'
    if (totals.total <= 0) return 'Pon el precio por lo menos en una línea.'
    return null
  }

  /** Crea cliente y bote (si hacen falta), el trabajo terminado, sus líneas y la factura. */
  /** paid: lo que le dio hoy (todo, una parte o nada). */
  async function createAll(paid = 0, method: NonNullable<Invoice['payment_method']> = 'cash') {
    const problem = check()
    if (problem) return setError(problem)
    if (!mech) return
    setError('')
    setBusy(true)
    try {
      let clientId = pick!.kind === 'new' ? '' : pick!.clientId
      let boatId = pick!.kind === 'boat' ? pick!.boatId : ''
      const owner = pick!.kind === 'new' ? newClient.full_name.trim() : chosen?.full_name ?? ''
      const phone = pick!.kind === 'new' ? newClient.phone.trim() || null : chosen?.phone ?? null
      if (pick!.kind === 'new') {
        const c = await db().from('clients').insert({ mechanic_id: session!.user.id, full_name: owner, phone }).select('id').single()
        if (c.error) throw c.error
        clientId = (c.data as { id: string }).id
      }
      const first = owner.split(' ')[0] || 'cliente'
      if (!boatId) {
        const b = await db().from('boats').insert({ client_id: clientId, name: boatName.trim() || tw.itemOf(first) }).select('id').single()
        if (b.error) throw b.error
        boatId = (b.data as { id: string }).id
      }
      const now = new Date().toISOString()
      const w = await db().from('work_orders').insert({
        boat_id: boatId,
        status: 'done',
        work_done: workDone.trim() || filled.map((l) => l.desc.trim()).join(', '),
        labor_hours: 0,
        labor_rate: mech.labor_rate_hour,
        charge_ivu_labor: ivu,
        charge_ivu_parts: ivu,
        sea_trial_required: false,
        estimate_approved_at: now,
        estimate_approved_by: 'mechanic',
        approval_seen_at: now,
        policies_accepted_version: mech.policies_version,
        completed_at: now,
      }).select('id').single()
      if (w.error) throw w.error
      const woId = (w.data as { id: string }).id
      const p = await db().from('work_order_parts').insert(filled.map((l) => ({
        work_order_id: woId, kind: l.kind, description: l.desc.trim(), qty: 1, unit_cost: num(l.price) ?? 0,
        supplied_by: 'mechanic', received_at: l.kind === 'part' ? now : null,
      })))
      if (p.error) throw p.error
      // Sus precios quedan guardados para la próxima vez
      await Promise.all(filled.map((l) => db().rpc('remember_catalog_item', { p_kind: l.kind, p_name: l.desc.trim(), p_price: (num(l.price) ?? 0) > 0 ? num(l.price) : null })))
      const inv = await db().rpc('create_invoice', { p_wo: woId })
      if (inv.error) throw inv.error
      // Lo que le dio (todo o una parte): si completa el total, la factura queda pagada sola
      if (paid > 0) await addPayment(woId, paid, method)
      const { data: invoice } = await db().from('invoices').select('*').eq('id', inv.data as string).single()
      setPayOpen(false)
      setDone({ woId, invoice: invoice as Invoice, phone, first, boat: boatName.trim() || chosenBoat?.name || tw.itemOf(first), paid })
    } catch (e) {
      console.error(e)
      setError('No se pudo hacer la factura. Revisa la señal e intenta otra vez.')
    } finally {
      setBusy(false)
    }
  }

  if (loading || !clients) return <Loading />
  if (mechError || !mech) return <ErrorBox message={mechError || 'No se encontraron los datos del negocio.'} />

  // Listo: enviar por WhatsApp (el toque del mecánico abre WhatsApp; así el teléfono no lo bloquea)
  if (done) {
    const way = mech.ath_movil_number ? 'any' : 'cash'
    const link = `${window.location.origin}/d/${done.invoice.public_token}`
    const total = Number(done.invoice.total)
    const left = Math.max(0, Math.round((total - done.paid) * 100) / 100)
    const payText = done.paid > 0 && left <= 0.004 ? ' ¡Gracias por tu pago!'
      : (done.paid > 0 ? ` Recibí ${formatMoney(done.paid)}; queda un balance de ${formatMoney(left)}.` : '') + (mech.ath_movil_number ? ` Puedes pagar por ATH Móvil al ${mech.ath_movil_number}, o en efectivo o cheque.` : ' El pago es en efectivo o cheque.')
    const msg = `Hola ${done.first}, aquí está la factura #${done.invoice.number} ${tw.delItem} ${done.boat} por ${formatMoney(Number(done.invoice.total))}: ${link}?pago=${way} .${payText} ${profile?.full_name ?? ''}`.trim()
    return (
      <>
        <BackTitle to="/trabajos">Factura rápida</BackTitle>
        <div className="space-y-4 rounded-3xl bg-emerald-50 p-5 text-center ring-1 ring-emerald-200">
          <CheckCircle2 size={56} className="mx-auto text-emerald-600" />
          <p className="text-2xl font-extrabold text-emerald-900">Factura #{done.invoice.number}</p>
          <p className="text-3xl font-extrabold text-navy-900">{formatMoney(Number(done.invoice.total))}</p>
          <p className="text-base font-semibold text-emerald-900">{done.paid > 0 && left <= 0.004 ? 'Pagada ✓' : done.paid > 0 ? `Pagó ${formatMoney(done.paid)} · Balance ${formatMoney(left)}` : 'Falta cobrar'}</p>
        </div>
        <div className="mt-4 space-y-3">
          {done.phone && (
            <div className="flex"><LinkButton href={whatsappLink(done.phone, msg)} external variant="whatsapp"><WhatsAppIcon size={24} /> Enviar factura por WhatsApp</LinkButton></div>
          )}
          <div className="flex"><LinkButton href={`/d/${done.invoice.public_token}?pago=${way}`}><ExternalLink size={20} /> Ver factura o PDF</LinkButton></div>
          <Button variant="secondary" onClick={() => navigate(`/trabajos/${done.woId}`)}>Abrir el trabajo</Button>
          <Button variant="ghost" onClick={() => navigate('/trabajos')}>Listo</Button>
        </div>
      </>
    )
  }

  return (
    <>
      <BackTitle>Factura rápida</BackTitle>

      {/* Como una factura de papel: cliente, líneas con su precio y el total */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_24px_-14px_rgba(8,47,73,0.35)] ring-1 ring-slate-200">
        <div className="flex h-2" aria-hidden="true"><span className="flex-[3] bg-navy-800" /><span className="flex-1 bg-[#F37021]" /></div>
        <div className="space-y-5 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-2xl font-extrabold tracking-wide text-navy-900">FACTURA</div>
              <div className="truncate text-sm text-slate-500">{mech.business_name}</div>
            </div>
            <div className="shrink-0 text-right text-base font-semibold text-slate-600">{formatDate(new Date().toISOString())}</div>
          </div>

          {/* Cliente */}
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-navy-700">Cliente</div>
            {pick && pick.kind !== 'new' && chosen ? (
              <div className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-navy-800 bg-navy-50 px-3 py-2">
                <Ship size={22} className="shrink-0 text-navy-700" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold text-navy-900">{chosen.full_name}</div>
                  <div className="truncate text-sm text-slate-600">{chosenBoat?.name ?? tw.newItem}</div>
                </div>
                <button type="button" onClick={() => setPick(null)} aria-label="Cambiar cliente" className="flex h-12 w-12 items-center justify-center text-slate-600"><X /></button>
              </div>
            ) : pick?.kind === 'new' ? (
              <div className="space-y-2 rounded-xl border-2 border-navy-200 bg-navy-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-navy-900">Cliente nuevo</span>
                  <button type="button" onClick={() => setPick(null)} aria-label="Cancelar cliente nuevo" className="flex h-10 w-10 items-center justify-center text-slate-600"><X /></button>
                </div>
                <Input autoComplete="off" value={newClient.full_name} onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })} placeholder="Nombre del cliente *" />
                <Input type="tel" inputMode="tel" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder="Teléfono / WhatsApp" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input type="search" aria-label="Buscar cliente" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar cliente, ${tw.item} o teléfono`} className="pl-12" />
                </div>
                {results.map((r) => (
                  <button key={r.key} type="button" onClick={() => setPick(r.pick)} className="flex min-h-14 w-full items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-left active:bg-slate-50">
                    <Ship size={22} className="shrink-0 text-navy-700" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold text-slate-900">{r.title}</span>
                      {r.sub && <span className="block truncate text-sm text-slate-600">{r.sub}</span>}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setPick({ kind: 'new' }); setNewClient({ full_name: /\d/.test(search) ? '' : search, phone: /\d/.test(search) ? search : '' }) }}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy-700 text-base font-bold text-navy-800 active:bg-navy-50"
                >
                  <UserPlus size={20} /> Cliente nuevo
                </button>
              </div>
            )}
            {pick && pick.kind !== 'boat' && (
              <Input aria-label={tw.Item} className="mt-2" value={boatName} onChange={(e) => setBoatName(e.target.value)} placeholder={tw.marina ? 'Bote o jet ski (opcional)' : `${tw.Item} (opcional)`} />
            )}
          </div>

          {/* Líneas: descripción y precio */}
          <div role="group" aria-label="Lo que cobras">
            <div className="grid grid-cols-[1fr_5.5rem_1.75rem] gap-1 rounded-t-lg bg-navy-50 px-2 py-2 text-xs font-bold uppercase tracking-wide text-navy-800">
              <span>Descripción</span><span className="pr-2 text-right">Precio</span><span />
            </div>
            <div className="divide-y divide-slate-200 border-b border-slate-200">
              {lines.map((l, i) => (
                <div key={l.key} className="grid grid-cols-[1fr_5.5rem_1.75rem] items-center gap-1 px-1">
                  <Input id={`qi-desc-${l.key}`} aria-label={`Descripción ${i + 1}`} list="qi-todo" value={l.desc} onChange={(e) => setLine(l.key, { desc: e.target.value })} placeholder={i === 0 ? JOB_IDEAS[tw.trade][0] : 'Otra cosa'} className="min-h-12! rounded-lg! border-0! bg-transparent! focus:bg-navy-50! px-2! text-base!" />
                  <Input aria-label={`Precio ${i + 1}`} inputMode="decimal" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} placeholder="$0.00" className="min-h-12! rounded-lg! border-0! bg-transparent! focus:bg-navy-50! px-2! text-right font-semibold" />
                  {lines.length > 1 ? (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Quitar línea ${i + 1}`} className="flex h-12 w-7 items-center justify-center text-slate-400 active:text-red-600">
                      <Trash2 size={20} />
                    </button>
                  ) : <span />}
                </div>
              ))}
            </div>
            <datalist id="qi-todo">{[...new Set([...suggestions('service'), ...suggestions('part')])].map((n) => <option key={n} value={n} />)}</datalist>
            <button type="button" onClick={() => addLine('service')} className="mt-2 flex min-h-12 items-center gap-2 px-1 text-base font-bold text-navy-800 active:text-navy-900">
              <Plus size={20} /> Añadir línea
            </button>
            <p className="text-sm text-slate-500">Si una línea no tiene precio, sale como “Incluido”.</p>
          </div>

          {/* Total */}
          <dl className="border-t-2 border-slate-200 pt-3 text-base">
            <div className="flex justify-between py-0.5 text-slate-600"><dt>Subtotal</dt><dd>{formatMoney(totals.labor + totals.parts)}</dd></div>
            <div className="flex items-center justify-between py-0.5 text-slate-600">
              <dt className="flex items-center gap-2">
                IVU {percent(mech.ivu_rate)}
                <button type="button" role="switch" aria-checked={ivu} aria-label={`Cobrar IVU (${percent(mech.ivu_rate)})`} onClick={() => setIvu(!ivu)}
                  className={`flex h-7 w-12 items-center rounded-full p-1 transition ${ivu ? 'bg-navy-800' : 'bg-slate-300'}`}>
                  <span className={`h-5 w-5 rounded-full bg-white shadow transition ${ivu ? 'translate-x-5' : ''}`} />
                </button>
              </dt>
              <dd>{formatMoney(totals.ivu)}</dd>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-xl bg-navy-900 px-4 py-3 text-white">
              <dt className="text-lg font-extrabold">TOTAL</dt>
              <dd className="text-3xl font-extrabold text-orange-300">{formatMoney(totals.total)}</dd>
            </div>
          </dl>

          <details>
            <summary className="cursor-pointer py-1 text-base font-bold text-navy-700">Nota en la factura (opcional)</summary>
            <Input className="mt-2" aria-label="Nota en la factura" value={workDone} onChange={(e) => setWorkDone(e.target.value)} placeholder={`Ej.: ${JOB_IDEAS[tw.trade][0]}`} />
          </details>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-100 p-3 text-base font-semibold text-red-800">{error}</p>}

      <div className="mt-4 space-y-3 pb-2">
        <Button disabled={busy} onClick={() => createAll()}><Zap /> {busy ? 'Haciendo…' : 'Hacer factura'}</Button>
        <Button disabled={busy} onClick={() => { const p = check(); if (p) setError(p); else setPayOpen(true) }} className="bg-emerald-700! active:bg-emerald-800!">
          <CheckCircle2 /> Ya me pagó
        </Button>
      </div>
      <p className="pb-4 text-center text-sm text-slate-500">¿Te dio una parte? Toca “Ya me pagó” y cambia la cantidad.</p>

      <PaySheet open={payOpen} balance={totals.total} title="¿Cuánto te pagó?" onClose={() => setPayOpen(false)} onPay={(method, amount) => createAll(amount, method)} />
    </>
  )
}
