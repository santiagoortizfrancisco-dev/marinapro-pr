import { useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, Anchor, ChevronRight, Receipt, Users, Warehouse } from 'lucide-react'
import { db } from '../lib/db'
import { addDays, daysUntil, formatMoney, todayPR } from '../lib/format'
import { balanceOf, loadMoney } from '../lib/money'
import { bySpot, spotState, zonePriceText, type Contract, type Spot, type Zone } from '../lib/storage'
import { Sheet } from './Sheet'
import StorageNewBoat from './StorageNewBoat'
import { newZoneDraft, ZoneForm, type ZoneDraft } from './StorageSpaces'
import { Button, Input } from './ui'
import { useLoad } from '../lib/useLoad'
import { CARD } from './ui'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Inicio de la guardería: la primera vez, un paso a la vez; después, todo en una pantalla:
 * cuántos botes, cuántos espacios libres, la renta del mes, quién debe, y cada zona con sus botes.
 */
export default function StorageHome({ me }: { me: string }) {
  const month = todayPR().slice(0, 8) + '01'
  const [onlyOwing, setOnlyOwing] = useState(false)
  const [zone, setZone] = useState<ZoneDraft>(newZoneDraft())
  const [zonesNext, setZonesNext] = useState(false)
  const [newIn, setNewIn] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000) }
  const { data, reload } = useLoad(async () => {
    const [m, c, z, sp, bills, money] = await Promise.all([
      db().from('mechanics').select('ath_movil_number').eq('profile_id', me).maybeSingle(),
      db().from('storage_contracts').select('*, boats(id, name, length_ft, clients(full_name, phone))').eq('status', 'active'),
      db().from('storage_zones').select('*').order('sort'),
      db().from('storage_spots').select('*').order('sort'),
      db().from('storage_bills').select('contract_id').eq('month', month),
      loadMoney(),
    ])
    // Lo que debe cada bote (facturas sin pagar del todo)
    const owes = new Map<string, number>()
    for (const r of money) {
      const b = balanceOf(r)
      if (b > 0.004) owes.set(r.boat_id, (owes.get(r.boat_id) ?? 0) + b)
    }
    return {
      ath: Boolean((m.data as { ath_movil_number: string | null } | null)?.ath_movil_number),
      contracts: (c.data ?? []) as unknown as Contract[],
      zones: (z.data ?? []) as Zone[],
      spots: bySpot((sp.data ?? []) as Spot[], (z.data ?? []) as Zone[]),
      billed: new Set(((bills.data ?? []) as { contract_id: string }[]).map((x) => x.contract_id)),
      owes,
    }
  }, [me, month])
  if (!data) return <p className="py-8 text-center text-slate-500">Cargando…</p>

  const placed = data.contracts.filter((c) => c.spot_id)

  // ---------- La primera vez: un paso a la vez, todo aquí mismo ----------
  const zonesOk = data.zones.length > 0 && data.spots.length > 0
  const steps = [
    { done: data.ath, title: 'Tu ATH Móvil', text: 'Sale en cada factura para que tus clientes te paguen.' },
    { done: zonesOk && (zonesNext || placed.length > 0), title: 'Tus zonas y espacios', text: 'Tu patio, rack o muelle: su nombre, su precio y cuántos espacios tiene.' },
    { done: placed.length > 0, title: 'Tu primer bote en su espacio', text: 'El dueño, su bote con los pies, y en qué espacio está. El precio del mes sale solo.' },
  ]
  const step = steps.findIndex((s) => !s.done)
  if (step >= 0) {
    const s = steps[step]
    return (
      <>
        <section className="rounded-3xl bg-navy-800 p-5 text-white shadow-xl shadow-navy-900/25" aria-label="Paso a paso">
          <p className="text-sm font-bold uppercase tracking-wider text-navy-100">Paso {step + 1} de {steps.length} para empezar</p>
          <div className="mt-2 flex gap-1.5" aria-hidden="true">
            {steps.map((x, i) => <span key={i} className={`h-2 flex-1 rounded-full ${i < step ? 'bg-emerald-400' : i === step ? 'bg-white' : 'bg-white/25'}`} />)}
          </div>
          <h2 className="mt-4 text-3xl font-extrabold">{s.title}</h2>
          <p className="mt-1 text-lg text-navy-100">{s.text}</p>
        </section>
        <div className={`${CARD} -mt-3 p-4 pt-6`}>
          {step === 0 && <AthStep me={me} onDone={reload} />}
          {step === 1 && <>
            {zonesOk && (
              <div className="mb-4 rounded-2xl bg-emerald-50 p-3">
                <p className="text-base font-bold text-emerald-900">Listo ✓ {data.zones.map((z) => `${z.name} (${data.spots.filter((x) => x.zone_id === z.id).length})`).join(' · ')}</p>
                <p className="text-sm text-emerald-800">¿Tienes otra zona, por ejemplo un muelle? Créala abajo. Si no, sigue.</p>
                <button type="button" onClick={() => setZonesNext(true)} className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-lg font-extrabold text-white active:bg-emerald-700">Ya tengo todas mis zonas · Seguir <ChevronRight /></button>
              </div>
            )}
            <ZoneForm inline edit={zone} setEdit={(z) => setZone(z ?? newZoneDraft())} spots={data.spots} contracts={data.contracts} me={me} reload={reload} flash={flash} />
          </>}
          {step === 2 && <StorageNewBoat zones={data.zones} spots={data.spots} contracts={data.contracts} me={me} onDone={(m) => { flash(`¡Listo! ${m}`); reload() }} />}
        </div>
        {toast && <p role="status" className="mt-3 rounded-xl bg-navy-900 p-3 text-center text-base font-bold text-white">{toast}</p>}
      </>
    )
  }

  // ---------- Todo en una pantalla ----------
  const states = data.spots.map((s) => ({ s, ...spotState(s, data.contracts) }))
  const free = states.filter((x) => x.state === 'free').length
  const monthly = data.contracts.reduce((t, c) => t + Number(c.monthly_price), 0)
  const owed = [...data.owes.values()].reduce((t, n) => t + n, 0)
  const owesOf = (c: Contract) => data.owes.get(c.boat_id) ?? 0
  const nextMonth = addDays(month, 32).slice(0, 8) + '01'
  const toBill = data.contracts.filter((c) => c.start_date < nextMonth && (!c.end_date || c.end_date >= month) && !data.billed.has(c.id)).length
  const expiring = data.contracts.filter((c) => (c.end_date && daysUntil(c.end_date) <= 30) || (c.insurance_expires && daysUntil(c.insurance_expires) <= 15)).length
  const unplaced = data.contracts.filter((c) => !c.spot_id)
  const zones = [...data.zones].sort((a, b) => (a.kind === b.kind ? a.sort - b.sort : a.kind === 'land' ? -1 : 1))

  const box = (label: string, value: string, sub?: string, tone = 'text-navy-900') => (
    <div className={`${CARD} p-3`}>
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className={`text-2xl font-extrabold ${tone}`}>{value}</p>
      {sub && <p className="text-sm text-slate-500">{sub}</p>}
    </div>
  )

  return (
    <>
      <section className="grid grid-cols-2 gap-2" aria-label="Mi guardería">
        {box('Botes', String(data.contracts.length), 'activos')}
        {box('Espacios libres', String(free), `de ${data.spots.length}`, free > 0 ? 'text-emerald-700' : 'text-navy-900')}
        {box('Renta al mes', formatMoney(monthly))}
        <button type="button" onClick={() => setOnlyOwing(!onlyOwing)} aria-pressed={onlyOwing} className={`${CARD} p-3 text-left ${onlyOwing ? 'ring-2 ring-red-500' : ''}`}>
          <p className="text-sm font-bold text-slate-500">Te deben</p>
          <p className={`text-2xl font-extrabold ${owed > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(owed)}</p>
          <p className="text-sm text-slate-500">{onlyOwing ? 'Ver todos' : owed > 0 ? 'Toca para ver quién' : 'Todos al día'}</p>
        </button>
      </section>

      {(toBill > 0 || expiring > 0) && (
        <div className="mt-3 space-y-2">
          {toBill > 0 && (
            <Link to="/guarderia?tab=bill" className="flex min-h-14 items-center gap-3 rounded-2xl bg-navy-800 px-4 text-white active:bg-navy-900">
              <Receipt size={22} />
              <span className="flex-1"><span className="block text-lg font-extrabold">Facturar {MONTHS[Number(month.slice(5, 7)) - 1]}</span><span className="block text-sm text-navy-100">{toBill} {toBill === 1 ? 'bote sin facturar' : 'botes sin facturar'}</span></span>
              <ChevronRight />
            </Link>
          )}
          {expiring > 0 && (
            <Link to="/guarderia" className="flex min-h-12 items-center gap-2 rounded-2xl bg-amber-50 px-4 text-base font-bold text-amber-900 ring-1 ring-amber-300">
              <AlertTriangle size={20} /> {expiring} {expiring === 1 ? 'contrato o seguro por vencer' : 'contratos o seguros por vencer'}
            </Link>
          )}
        </div>
      )}

      {zones.map((z) => {
        const mine = states.filter((x) => x.s.zone_id === z.id)
        const taken = mine.filter((x) => ['occupied', 'away', 'temp'].includes(x.state))
        const rows = taken.filter((x) => !onlyOwing || (x.contract && owesOf(x.contract) > 0))
        const freeSpots = mine.filter((x) => x.state === 'free')
        const other = mine.filter((x) => x.state === 'reserved' || x.state === 'out')
        if (onlyOwing && rows.length === 0) return null
        return (
          <section key={z.id} className="mt-5" aria-label={`Zona ${z.name}`}>
            <div className="mb-1 flex items-center gap-2 px-1">
              {z.kind === 'water' ? <Anchor size={20} className="text-navy-700" /> : <Warehouse size={20} className="text-navy-700" />}
              <h2 className="flex-1 text-xl font-extrabold text-navy-900">{z.name}</h2>
              <span className="text-sm font-bold text-slate-500">{mine.length - freeSpots.length - other.length} de {mine.length} ocupados</span>
            </div>
            <p className="mb-2 px-1 text-sm text-slate-500">{zonePriceText(z)}</p>
            <div className={`${CARD} divide-y divide-slate-100 overflow-hidden`}>
              {rows.map(({ s, state, contract: c }) => {
                const debt = c ? owesOf(c) : 0
                return (
                  <Link key={s.id} to={c ? `/botes/${c.boat_id}` : '/guarderia?tab=spaces'} className="flex min-h-16 items-center gap-3 px-3 py-2 active:bg-slate-50" aria-label={`${s.label}: ${c?.boats?.name ?? ''}`}>
                    <span className="w-12 shrink-0 text-lg font-extrabold text-navy-900">{s.label}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold text-slate-900">{c?.boats?.name}{state === 'temp' ? ' (de tierra)' : ''}</span>
                      <span className="block truncate text-sm text-slate-600">{c?.boats?.clients?.full_name}{state === 'away' ? ' · 🌊 en el agua' : ''}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {state !== 'temp' && c && <span className="block text-base font-bold text-slate-900">{formatMoney(Number(c.monthly_price))}</span>}
                      {state !== 'temp' && <span className={`block text-sm font-extrabold ${debt > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{debt > 0 ? `Debe ${formatMoney(debt)}` : 'Al día ✓'}</span>}
                    </span>
                  </Link>
                )
              })}
              {!onlyOwing && freeSpots.length > 0 && (
                <button type="button" onClick={() => setNewIn(freeSpots[0].s.id)} className="flex min-h-14 w-full items-center gap-3 bg-emerald-50 px-3 py-2 text-left active:bg-emerald-100">
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold text-emerald-900">{freeSpots.length} {freeSpots.length === 1 ? 'espacio libre' : 'espacios libres'}</span>
                    <span className="block truncate text-sm text-emerald-800">{freeSpots.map((x) => x.s.label).join(', ')}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-extrabold text-white">Poner bote</span>
                </button>
              )}
              {!onlyOwing && other.length > 0 && (
                <Link to="/guarderia?tab=spaces" className="block px-3 py-2 text-sm text-slate-600">
                  {other.map((x) => `${x.s.label} ${x.state === 'out' ? 'fuera de servicio' : 'reservado'}`).join(' · ')}
                </Link>
              )}
              {mine.length === 0 && <Link to="/guarderia?tab=spaces" className="block px-3 py-3 text-base text-slate-600">Sin espacios todavía. Toca para añadirlos.</Link>}
            </div>
          </section>
        )
      })}

      {!onlyOwing && unplaced.length > 0 && (
        <Link to="/guarderia" className="mt-4 flex min-h-14 items-center gap-2 rounded-2xl bg-amber-50 px-4 text-base font-bold text-amber-900 ring-1 ring-amber-300">
          <AlertTriangle size={20} /> <span className="flex-1">{unplaced.length} {unplaced.length === 1 ? 'bote sin espacio' : 'botes sin espacio'}: {unplaced.map((c) => c.boats?.name).join(', ')}</span> <ChevronRight size={20} />
        </Link>
      )}

      <Shortcuts />
      <Sheet open={!!newIn} title="Poner un bote" onClose={() => setNewIn(null)}>
        {newIn && <StorageNewBoat zones={data.zones} spots={data.spots} contracts={data.contracts} me={me} presetSpot={newIn} onDone={(m) => { setNewIn(null); flash(m); reload() }} />}
      </Sheet>
      {toast && <p role="status" className="fixed inset-x-4 bottom-24 z-40 rounded-xl bg-navy-900 p-3 text-center text-base font-bold text-white shadow-lg">{toast}</p>}
    </>
  )
}

