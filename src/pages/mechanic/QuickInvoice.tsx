import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Banknote, CheckCircle2, CreditCard, ExternalLink, Package, Plus, ScrollText, Search, Ship, Smartphone, Trash2, UserPlus, Wrench, X, Zap, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { db } from '../../lib/db'
import { PAYMENT_METHODS } from '../../lib/catalog'
import { formatMoney } from '../../lib/format'
import { whatsappLink } from '../../lib/links'
import { computeTotals, percent } from '../../lib/totals'
import type { Invoice } from '../../lib/types'
import { num } from '../../lib/useLoad'
import { useMechanic } from '../../lib/useMechanic'
import { WhatsAppIcon } from '../../components/BrandIcons'
import type { CatalogItem } from '../../components/PartSheet'
import { Sheet } from '../../components/Sheet'
import { BackTitle, Button, Choice, ErrorBox, Field, Input, LinkButton, Loading, Toggle, type Tone } from '../../components/ui'

interface ClientRow { id: string; full_name: string; phone: string | null; boats: { id: string; name: string }[] }
type Pick = { kind: 'boat'; boatId: string; clientId: string } | { kind: 'client'; clientId: string } | { kind: 'new' } | null
interface Line { key: number; kind: 'service' | 'part'; desc: string; price: string }

