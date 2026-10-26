import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AlertTriangle, ExternalLink, FileText, Pencil, Plus, Ship, Trash2, Warehouse } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { WhatsAppIcon } from '../../components/BrandIcons'
import { Sheet, Toast } from '../../components/Sheet'
import StorageSpaces from '../../components/StorageSpaces'
import { BackTitle, Button, CARD, EmptyState, Field, Input, Loading, Select, Textarea } from '../../components/ui'
import { db } from '../../lib/db'
import { addDays, daysUntil, formatDate, formatMoney, todayPR } from '../../lib/format'
import { whatsappLink } from '../../lib/links'
import { basisText, bySpot, priceFor, spotName, spotState, zonePrice, type Basis, type Contract, type Rate, type Spot, type StorageBoat, type Zone } from '../../lib/storage'
import { must, num, useLoad } from '../../lib/useLoad'

type Boat = StorageBoat
interface Charge { id: string; boat_id: string; description: string; qty: number; unit_price: number; charged_on: string }
interface Bill {
  contract_id: string; month: string; work_order_id: string | null
  work_orders: {
    id: string; boats: Boat | null
    invoices: { id: string; number: string; total: number; public_token: string; paid_at: string | null; due_date: string | null; sent_at: string | null }[]
    payments: { amount: number }[]
  } | null
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const firstOf = (day: string) => day.slice(0, 8) + '01'
const nextMonth = (m: string) => firstOf(addDays(m, 32))
const prevMonth = (m: string) => firstOf(addDays(m, -1))

type Tab = 'boats' | 'spaces' | 'bill' | 'rates'

/** Guardería / Marina: los botes guardados (contrato y cargos extra), facturar el mes y la lista de precios. */
export default function Storage() {
  const { session, profile } = useAuth()
  const me = session!.user.id
  // ?tab=bill|rates abre esa parte; ?bote=ID abre el contrato de ese bote (desde su ficha)
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => (['spaces', 'bill', 'rates'].includes(params.get('tab') ?? '') ? params.get('tab') as Tab : 'boats'))
  // Desde un cuadro de Espacios: abrir el contrato de un bote, o uno nuevo con ese espacio
  const [intent, setIntent] = useState<{ boat?: string; spot?: string } | null>(params.get('bote') ? { boat: params.get('bote')! } : params.get('espacio') ? { spot: params.get('espacio')! } : null)
  const [month, setMonth] = useState(firstOf(todayPR()))
  const [toast, setToast] = useState<string | null>(null)
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500) }

  const { data, loading, reload } = useLoad<Data>(async () => {
    const [r, c, ch, b, m, bl, z, sp] = await Promise.all([
      db().from('storage_rates').select('*').order('kind').order('sort'),
      db().from('storage_contracts').select('*, boats(id, name, length_ft, clients(full_name, phone))').order('created_at'),
      db().from('storage_charges').select('*').is('work_order_id', null).order('charged_on'),
      db().from('boats').select('id, name, length_ft, clients(full_name, phone)').order('name'),
      db().from('mechanics').select('storage_due_days, storage_late_fee, ath_movil_number').eq('profile_id', me).maybeSingle(),
      db().from('storage_bills').select('contract_id, month, work_order_id, work_orders(id, boats(id, name, length_ft, clients(full_name, phone)), invoices(id, number, total, public_token, paid_at, due_date, sent_at), payments(amount))').eq('month', month),
      db().from('storage_zones').select('*').order('sort'),
      db().from('storage_spots').select('*').order('sort'),
    ])
    return {
      rates: (r.data ?? []) as Rate[],
      contracts: (c.data ?? []) as unknown as Contract[],
      charges: (ch.data ?? []) as Charge[],
      boats: (b.data ?? []) as unknown as Boat[],
      settings: (m.data ?? { storage_due_days: 10, storage_late_fee: null, ath_movil_number: null }) as Data['settings'],
      bills: (bl.data ?? []) as unknown as Bill[],
      zones: (z.data ?? []) as Zone[],
      spots: bySpot((sp.data ?? []) as Spot[], (z.data ?? []) as Zone[]),
    }
  }, [month])

  // La primera vez: la lista de precios de ejemplo (la cambian a su gusto)
  useEffect(() => {
    if (data && data.rates.length === 0) db().rpc('seed_storage_rates', { p_mech: me }).then(() => reload())
  }, [data?.rates.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loading />
  if (!data) return null

  return (
    <>
      <BackTitle subtitle="Espacios, contratos y la factura del mes">Guardería / Marina</BackTitle>
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Secciones">
        {([['boats', 'Botes'], ['spaces', 'Espacios'], ['bill', 'Facturar'], ['rates', 'Precios']] as [Tab, string][]).map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => { setIntent(null); setTab(v) }}
            className={`min-h-12 flex-1 rounded-full px-2 text-sm font-bold ${tab === v ? 'bg-navy-800 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}>{l}</button>
        ))}
      </div>
      {tab === 'boats' && <BoatsTab key={JSON.stringify(intent)} data={data} me={me} reload={reload} flash={flash} openBoat={intent?.boat ?? null} openSpot={intent?.spot ?? null} />}
      {tab === 'spaces' && <StorageSpaces zones={data.zones} spots={data.spots} contracts={data.contracts} me={me} reload={reload} flash={flash}
        onOpenContract={(boat) => { setIntent({ boat }); setTab('boats') }} />}
      {tab === 'bill' && <BillTab data={data} me={me} month={month} setMonth={setMonth} reload={reload} flash={flash} signature={profile?.full_name ?? ''} />}
      {tab === 'rates' && <RatesTab rates={data.rates} me={me} reload={reload} onlyExtras={data.zones.length > 0} />}
      <Toast message={toast} />
    </>
  )
}

interface Data {
  rates: Rate[]; contracts: Contract[]; charges: Charge[]; boats: Boat[]; bills: Bill[]; zones: Zone[]; spots: Spot[]
  settings: { storage_due_days: number; storage_late_fee: number | null; ath_movil_number: string | null }
}

// ---------------------------------------------------------------------------------------------
function BoatsTab({ data, me, reload, flash, openBoat, openSpot }: { data: Data; me: string; reload: () => void; flash: (m: string) => void; openBoat: string | null; openSpot: string | null }) {
  const [edit, setEdit] = useState<Partial<Contract> | null>(() => {
    if (openSpot) {
      const sp = data.spots.find((x) => x.id === openSpot)
      return { start_date: todayPR(), status: 'active', spot_id: openSpot, space_label: sp ? spotName(sp, data.zones) : null }
    }
    if (!openBoat) return null
    const c = data.contracts.find((x) => x.boat_id === openBoat && x.status === 'active')
    if (c) return c
    const b = data.boats.find((x) => x.id === openBoat)
    const space = data.rates.find((r) => r.kind === 'space' && r.active)
    // Con zonas, el precio sale del espacio que escoja; sin zonas, de la lista de precios
    if (data.zones.length > 0) return { boat_id: openBoat, start_date: todayPR(), status: 'active' }
    return { boat_id: openBoat, start_date: todayPR(), status: 'active', rate_id: space?.id ?? null, monthly_price: space && b ? priceFor(space, b.length_ft) || undefined : undefined }
  })
  const [charging, setCharging] = useState<Contract | null>(null)
  const [showEnded, setShowEnded] = useState(false)
  const today = todayPR()
  const active = data.contracts.filter((c) => c.status === 'active')
  const ended = data.contracts.filter((c) => c.status === 'ended')
  const monthly = active.reduce((t, c) => t + Number(c.monthly_price), 0)

  const alerts = (c: Contract) => {
    const out: string[] = []
    if (c.end_date) {
      const d = daysUntil(c.end_date)
      if (d < 0) out.push(`El contrato venció el ${formatDate(c.end_date)}`)
      else if (d <= 30) out.push(`El contrato vence en ${d} ${d === 1 ? 'día' : 'días'} (${formatDate(c.end_date)})`)
    }
    if (c.insurance_expires) {
      const d = daysUntil(c.insurance_expires)
      if (d < 0) out.push(`El seguro venció el ${formatDate(c.insurance_expires)}`)
      else if (d <= 15) out.push(`El seguro vence en ${d} ${d === 1 ? 'día' : 'días'} (${formatDate(c.insurance_expires)})`)
    }
    return out
  }

  const card = (c: Contract) => {
    const open = data.charges.filter((x) => x.boat_id === c.boat_id)
    const openTotal = open.reduce((t, x) => t + Number(x.qty) * Number(x.unit_price), 0)
    const warn = c.status === 'active' ? alerts(c) : []
    return (
      <article key={c.id} className={`${CARD} p-3 ${c.status === 'ended' ? 'opacity-60' : ''}`} aria-label={`Guardería de ${c.boats?.name ?? 'bote'}`}>
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => setEdit(c)} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-lg font-extrabold text-navy-900">{c.boats?.name ?? 'Bote'}{c.boats?.length_ft ? ` · ${Number(c.boats.length_ft)}'` : ''}</span>
            <span className="block text-sm text-slate-600">{c.boats?.clients?.full_name ?? ''}{c.space_label ? ` · ${c.space_label}` : ''}</span>
            {c.away_since && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-900">En el agua{c.away_spot_id ? ` · ${data.spots.find((x) => x.id === c.away_spot_id)?.label ?? ''}` : ''} (su espacio está reservado)</span>}
            <span className="block text-base font-bold text-slate-900">{formatMoney(Number(c.monthly_price))} al mes{c.status === 'ended' ? ' · terminado' : ''}</span>
          </button>
          <button type="button" onClick={() => setEdit(c)} aria-label={`Cambiar contrato de ${c.boats?.name ?? 'bote'}`} className="flex h-12 w-12 items-center justify-center text-slate-500"><Pencil size={20} /></button>
        </div>
        {warn.map((w) => <p key={w} className="mt-2 flex items-center gap-2 rounded-xl bg-amber-50 p-2 text-sm font-bold text-amber-800"><AlertTriangle size={18} /> {w}</p>)}
        {c.status === 'active' && (
          <div className="mt-2 flex items-center gap-2">
            <span className="flex-1 text-sm text-slate-600">{open.length > 0 ? `Cargos extra para la factura: ${formatMoney(openTotal)}` : 'Sin cargos extra este mes'}</span>
            <button type="button" onClick={() => setCharging(c)} className="flex min-h-12 items-center gap-1 rounded-full bg-navy-800 px-4 text-base font-bold text-white active:bg-navy-900"><Plus size={18} /> Cobro</button>
          </div>
        )}
      </article>
    )
  }

  return (
    <>
      <Button onClick={() => setEdit({ start_date: today, status: 'active' })}><Plus /> Añadir bote a la guardería</Button>
      {active.length === 0 && <div className="mt-4"><EmptyState icon={Warehouse} title="Todavía no hay botes en la guardería" text="Añade cada bote con su espacio y su precio del mes. Después, con un toque, se le cobra la rampa, la noche o la bajada, y el día 1 se le hace la factura del mes." /></div>}
      {active.length > 0 && <p className="mt-4 px-1 text-sm font-bold text-slate-600">{active.length} {active.length === 1 ? 'bote' : 'botes'} · {formatMoney(monthly)} al mes en rentas</p>}
      <div className="mt-2 space-y-2">{active.map(card)}</div>
      {ended.length > 0 && (
        <>
          <button type="button" onClick={() => setShowEnded(!showEnded)} className="mt-4 min-h-12 w-full text-base font-bold text-slate-600">{showEnded ? 'Esconder' : 'Ver'} contratos terminados ({ended.length})</button>
          {showEnded && <div className="space-y-2">{ended.map(card)}</div>}
        </>
      )}
      <ContractSheet edit={edit} setEdit={setEdit} data={data} me={me} reload={reload} />
      <ChargeSheet contract={charging} onClose={() => setCharging(null)} data={data} me={me} reload={reload} flash={flash} />
    </>
  )
}

function ContractSheet({ edit, setEdit, data, me, reload }: { edit: Partial<Contract> | null; setEdit: (c: Partial<Contract> | null) => void; data: Data; me: string; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const spaces = data.rates.filter((r) => r.kind === 'space' && (r.active || r.id === edit?.rate_id))
  const taken = new Set(data.contracts.filter((c) => c.status === 'active' && c.id !== edit?.id).map((c) => c.boat_id))
  const boats = data.boats.filter((b) => !taken.has(b.id))
  const boat = data.boats.find((b) => b.id === edit?.boat_id)
  const set = (patch: Partial<Contract>) => setEdit({ ...edit, ...patch })
  // Al escoger bote o espacio, sugiere el precio (se puede cambiar)
  // Con zonas: el precio sale de la zona del cuadro (pies × precio). Sin zonas: de la lista de Precios.
  const useZones = data.zones.length > 0
  const suggest = (boatId?: string, rateId?: string | null, spotId?: string | null) => {
    const b = data.boats.find((x) => x.id === boatId)
    if (useZones) {
      const sp = data.spots.find((x) => x.id === spotId)
      return zonePrice(data.zones.find((z) => z.id === sp?.zone_id), b?.length_ft ?? null) ?? undefined
    }
    const r = data.rates.find((x) => x.id === rateId)
    return r ? priceFor(r, b?.length_ft ?? null) : undefined
  }

  async function save() {
    if (!edit?.boat_id) return setError('Escoge el bote.')
    if (!edit.id && data.spots.length > 0 && !edit.spot_id) return setError('Escoge su espacio.')
    const price = num(String(edit.monthly_price ?? ''))
    if (price == null || price < 0) return setError('Escribe el precio del mes.')
    setBusy(true)
    setError('')
    const row = {
      boat_id: edit.boat_id, rate_id: edit.rate_id || null, space_label: edit.space_label?.trim() || null, monthly_price: price, spot_id: edit.spot_id ?? null,
      start_date: edit.start_date || todayPR(), end_date: edit.end_date || null, insurance_expires: edit.insurance_expires || null,
      status: edit.status ?? 'active', notes: edit.notes?.trim() || null,
    }
    const res = edit.id ? await db().from('storage_contracts').update(row).eq('id', edit.id) : await db().from('storage_contracts').insert({ ...row, mechanic_id: me })
    setBusy(false)
    // El candado de la base de datos dice por qué (ej. "El espacio A-1 ya está ocupado por La Tranquila")
    if (res.error) return setError(/ocupado|fuera de servicio/.test(res.error.message) ? res.error.message : 'No se pudo guardar. Intenta otra vez.')
    setEdit(null)
    reload()
  }

  return (
    <Sheet open={!!edit} title={edit?.id ? 'Contrato del bote' : 'Bote a la guardería'} onClose={() => setEdit(null)}>
      {edit && (
        <div className="space-y-4">
          <Field label="Bote *">
            {edit.id ? <p className="text-lg font-bold text-navy-900">{boat?.name} · {boat?.clients?.full_name}</p> : (
              <>
                <Select aria-label="Bote" value={edit.boat_id ?? ''} onChange={(e) => set({ boat_id: e.target.value, monthly_price: suggest(e.target.value, edit.rate_id, edit.spot_id) ?? edit.monthly_price })}>
                  <option value="">Escoge…</option>
                  {boats.map((b) => <option key={b.id} value={b.id}>{b.name}{b.length_ft ? ` (${Number(b.length_ft)}')` : ''} · {b.clients?.full_name ?? ''}</option>)}
                </Select>
                <Link to="/clientes" className="mt-2 block text-base font-bold text-navy-700 underline">¿No está? Añade el cliente y su bote (con el largo)</Link>
              </>
            )}
          </Field>
          {!useZones && <Field label="Espacio">
            <Select aria-label="Espacio" value={edit.rate_id ?? ''} onChange={(e) => set({ rate_id: e.target.value || null, monthly_price: suggest(edit.boat_id, e.target.value) ?? edit.monthly_price })}>
              <option value="">Otro</option>
              {spaces.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>}
          {data.spots.length > 0 ? (
            <Field label="Su espacio" hint="Solo salen los libres. El precio sale de su zona.">
              <Select aria-label="Su espacio" value={edit.spot_id ?? ''} onChange={(e) => {
                const sp = data.spots.find((x) => x.id === e.target.value)
                set({ spot_id: sp?.id ?? null, space_label: sp ? spotName(sp, data.zones) : null, monthly_price: suggest(edit.boat_id, edit.rate_id, sp?.id) ?? edit.monthly_price })
              }}>
                <option value="">Escoge su espacio</option>
                {data.spots.filter((sp) => sp.id === edit.spot_id || ['free', 'reserved'].includes(spotState(sp, data.contracts).state)).map((sp) => (
                  <option key={sp.id} value={sp.id}>{spotName(sp, data.zones)}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Número o lugar (opcional)" hint="Ej.: Rack A-12, Muelle C-4. Para usar cuadros, créalos en Espacios.">
              <Input value={edit.space_label ?? ''} onChange={(e) => set({ space_label: e.target.value })} />
            </Field>
          )}
          <Field label="Precio del mes *" hint={boat && !boat.length_ft ? 'Este bote no tiene el largo puesto; escribe el precio' : 'Se calcula con el largo del bote; lo puedes cambiar'}>
            <Input aria-label="Precio del mes" inputMode="decimal" value={edit.monthly_price ?? ''} onChange={(e) => set({ monthly_price: e.target.value as unknown as number })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde"><Input type="date" value={edit.start_date ?? ''} onChange={(e) => set({ start_date: e.target.value })} /></Field>
            <Field label="El contrato termina (opcional)"><Input aria-label="Vence el contrato" type="date" value={edit.end_date ?? ''} onChange={(e) => set({ end_date: e.target.value })} /></Field>
          </div>
          <Field label="El seguro del bote vence (opcional)" hint="Te avisa 15 días antes">
            <Input aria-label="Vence el seguro" type="date" value={edit.insurance_expires ?? ''} onChange={(e) => set({ insurance_expires: e.target.value })} />
          </Field>
          <Field label="Notas (opcional)"><Textarea rows={2} value={edit.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
          {edit.id && (
            <label className="flex min-h-12 items-center gap-3 text-base">
              <input type="checkbox" className="h-6 w-6" checked={edit.status === 'ended'} onChange={(e) => set({ status: e.target.checked ? 'ended' : 'active' })} />
              El bote ya se fue (no se le factura más)
            </label>
          )}
          {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
          <Button disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          {edit.id && (
            <Button variant="ghost" disabled={busy} className="text-red-700!" onClick={async () => {
              const { data: billed } = await db().from('storage_bills').select('month').eq('contract_id', edit.id!).limit(1)
              if (billed && billed.length > 0) return setError('Este contrato ya tiene facturas. Para no perderlas no se borra: marca “El bote ya se fue” y guarda.')
              if (!window.confirm('¿Borrar este contrato?')) return
              const { error } = await db().from('storage_contracts').delete().eq('id', edit.id!)
              if (error) return setError('No se pudo borrar. Intenta otra vez.')
              setEdit(null)
              reload()
            }}><Trash2 size={20} /> Borrar contrato</Button>
          )}
        </div>
      )}
    </Sheet>
  )
}

function ChargeSheet({ contract, onClose, data, me, reload, flash }: { contract: Contract | null; onClose: () => void; data: Data; me: string; reload: () => void; flash: (m: string) => void }) {
  const [desc, setDesc] = useState('')
  const [price, setPrice] = useState('')
  const [day, setDay] = useState(todayPR())
  const [error, setError] = useState('')
  if (!contract) return null
  const ft = contract.boats?.length_ft ?? null
  const extras = data.rates.filter((r) => r.kind === 'extra' && r.active)
  const open = data.charges.filter((x) => x.boat_id === contract.boat_id)

  async function add(description: string, unit_price: number, rate_id: string | null = null) {
    setError('')
    const { error } = await db().from('storage_charges').insert({ mechanic_id: me, boat_id: contract!.boat_id, rate_id, description, qty: 1, unit_price, charged_on: day })
    if (error) return setError('No se pudo añadir. Intenta otra vez.')
    flash(`Añadido: ${description} ${formatMoney(unit_price)}`)
    reload()
  }

  return (
    <Sheet open title={`Cobro a ${contract.boats?.name ?? 'bote'}`} onClose={onClose}>
      <p className="mb-3 text-base text-slate-600">Toca lo que se hizo. Se suma a la próxima factura del mes.</p>
      <div className="grid grid-cols-2 gap-2">
        {extras.map((r) => (
          <button key={r.id} type="button" onClick={() => add(r.name, priceFor(r, ft), r.id)}
            className={`${CARD} flex min-h-16 flex-col items-start justify-center px-3 py-2 text-left active:bg-navy-50`}>
            <span className="text-base font-bold text-navy-900">{r.name}</span>
            <span className="text-sm text-slate-600">{formatMoney(priceFor(r, ft))}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_7rem] gap-2">
        <Input aria-label="Otro cobro" placeholder="Otro cobro…" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <Input aria-label="Precio del cobro" inputMode="decimal" placeholder="$" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="mt-2">
        <Button variant="secondary" onClick={() => {
          const p = num(price)
          if (!desc.trim() || p == null) return setError('Escribe qué es y el precio.')
          add(desc.trim(), p).then(() => { setDesc(''); setPrice('') })
        }}><Plus /> Añadir otro cobro</Button>
      </div>
      <Field label="Fecha del cobro"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
      {error && <p role="alert" className="mt-2 rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
      {open.length > 0 && (
        <section className="mt-4" aria-label="Cobros pendientes">
          <h3 className="mb-1 text-sm font-extrabold uppercase tracking-wider text-slate-500">Para la próxima factura</h3>
          {open.map((x) => (
            <div key={x.id} className="flex items-center gap-2 border-b border-slate-200 py-2 last:border-0">
              <span className="flex-1 text-base">{x.description} <span className="text-sm text-slate-500">· {formatDate(x.charged_on)}</span></span>
              <span className="font-bold">{formatMoney(Number(x.qty) * Number(x.unit_price))}</span>
              <button type="button" aria-label={`Quitar ${x.description}`} className="flex h-12 w-12 items-center justify-center text-red-700" onClick={async () => {
                must(await db().from('storage_charges').delete().eq('id', x.id))
                flash(`Quitado: ${x.description}`)
                reload()
              }}><Trash2 size={20} /></button>
            </div>
          ))}
        </section>
      )}
      <div className="mt-4"><Button variant="ghost" onClick={onClose}>Listo</Button></div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------------------------
function BillTab({ data, me, month, setMonth, reload, flash, signature }: { data: Data; me: string; month: string; setMonth: (m: string) => void; reload: () => void; flash: (m: string) => void; signature: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [due, setDue] = useState(String(data.settings.storage_due_days))
  const [late, setLate] = useState(data.settings.storage_late_fee != null ? String(data.settings.storage_late_fee) : '')
  const billed = new Set(data.bills.map((b) => b.contract_id))
  const next = nextMonth(month)
  const pending = data.contracts.filter((c) => c.status === 'active' && c.start_date < next && (!c.end_date || c.end_date >= month) && !billed.has(c.id))
  const settingsChanged = due !== String(data.settings.storage_due_days) || late !== (data.settings.storage_late_fee != null ? String(data.settings.storage_late_fee) : '')

  const rows = useMemo(() => data.bills.filter((b) => b.work_orders).map((b) => {
    const wo = b.work_orders!
    const inv = wo.invoices[0]
    const paid = wo.payments.reduce((t, p) => t + Number(p.amount), 0)
    return { b, wo, inv, paid }
  }), [data.bills])

  async function bill() {
    setBusy(true)
    setError('')
    const { data: n, error } = await db().rpc('storage_bill_month', { p_month: month })
    setBusy(false)
    if (error) return setError('No se pudo facturar. Intenta otra vez.')
    flash(`${n} ${n === 1 ? 'factura hecha' : 'facturas hechas'}`)
    reload()
  }

  return (
    <>
      <div className="flex items-center gap-2" role="group" aria-label="Mes">
        <button type="button" onClick={() => setMonth(prevMonth(month))} className="min-h-12 rounded-full bg-white px-4 font-bold text-slate-700 ring-1 ring-slate-300">‹</button>
        <p className="flex-1 text-center text-xl font-extrabold capitalize text-navy-900">{monthLabel(month)}</p>
        <button type="button" onClick={() => setMonth(nextMonth(month))} className="min-h-12 rounded-full bg-white px-4 font-bold text-slate-700 ring-1 ring-slate-300">›</button>
      </div>

      <div className={`${CARD} mt-3 p-4`}>
        {pending.length > 0 ? (
          <>
            <p className="mb-3 text-base text-slate-700">{pending.length} {pending.length === 1 ? 'bote' : 'botes'} sin facturar en {monthLabel(month)}. Cada uno lleva la renta y sus cargos extra{data.settings.storage_late_fee != null ? ', y el cargo por atraso si debe una factura vencida' : ''}.</p>
            <Button disabled={busy} onClick={bill}><FileText /> {busy ? 'Facturando…' : `Facturar ${monthLabel(month)}`}</Button>
          </>
        ) : (
          <p className="text-base font-bold text-slate-700">{rows.length > 0 ? `${cap(monthLabel(month))} ya está facturado.` : `No hay botes para facturar en ${monthLabel(month)}.`}</p>
        )}
        {error && <p role="alert" className="mt-2 rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
      </div>

      {rows.length > 0 && (
        <div className="mt-4 space-y-2">
          {rows.map(({ b, wo, inv, paid }) => {
            const c = wo.boats?.clients
            const first = c?.full_name.split(' ')[0] ?? ''
            const link = inv ? `${window.location.origin}/d/${inv.public_token}` : ''
            const msg = inv ? `Hola ${first}, aquí está la factura #${inv.number} de la guardería de ${wo.boats?.name ?? 'tu bote'} (${monthLabel(month)}) por ${formatMoney(Number(inv.total))}${inv.due_date ? `. Vence el ${formatDate(inv.due_date)}` : ''}: ${link} .${data.settings.ath_movil_number ? ` ATH Móvil: ${data.settings.ath_movil_number}.` : ''} ¡Gracias! ${signature}`.trim() : ''
            const isPaid = inv && (inv.paid_at || paid >= Number(inv.total) - 0.004)
            return (
              <article key={b.contract_id} className={`${CARD} p-3`} aria-label={`Factura de ${wo.boats?.name ?? 'bote'}`}>
                <div className="flex items-start gap-2">
                  <Ship className="mt-1 text-navy-700" size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-extrabold text-navy-900">{wo.boats?.name} · {c?.full_name}</span>
                    {inv && <span className="block text-sm text-slate-600">#{inv.number} · {formatMoney(Number(inv.total))}{inv.due_date ? ` · vence ${formatDate(inv.due_date)}` : ''}</span>}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{isPaid ? 'Pagada' : 'Debe'}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  {c?.phone && inv && <a href={whatsappLink(c.phone, msg)} target="_blank" rel="noreferrer" onClick={() => { if (!inv.sent_at) db().from('invoices').update({ sent_at: new Date().toISOString() }).eq('id', inv.id).then(() => reload()) }}
                    className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-base font-bold ${inv.sent_at ? 'bg-white text-emerald-800 ring-2 ring-emerald-300' : 'bg-[#25D366] text-white'}`}><WhatsAppIcon size={20} /> {inv.sent_at ? 'Enviada ✓ (otra vez)' : 'Enviar'}</a>}
                  <Link to={`/trabajos/${wo.id}`} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white text-base font-bold text-slate-800 ring-1 ring-slate-300"><ExternalLink size={18} /> Ver / cobrar</Link>
                </div>
                {paid === 0 && (
                  <button type="button" className="mt-1 min-h-11 w-full text-sm font-bold text-red-700" onClick={async () => {
                    if (!window.confirm('¿Borrar esta factura? Los cargos extra vuelven a quedar pendientes y el mes se puede facturar otra vez.')) return
                    must(await db().from('storage_bills').delete().eq('contract_id', b.contract_id).eq('month', b.month))
                    must(await db().from('work_orders').delete().eq('id', wo.id))
                    flash('Factura borrada')
                    reload()
                  }}>Borrar esta factura (se hizo por error)</button>
                )}
              </article>
            )
          })}
        </div>
      )}

      <section className={`${CARD} mt-5 space-y-3 p-4`} aria-label="Cómo factura la guardería">
        <h2 className="text-base font-extrabold text-navy-900">Cómo factura la guardería</h2>
        <Field label="Días para pagar" hint="La factura vence estos días después del 1 del mes">
          <Input aria-label="Días para pagar" inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Cargo por atraso (opcional)" hint="Se añade a la factura del mes si tiene otra vencida sin pagar. Vacío = no se cobra">
          <Input aria-label="Cargo por atraso" inputMode="decimal" placeholder="$" value={late} onChange={(e) => setLate(e.target.value)} />
        </Field>
        {settingsChanged && <Button variant="secondary" onClick={async () => {
          const d = Math.min(60, Math.max(0, Math.round(num(due) ?? 10)))
          must(await db().from('mechanics').update({ storage_due_days: d, storage_late_fee: num(late) }).eq('profile_id', me))
          flash('Guardado')
          reload()
        }}>Guardar</Button>}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------------------------
function RatesTab({ rates, me, reload, onlyExtras }: { rates: Rate[]; me: string; reload: () => void; onlyExtras: boolean }) {
  const [edit, setEdit] = useState<Partial<Rate> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<Rate>) => setEdit({ ...edit, ...p })

  async function save() {
    if (!edit?.name?.trim()) return setError('Escribe el nombre.')
    const bands = (edit.bands ?? []).map((b) => ({ max_ft: Number(num(String(b.max_ft)) ?? 0), price: Number(num(String(b.price)) ?? 0), ...(b.per_foot ? { per_foot: true } : {}) })).filter((b) => b.max_ft > 0)
    if (edit.basis === 'bands' && bands.length === 0) return setError('Añade por lo menos un tamaño con su precio.')
    const price = num(String(edit.price ?? ''))
    if (edit.basis !== 'bands' && price == null) return setError('Escribe el precio.')
    setBusy(true)
    setError('')
    const row = { name: edit.name.trim(), kind: edit.kind ?? 'space', basis: edit.basis ?? 'flat', price: edit.basis === 'bands' ? null : price, bands: edit.basis === 'bands' ? bands : null, unit: edit.unit?.trim() || 'mes', active: edit.active ?? true }
    const res = edit.id ? await db().from('storage_rates').update(row).eq('id', edit.id) : await db().from('storage_rates').insert({ ...row, mechanic_id: me, sort: rates.length + 1 })
    setBusy(false)
    if (res.error) return setError('No se pudo guardar. Intenta otra vez.')
    setEdit(null)
    reload()
  }

  const list = (kind: 'space' | 'extra', title: string) => (
    <section className="mt-4" aria-label={title}>
      <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wider text-slate-500">{title}</h2>
      <div className="space-y-2">
        {rates.filter((r) => r.kind === kind).map((r) => (
          <button key={r.id} type="button" onClick={() => { setError(''); setEdit(r) }} className={`${CARD} flex min-h-14 w-full items-center gap-2 px-3 py-2 text-left ${r.active ? '' : 'opacity-50'}`}>
            <span className="flex-1"><span className="block text-base font-bold text-navy-900">{r.name}{r.active ? '' : ' (no se usa)'}</span><span className="block text-sm text-slate-600">{basisText(r)}</span></span>
            <Pencil size={18} className="text-slate-400" />
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <>
      {/* Con zonas, la renta de cada espacio sale del precio de su zona: aquí solo los cargos extra */}
      {onlyExtras && <p className="mb-3 rounded-xl bg-navy-50 p-3 text-base text-navy-900">La renta de cada espacio sale del <b>precio de su zona</b> (en Espacios ✏️). Aquí pones los <b>cargos extra</b>: rampa, noche, lavado…</p>}
      <Button onClick={() => { setError(''); setEdit(onlyExtras ? { kind: 'extra', basis: 'flat', unit: 'vez', active: true } : { kind: 'space', basis: 'per_foot', unit: 'mes', active: true }) }}><Plus /> {onlyExtras ? 'Añadir cargo extra' : 'Añadir precio'}</Button>
      {!onlyExtras && list('space', 'Espacios (renta del mes)')}
      {list('extra', 'Cargos extra (un toque)')}
      <Sheet open={!!edit} title={edit?.id ? 'Cambiar precio' : 'Precio nuevo'} onClose={() => setEdit(null)}>
        {edit && (
          <div className="space-y-4">
            <Field label="Nombre *"><Input aria-label="Nombre del precio" value={edit.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Guardería en seco (rack)" /></Field>
            {!onlyExtras && <Field label="Es">
              <Select aria-label="Tipo de precio" value={edit.kind} onChange={(e) => set({ kind: e.target.value as Rate['kind'], unit: e.target.value === 'space' ? 'mes' : edit.unit === 'mes' ? 'vez' : edit.unit })}>
                <option value="space">Un espacio (renta del mes)</option>
                <option value="extra">Un cargo extra (rampa, noche, lavado…)</option>
              </Select>
            </Field>}
            <Field label="Se cobra">
              <Select aria-label="Cómo se cobra" value={edit.basis} onChange={(e) => set({ basis: e.target.value as Basis, bands: e.target.value === 'bands' && !edit.bands?.length ? [{ max_ft: 20, price: 0 }, { max_ft: 30, price: 0 }] : edit.bands })}>
                <option value="per_foot">Por pie del bote</option>
                <option value="flat">Precio fijo</option>
                <option value="bands">Por tamaño</option>
              </Select>
            </Field>
            {edit.basis === 'bands' ? (
              <div className="space-y-2">
                {(edit.bands ?? []).map((b, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_4.5rem_3rem] items-center gap-2">
                    <Input aria-label={`Hasta pies ${i + 1}`} inputMode="numeric" value={b.max_ft} onChange={(e) => set({ bands: edit.bands!.map((x, j) => j === i ? { ...x, max_ft: e.target.value as unknown as number } : x) })} placeholder="Hasta pies" />
                    <Input aria-label={`Precio tamaño ${i + 1}`} inputMode="decimal" value={b.price} onChange={(e) => set({ bands: edit.bands!.map((x, j) => j === i ? { ...x, price: e.target.value as unknown as number } : x) })} placeholder="$" />
                    <label className="flex items-center gap-1 text-xs font-bold text-slate-600"><input type="checkbox" className="h-5 w-5" checked={!!b.per_foot} onChange={(e) => set({ bands: edit.bands!.map((x, j) => j === i ? { ...x, per_foot: e.target.checked } : x) })} /> por pie</label>
                    <button type="button" aria-label="Quitar tamaño" className="flex h-12 w-12 items-center justify-center text-red-700" onClick={() => set({ bands: edit.bands!.filter((_, j) => j !== i) })}><Trash2 size={18} /></button>
                  </div>
                ))}
                <p className="text-sm text-slate-500">Cada fila: hasta cuántos pies y su precio (fijo, o por pie si marcas “por pie”). Si el bote es más grande que el último, el precio se escribe a mano.</p>
                <Button variant="secondary" onClick={() => set({ bands: [...(edit.bands ?? []), { max_ft: 0, price: 0 }] })}><Plus /> Añadir tamaño</Button>
              </div>
            ) : (
              <Field label={edit.basis === 'per_foot' ? 'Precio por pie *' : 'Precio *'}><Input aria-label="Precio" inputMode="decimal" value={edit.price ?? ''} onChange={(e) => set({ price: e.target.value as unknown as number })} /></Field>
            )}
            <Field label="Por" hint="mes, uso, noche, vez"><Input value={edit.unit ?? ''} onChange={(e) => set({ unit: e.target.value })} /></Field>
            {edit.id && (
              <label className="flex min-h-12 items-center gap-3 text-base">
                <input type="checkbox" className="h-6 w-6" checked={edit.active === false} onChange={(e) => set({ active: !e.target.checked })} />
                Ya no lo uso (no sale para escoger)
              </label>
            )}
            {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
            <Button disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
            {edit.id && (
              <Button variant="ghost" className="text-red-700!" onClick={async () => {
                if (!window.confirm(`¿Borrar “${edit.name}”? Los contratos que lo usan se quedan con su precio.`)) return
                must(await db().from('storage_rates').delete().eq('id', edit.id!))
                setEdit(null)
                reload()
              }}><Trash2 size={20} /> Borrar precio</Button>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}