/** Paso 1: el ATH Móvil ahí mismo. */
function AthStep({ me, onDone }: { me: string; onDone: () => void }) {
  const [ath, setAth] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-3">
      <Input aria-label="Tu número de ATH Móvil" type="tel" inputMode="tel" value={ath} onChange={(e) => setAth(e.target.value)} placeholder="787-555-0100" className="text-center text-2xl! font-extrabold" />
      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
      <Button disabled={busy} onClick={async () => {
        if (ath.replace(/\D/g, '').length < 7) return setError('Escribe tu número de ATH Móvil (el teléfono).')
        setBusy(true)
        const { error } = await db().from('mechanics').update({ ath_movil_number: ath.trim() }).eq('profile_id', me)
        setBusy(false)
        if (error) return setError('No se pudo guardar. Intenta otra vez.')
        onDone()
      }}>{busy ? 'Guardando…' : 'Guardar y seguir'}</Button>
      <p className="text-sm text-slate-500">Lo puedes cambiar después en Más → Mi negocio.</p>
    </div>
  )
}

/** Abajo: lo que se usa todos los días fuera de la guardería. */
function Shortcuts() {
  return (
    <div className="mt-5 grid grid-cols-2 gap-2">
      <Link to="/cobrar" className={`${CARD} flex min-h-16 items-center justify-center gap-2 text-lg font-extrabold text-navy-900 active:bg-slate-50`}><Receipt size={22} /> Factura rápida</Link>
      <Link to="/clientes" className={`${CARD} flex min-h-16 items-center justify-center gap-2 text-lg font-extrabold text-navy-900 active:bg-slate-50`}><Users size={22} /> Clientes</Link>
    </div>
  )
}