const PAY_ICONS: Record<string, { icon: LucideIcon; tone: Tone }> = {
  ath_movil: { icon: Smartphone, tone: 'orange' },
  cash: { icon: Banknote, tone: 'green' },
  check: { icon: ScrollText, tone: 'blue' },
  other: { icon: CreditCard, tone: 'violet' },
}

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
  const [payMethod, setPayMethod] = useState<NonNullable<Invoice['payment_method']>>('ath_movil')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ woId: string; invoice: Invoice; phone: string | null; first: string; boat: string; paid: boolean } | null>(null)

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
  const myPrice = (kind: Line['kind'], desc: string) =>
    catalog.find((c) => c.mechanic_id && c.kind === kind && plain(c.name) === plain(desc.trim()))?.last_price ?? null
  const suggestions = (kind: Line['kind']) => {
    const mine = catalog.filter((c) => c.kind === kind && c.mechanic_id).sort((a, b) => b.use_count - a.use_count).map((c) => c.name)
    const common = catalog.filter((c) => c.kind === kind && !c.mechanic_id).map((c) => c.name)
    return [...new Set([...mine, ...common])]
  }

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => {
      if (l.key !== key) return l
      const next = { ...l, ...patch }
      // Si escoge algo que ya cobró antes y no ha puesto precio, el precio sale solo
      if (patch.desc !== undefined && !l.price) {
        const p = myPrice(next.kind, next.desc)
        if (p != null) next.price = String(p)
      }
      return next
    }))
  }

  const filled = lines.filter((l) => l.desc.trim() && (num(l.price) ?? 0) > 0)
  const totals = computeTotals(
    { labor_hours: 0, labor_rate: 0, charge_ivu_labor: ivu, charge_ivu_parts: ivu },
    filled.map((l) => ({ qty: 1, unit_cost: num(l.price) ?? 0, supplied_by: 'mechanic' as const, kind: l.kind })),
    mech?.ivu_rate ?? 0.115,
  )

  function check(): string | null {
    if (!pick) return 'Escoge el cliente o toca “Cliente nuevo”.'
    if (pick.kind === 'new' && newClient.full_name.trim().length < 2) return 'Escribe el nombre del cliente.'
    if (filled.length === 0) return 'Añade por lo menos una línea con su precio.'
    return null
  }

  /** Crea cliente y bote (si hacen falta), el trabajo terminado, sus líneas y la factura. */
  async function createAll(paid: boolean) {
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
        const b = await db().from('boats').insert({ client_id: clientId, name: boatName.trim() || `Bote de ${first}` }).select('id').single()
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
      await Promise.all(filled.map((l) => db().rpc('remember_catalog_item', { p_kind: l.kind, p_name: l.desc.trim(), p_price: num(l.price) })))
      const inv = await db().rpc('create_invoice', { p_wo: woId })
      if (inv.error) throw inv.error
      if (paid) {
        await db().from('invoices').update({ paid_at: now, payment_method: payMethod }).eq('id', inv.data as string)
        await db().from('work_orders').update({ status: 'paid' }).eq('id', woId)
      }
      const { data: invoice } = await db().from('invoices').select('*').eq('id', inv.data as string).single()
      setPayOpen(false)
      setDone({ woId, invoice: invoice as Invoice, phone, first, boat: boatName.trim() || chosenBoat?.name || `Bote de ${first}`, paid })
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
    const payText = done.paid ? ' ¡Gracias por tu pago!'
      : mech.ath_movil_number ? ` Puedes pagar por ATH Móvil al ${mech.ath_movil_number}, o en efectivo o cheque.` : ' El pago es en efectivo o cheque.'
    const msg = `Hola ${done.first}, aquí está la factura #${done.invoice.number} del bote ${done.boat} por ${formatMoney(Number(done.invoice.total))}: ${link}?pago=${way} .${payText} ${profile?.full_name ?? ''}`.trim()
    return (
      <>
        <BackTitle to="/trabajos">Factura rápida</BackTitle>
        <div className="space-y-4 rounded-3xl bg-emerald-50 p-5 text-center ring-1 ring-emerald-200">
          <CheckCircle2 size={56} className="mx-auto text-emerald-600" />
          <p className="text-2xl font-extrabold text-emerald-900">Factura #{done.invoice.number}</p>
          <p className="text-3xl font-extrabold text-navy-900">{formatMoney(Number(done.invoice.total))}</p>
          <p className="text-base font-semibold text-emerald-900">{done.paid ? 'Pagada ✓' : 'Falta cobrar'}</p>
        </div>
        <div className="mt-4 space-y-3">
          {done.phone && (
            <div className="flex"><LinkButton href={whatsappLink(done.phone, msg)} external variant="whatsapp"><WhatsAppIcon size={24} /> Enviar factura por WhatsApp</LinkButton></div>
          )}
          <div className="flex"><LinkButton href={`/d/${done.invoice.public_token}?pago=${way}`}><ExternalLink size={20} /> Ver / imprimir factura</LinkButton></div>
          <Button variant="secondary" onClick={() => navigate(`/trabajos/${done.woId}`)}>Abrir el trabajo</Button>
          <Button variant="ghost" onClick={() => navigate('/trabajos')}>Listo</Button>
        </div>
      </>
    )
  }

  return (
    <>
      <BackTitle to="/trabajos" subtitle="Sin cita ni estimado: cobra en el momento">Factura rápida</BackTitle>
      <div className="space-y-5">
        {/* 1. ¿A quién? */}
        <Field label="1. ¿A quién le cobras?">
          {pick && pick.kind !== 'new' && chosen ? (
            <div className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-navy-800 bg-navy-50 px-4 py-2">
              <Ship size={24} className="shrink-0 text-navy-700" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold text-navy-900">{chosen.full_name}</div>
                <div className="truncate text-base text-slate-600">{chosenBoat?.name ?? 'Bote nuevo'}</div>
              </div>
              <button type="button" onClick={() => setPick(null)} aria-label="Cambiar cliente" className="flex h-12 w-12 items-center justify-center text-slate-600"><X /></button>
            </div>
          ) : pick?.kind === 'new' ? (
            <div className="space-y-3 rounded-xl border-2 border-navy-200 bg-navy-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-navy-900">Cliente nuevo</span>
                <button type="button" onClick={() => setPick(null)} aria-label="Cancelar cliente nuevo" className="flex h-10 w-10 items-center justify-center text-slate-600"><X /></button>
              </div>
              <Input autoComplete="off" value={newClient.full_name} onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })} placeholder="Nombre del cliente *" />
              <Input type="tel" inputMode="tel" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder="Teléfono / WhatsApp" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input type="search" aria-label="Buscar cliente" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, bote o teléfono" className="pl-12" />
              </div>
              {results.map((r) => (
                <button key={r.key} type="button" onClick={() => setPick(r.pick)} className="flex min-h-14 w-full items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-left active:bg-slate-50">
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
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy-700 text-lg font-bold text-navy-800 active:bg-navy-50"
              >
                <UserPlus /> Cliente nuevo
              </button>
            </div>
          )}
        </Field>
        {pick && pick.kind !== 'boat' && (
          <Field label="Bote o jet ski (opcional)">
            <Input value={boatName} onChange={(e) => setBoatName(e.target.value)} placeholder="Si lo dejas vacío: “Bote de …”" />
          </Field>
        )}

        {/* 2. Qué se hizo */}
        <Field label="2. ¿Qué hiciste?" hint="Sale en la factura. Si lo dejas vacío, se usan las líneas de abajo.">
          <Input value={workDone} onChange={(e) => setWorkDone(e.target.value)} placeholder="Cambio de impeller y prueba del motor" />
        </Field>

        {/* 3. Lo que se cobra */}
        <div role="group" aria-label="Lo que cobras">
          <span className="mb-1.5 block text-base font-semibold text-slate-800">3. ¿Qué cobras?</span>
          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={l.key} className="rounded-2xl bg-white p-3 shadow-[0_6px_24px_-14px_rgba(8,47,73,0.35)] ring-1 ring-slate-200/80">
                <div className="mb-2 flex items-center gap-2">
                  {(['service', 'part'] as const).map((k) => (
                    <button key={k} type="button" onClick={() => setLine(l.key, { kind: k })} aria-pressed={l.kind === k}
                      className={`flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-bold ${l.kind === k ? 'bg-navy-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {k === 'service' ? <Wrench size={14} /> : <Package size={14} />} {k === 'service' ? 'Servicio' : 'Pieza'}
                    </button>
                  ))}
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Quitar línea ${i + 1}`} className="ml-auto flex h-10 w-10 items-center justify-center text-slate-400">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <Input aria-label={`Descripción ${i + 1}`} list={`qi-${l.kind}`} value={l.desc} onChange={(e) => setLine(l.key, { desc: e.target.value })} placeholder={l.kind === 'service' ? 'Mano de obra' : 'Impeller'} />
                  <Input aria-label={`Precio ${i + 1}`} inputMode="decimal" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} placeholder="$" className="text-right" />
                </div>
              </div>
            ))}
          </div>
          <datalist id="qi-service">{suggestions('service').map((n) => <option key={n} value={n} />)}</datalist>
          <datalist id="qi-part">{suggestions('part').map((n) => <option key={n} value={n} />)}</datalist>
          <button type="button" onClick={() => setLines((ls) => [...ls, newLine(ls.length ? 'part' : 'service')])}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy-700 text-base font-bold text-navy-800 active:bg-navy-50">
            <Plus size={20} /> Otra línea
          </button>
        </div>

        {/* Total */}
        <div className="rounded-2xl bg-navy-900 p-4 text-white">
          <div className="flex justify-between text-base text-white/80"><span>Subtotal</span><span>{formatMoney(totals.labor + totals.parts)}</span></div>
          <div className="flex justify-between text-base text-white/80"><span>IVU {percent(mech.ivu_rate)}</span><span>{formatMoney(totals.ivu)}</span></div>
          <div className="mt-1 flex items-center justify-between"><span className="text-lg font-extrabold">TOTAL</span><span className="text-3xl font-extrabold text-orange-300">{formatMoney(totals.total)}</span></div>
        </div>
        <Toggle checked={ivu} onChange={setIvu} label={`Cobrar IVU (${percent(mech.ivu_rate)})`} />

        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-base font-semibold text-red-800">{error}</p>}

        <div className="space-y-3 pb-4">
          <Button disabled={busy} onClick={() => createAll(false)}><Zap /> {busy ? 'Haciendo factura…' : 'Hacer factura'}</Button>
          <Button disabled={busy} onClick={() => { const p = check(); if (p) setError(p); else setPayOpen(true) }} className="bg-emerald-700! active:bg-emerald-800!">
            <CheckCircle2 /> Ya me pagó
          </Button>
          <p className="text-center text-sm text-slate-500">Para trabajos grandes con estimado, usa <Link to="/citas/nueva" className="font-bold text-navy-700 underline">Hacer cita</Link>.</p>
        </div>
      </div>

      <Sheet open={payOpen} title="¿Cómo te pagó?" onClose={() => setPayOpen(false)}>
        <div className="space-y-3">
          <Choice value={payMethod} onChange={setPayMethod} options={PAYMENT_METHODS.map((m) => ({ ...m, ...PAY_ICONS[m.value] }))} />
          <Button disabled={busy} onClick={() => createAll(true)} className="bg-emerald-700! active:bg-emerald-800!"><CheckCircle2 /> {busy ? 'Guardando…' : 'Guardar pago'}</Button>
          <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancelar</Button>
        </div>
      </Sheet>
    </>
  )
}
