import { useState } from 'react'
import { Anchor, Pencil, Plus, Trash2, Warehouse } from 'lucide-react'
import { Sheet } from './Sheet'
import { Button, CARD, EmptyState, Field, Input } from './ui'
import { db } from '../lib/db'
import { formatDate } from '../lib/format'
import { spotName, spotState, type Contract, type Spot, type SpotState, type Zone } from '../lib/storage'

/** Color y texto de cada estado del cuadro. */
const LOOK: Record<SpotState, { label: string; tile: string }> = {
  free: { label: 'Disponible', tile: 'bg-emerald-50 text-emerald-900 ring-2 ring-emerald-300' },
  occupied: { label: 'Ocupado', tile: 'bg-navy-800 text-white ring-2 ring-navy-800' },
  temp: { label: 'Ocupado', tile: 'bg-navy-800 text-white ring-2 ring-navy-800' },
  away: { label: 'Reservado', tile: 'bg-amber-100 text-amber-900 ring-2 ring-amber-400' },
  reserved: { label: 'Reservado', tile: 'bg-amber-100 text-amber-900 ring-2 ring-amber-400' },
  out: { label: 'Fuera de servicio', tile: 'bg-slate-200 text-slate-500 ring-2 ring-slate-300 line-through' },
}

interface Props {
  zones: Zone[]; spots: Spot[]; contracts: Contract[]; me: string
  reload: () => void; flash: (m: string) => void
  /** Bote nuevo en la guardería con este espacio ya escogido */
  onNewContract: (spotId: string) => void
  /** Abre el contrato de ese bote */
  onOpenContract: (boatId: string) => void
}

/**
 * Espacios de la guardería: cada zona (tierra o agua / muelle) con sus cuadros numerados.
 * Un toque en el cuadro: asignar bote, reservar, fuera de servicio, salió al agua, volvió, mover o desocupar.
 */
export default function StorageSpaces({ zones, spots, contracts, me, reload, flash, onNewContract, onOpenContract }: Props) {
  const [zoneEdit, setZoneEdit] = useState<Partial<Zone> & { prefix?: string; count?: string } | null>(null)
  const [open, setOpen] = useState<Spot | null>(null)
  const sorted = [...zones].sort((a, b) => (a.kind === b.kind ? a.sort - b.sort || a.name.localeCompare(b.name) : a.kind === 'land' ? -1 : 1))

  return (
    <>
      <Button onClick={() => setZoneEdit({ kind: 'land', prefix: '', count: '10' })}><Plus /> Añadir zona</Button>
      {zones.length === 0 && (
        <div className="mt-4"><EmptyState icon={Warehouse} title="Todavía no hay zonas" text="Crea tus zonas de tierra (patio, rack) y tus muelles, con sus espacios numerados. Después tocas un cuadro para poner un bote." /></div>
      )}
      {zones.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 px-1 text-sm font-bold text-slate-600" aria-label="Colores">
          <span className="flex items-center gap-1"><span className="h-3.5 w-3.5 rounded bg-emerald-300" /> Disponible</span>
          <span className="flex items-center gap-1"><span className="h-3.5 w-3.5 rounded bg-navy-800" /> Ocupado</span>
          <span className="flex items-center gap-1"><span className="h-3.5 w-3.5 rounded bg-amber-400" /> Reservado</span>
          <span className="flex items-center gap-1"><span className="h-3.5 w-3.5 rounded bg-slate-300" /> Fuera de servicio</span>
        </div>
      )}

      {sorted.map((z) => {
        const mine = spots.filter((s) => s.zone_id === z.id).sort((a, b) => a.sort - b.sort)
        const states = mine.map((s) => spotState(s, contracts))
        const count = (k: SpotState[]) => states.filter((x) => k.includes(x.state)).length
        return (
          <section key={z.id} className="mt-5" aria-label={`Zona ${z.name}`}>
            <div className="mb-2 flex items-center gap-2">
              {z.kind === 'water' ? <Anchor size={22} className="text-navy-700" /> : <Warehouse size={22} className="text-navy-700" />}
              <h2 className="min-w-0 flex-1 truncate text-xl font-extrabold text-navy-900">{z.name}</h2>
              <button type="button" aria-label={`Cambiar zona ${z.name}`} onClick={() => setZoneEdit({ ...z, prefix: guessPrefix(mine), count: '' })} className="flex h-11 w-11 items-center justify-center text-slate-500"><Pencil size={20} /></button>
            </div>
            <p className="mb-2 px-1 text-sm text-slate-600">
              {z.kind === 'water' ? 'Agua / muelle' : 'Tierra'} · {count(['occupied', 'temp'])} ocupados · {count(['free'])} libres · {count(['away', 'reserved'])} reservados{count(['out']) ? ` · ${count(['out'])} fuera` : ''}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {mine.map((s, i) => {
                const { state, contract } = states[i]
                return (
                  <button key={s.id} type="button" onClick={() => setOpen(s)} aria-label={`Espacio ${s.label}: ${LOOK[state].label}${contract?.boats ? `, ${contract.boats.name}` : ''}`}
                    className={`flex min-h-20 flex-col items-center justify-center rounded-2xl px-1 py-2 text-center active:scale-[0.97] ${LOOK[state].tile}`}>
                    <span className="text-lg font-extrabold leading-tight">{s.label}</span>
                    <span className="w-full truncate text-xs font-bold leading-tight no-underline">{contract?.boats?.name ?? (state === 'free' ? 'Libre' : LOOK[state].label)}</span>
                  </button>
                )
              })}
            </div>
            {mine.length === 0 && <p className="px-1 text-base text-slate-600">Sin espacios. Toca ✏️ para añadirlos.</p>}
          </section>
        )
      })}

      <ZoneSheet edit={zoneEdit} setEdit={setZoneEdit} spots={spots} contracts={contracts} me={me} reload={reload} flash={flash} />
      {open && <SpotSheet spot={open} zones={zones} spots={spots} contracts={contracts} onClose={() => setOpen(null)} reload={reload} flash={flash}
        onNewContract={(id) => { setOpen(null); onNewContract(id) }} onOpenContract={(id) => { setOpen(null); onOpenContract(id) }} />}
    </>
  )
}

/** "A-12" → "A-" (para seguir numerando igual) */
function guessPrefix(spots: Spot[]) {
  const m = spots.at(-1)?.label.match(/^(.*?)(\d+)$/)
  return m ? m[1] : ''
}
function nextNumber(spots: Spot[], prefix: string) {
  const nums = spots.map((s) => s.label.startsWith(prefix) ? Number(s.label.slice(prefix.length)) : NaN).filter((n) => Number.isFinite(n))
  return nums.length ? Math.max(...nums) + 1 : 1
}

function ZoneSheet({ edit, setEdit, spots, contracts, me, reload, flash }: {
  edit: (Partial<Zone> & { prefix?: string; count?: string }) | null; setEdit: (z: (Partial<Zone> & { prefix?: string; count?: string }) | null) => void
  spots: Spot[]; contracts: Contract[]; me: string; reload: () => void; flash: (m: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!edit) return null
  const mine = spots.filter((s) => s.zone_id === edit.id)
  const count = Number(edit.count || 0)
  const prefix = edit.prefix ?? ''
  const from = nextNumber(mine, prefix)
  const set = (p: Partial<Zone> & { prefix?: string; count?: string }) => setEdit({ ...edit, ...p })

  async function save() {
    if (!edit?.name?.trim()) return setError('Escribe el nombre de la zona.')
    if (!edit.id && count < 1) return setError('¿Cuántos espacios tiene?')
    if (count > 300) return setError('Máximo 300 espacios a la vez.')
    setBusy(true)
    setError('')
    let id = edit.id
    if (id) {
      const { error } = await db().from('storage_zones').update({ name: edit.name.trim(), kind: edit.kind }).eq('id', id)
      if (error) { setBusy(false); return setError('No se pudo guardar. Intenta otra vez.') }
    } else {
      const { data, error } = await db().from('storage_zones').insert({ mechanic_id: me, name: edit.name.trim(), kind: edit.kind ?? 'land' }).select('id').single()
      if (error || !data) { setBusy(false); return setError('No se pudo guardar. Intenta otra vez.') }
      id = (data as { id: string }).id
    }
    if (count > 0) {
      const { error } = await db().rpc('storage_add_spots', { p_zone: id, p_prefix: prefix, p_from: from, p_count: count })
      if (error) { setBusy(false); return setError('La zona se guardó, pero no se pudieron crear los espacios. Intenta otra vez.') }
    }
    setBusy(false)
    flash(count > 0 ? `${count} ${count === 1 ? 'espacio' : 'espacios'} listos` : 'Guardado')
    setEdit(null)
    reload()
  }

  const used = mine.some((s) => contracts.some((c) => c.status === 'active' && (c.spot_id === s.id || c.away_spot_id === s.id)))
  return (
    <Sheet open title={edit.id ? 'Cambiar zona' : 'Zona nueva'} onClose={() => setEdit(null)}>
      <div className="space-y-4">
        <Field label="Nombre de la zona *"><Input aria-label="Nombre de la zona" value={edit.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Patio A, Rack norte, Muelle C" /></Field>
        <Field label="Es">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de zona">
            {([['land', 'Tierra', Warehouse], ['water', 'Agua / muelle', Anchor]] as const).map(([v, l, Icon]) => (
              <button key={v} type="button" role="radio" aria-checked={edit.kind === v} onClick={() => set({ kind: v })}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 text-base font-bold ${edit.kind === v ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-300 bg-white text-slate-800'}`}><Icon size={20} /> {l}</button>
            ))}
          </div>
        </Field>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="mb-2 text-base font-bold text-slate-800">{edit.id ? 'Añadir más espacios' : 'Sus espacios'}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Letra o prefijo" hint="Ej.: A-  (queda A-1, A-2…)"><Input aria-label="Prefijo" value={prefix} onChange={(e) => set({ prefix: e.target.value })} placeholder="A-" /></Field>
            <Field label="¿Cuántos?"><Input aria-label="Cuántos espacios" inputMode="numeric" value={edit.count ?? ''} onChange={(e) => set({ count: e.target.value.replace(/\D/g, '') })} placeholder={edit.id ? '0' : '10'} /></Field>
          </div>
          {count > 0 && <p className="mt-1 text-sm font-bold text-navy-800">Se crean {prefix}{from} hasta {prefix}{from + count - 1}</p>}
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <Button disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
        {edit.id && (
          <Button variant="ghost" className="text-red-700!" onClick={async () => {
            if (used) return setError('Esta zona tiene botes. Muévelos o desocupa sus espacios antes de borrarla.')
            if (!window.confirm(`¿Borrar la zona “${edit.name}” y sus ${mine.length} espacios?`)) return
            const { error } = await db().from('storage_zones').delete().eq('id', edit.id!)
            if (error) return setError('No se pudo borrar. Intenta otra vez.')
            setEdit(null)
            reload()
          }}><Trash2 size={20} /> Borrar zona</Button>
        )}
      </div>
    </Sheet>
  )
}

function SpotSheet({ spot, zones, spots, contracts, onClose, reload, flash, onNewContract, onOpenContract }: {
  spot: Spot; zones: Zone[]; spots: Spot[]; contracts: Contract[]; onClose: () => void; reload: () => void; flash: (m: string) => void
  onNewContract: (spotId: string) => void; onOpenContract: (boatId: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'main' | 'assign' | 'move' | 'water' | 'reserve' | 'out'>('main')
  const [note, setNote] = useState(spot.note ?? '')
  const { state, contract: c } = spotState(spot, contracts)
  const zone = zones.find((z) => z.id === spot.zone_id)
  const free = (kind?: 'land' | 'water') => spots.filter((s) => s.id !== spot.id && ['free', 'reserved'].includes(spotState(s, contracts).state) && (!kind || zones.find((z) => z.id === s.zone_id)?.kind === kind))
  const unplaced = contracts.filter((x) => x.status === 'active' && !x.spot_id)
  const label = (id: string | null) => spots.find((s) => s.id === id)
  const boat = c?.boats

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true)
    setError('')
    const { error } = await fn()
    setBusy(false)
    // El candado de la base de datos explica por qué (ej. "ya está ocupado por La Tranquila")
    if (error) return setError(/ocupado|fuera de servicio|otro espacio/.test(error.message) ? error.message : 'No se pudo. Intenta otra vez.')
    flash(ok)
    onClose()
    reload()
  }
  const putIn = (contractId: string, s: Spot) => run(() => db().from('storage_contracts').update({ spot_id: s.id, space_label: spotName(s, zones) }).eq('id', contractId), `Listo: ${s.label}`)
  const setStatus = (status: Spot['status'], n: string | null) => run(() => db().from('storage_spots').update({ status, note: n }).eq('id', spot.id), status === 'ok' ? 'Listo' : 'Guardado')

  const pickList = (list: Spot[], onPick: (s: Spot) => void, empty: string) => list.length === 0 ? <p className="text-base text-slate-600">{empty}</p> : (
    <div className="grid grid-cols-4 gap-2">
      {list.map((s) => (
        <button key={s.id} type="button" disabled={busy} onClick={() => onPick(s)} className="flex min-h-16 flex-col items-center justify-center rounded-2xl bg-emerald-50 px-1 text-emerald-900 ring-2 ring-emerald-300 active:scale-[0.97]">
          <span className="text-base font-extrabold">{s.label}</span>
          <span className="w-full truncate text-[11px] font-bold">{zones.find((z) => z.id === s.zone_id)?.name}</span>
        </button>
      ))}
    </div>
  )

  return (
    <Sheet open title={`Espacio ${spot.label}`} onClose={onClose}>
      <p className="mb-3 text-base text-slate-700">{zone?.name} · <b>{LOOK[state].label}</b></p>

      {mode === 'main' && (
        <div className="space-y-3">
          {boat && (
            <div className={`${CARD} p-3`}>
              <p className="text-lg font-extrabold text-navy-900">{boat.name}{boat.length_ft ? ` · ${Number(boat.length_ft)}'` : ''}</p>
              <p className="text-sm text-slate-600">{boat.clients?.full_name}</p>
              {state === 'away' && <p className="mt-1 text-sm font-bold text-amber-800">Salió al agua el {formatDate(c!.away_since!)}{c!.away_spot_id ? ` · está en ${label(c!.away_spot_id)?.label}` : ''}. Este espacio se le guarda.</p>}
              {state === 'temp' && <p className="mt-1 text-sm font-bold text-navy-800">Está aquí mientras tanto. Su espacio en tierra: {label(c!.spot_id)?.label ?? '—'}.</p>}
            </div>
          )}
          {state === 'reserved' && spot.note && <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-900">Reservado: {spot.note}</p>}
          {state === 'out' && spot.note && <p className="rounded-xl bg-slate-100 p-3 text-base text-slate-700">Fuera de servicio: {spot.note}</p>}

          {(state === 'free' || state === 'reserved') && <>
            <Button onClick={() => setMode('assign')}>Poner un bote aquí</Button>
            {state === 'free' && <Button variant="secondary" onClick={() => setMode('reserve')}>Reservar</Button>}
            {state === 'reserved' && <Button variant="secondary" disabled={busy} onClick={() => setStatus('ok', null)}>Quitar la reserva</Button>}
            <Button variant="ghost" onClick={() => setMode('out')}>Fuera de servicio</Button>
          </>}
          {state === 'out' && <Button disabled={busy} onClick={() => setStatus('ok', null)}>Volver a ponerlo en servicio</Button>}
          {state === 'occupied' && <>
            {zone?.kind === 'land' && <Button onClick={() => setMode('water')}>Salió al agua (guardarle este espacio)</Button>}
            <Button variant="secondary" onClick={() => setMode('move')}>Mover a otro espacio</Button>
            <Button variant="secondary" onClick={() => onOpenContract(c!.boat_id)}>Ver contrato</Button>
            <Button variant="ghost" className="text-red-700!" disabled={busy} onClick={() => {
              if (!window.confirm(`¿Sacar a ${boat?.name} de ${spot.label}? Su contrato sigue; queda sin espacio.`)) return
              run(() => db().from('storage_contracts').update({ spot_id: null }).eq('id', c!.id), 'Espacio libre')
            }}>Desocupar este espacio</Button>
          </>}
          {(state === 'away' || state === 'temp') && <>
            <Button disabled={busy} onClick={() => run(() => db().from('storage_contracts').update({ away_since: null, away_spot_id: null }).eq('id', c!.id), `${boat?.name} volvió a ${label(c!.spot_id)?.label ?? 'tierra'}`)}>
              Volvió a tierra{label(c!.spot_id) ? ` (${label(c!.spot_id)!.label})` : ''}
            </Button>
            <Button variant="secondary" onClick={() => onOpenContract(c!.boat_id)}>Ver contrato</Button>
          </>}
        </div>
      )}

      {mode === 'assign' && (
        <div className="space-y-3">
          <p className="text-base font-bold text-slate-800">¿Qué bote? (los que están en la guardería sin espacio)</p>
          {unplaced.length === 0 && <p className="text-base text-slate-600">Todos los botes ya tienen su espacio.</p>}
          {unplaced.map((x) => (
            <button key={x.id} type="button" disabled={busy} onClick={() => putIn(x.id, spot)} className={`${CARD} flex min-h-14 w-full items-center gap-2 px-3 text-left active:bg-navy-50`}>
              <span className="flex-1"><span className="block text-base font-bold text-navy-900">{x.boats?.name}</span><span className="block text-sm text-slate-600">{x.boats?.clients?.full_name}</span></span>
            </button>
          ))}
          <Button variant="secondary" onClick={() => onNewContract(spot.id)}><Plus /> Bote nuevo en la guardería</Button>
          <Button variant="ghost" onClick={() => setMode('main')}>Atrás</Button>
        </div>
      )}

      {mode === 'move' && (
        <div className="space-y-3">
          <p className="text-base font-bold text-slate-800">¿A cuál espacio libre?</p>
          {pickList(free(), (s) => putIn(c!.id, s), 'No hay espacios libres.')}
          <Button variant="ghost" onClick={() => setMode('main')}>Atrás</Button>
        </div>
      )}

      {mode === 'water' && (
        <div className="space-y-3">
          <p className="text-base text-slate-700">{spot.label} queda <b>reservado</b> para {boat?.name}. ¿En qué muelle está mientras tanto?</p>
          {pickList(free('water'), (s) => run(() => db().from('storage_contracts').update({ away_since: new Date().toISOString(), away_spot_id: s.id }).eq('id', c!.id), `${boat?.name} en ${s.label}; ${spot.label} reservado`), 'No hay muelles libres.')}
          <Button variant="secondary" disabled={busy} onClick={() => run(() => db().from('storage_contracts').update({ away_since: new Date().toISOString(), away_spot_id: null }).eq('id', c!.id), `${spot.label} reservado`)}>Sin muelle (salió a navegar)</Button>
          <Button variant="ghost" onClick={() => setMode('main')}>Atrás</Button>
        </div>
      )}

      {(mode === 'reserve' || mode === 'out') && (
        <div className="space-y-3">
          <Field label={mode === 'reserve' ? '¿Para quién o por qué? (opcional)' : '¿Qué le pasa? (opcional)'}>
            <Input aria-label="Nota del espacio" value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'reserve' ? 'Bote de Luis, llega el lunes' : 'Rack dañado'} />
          </Field>
          <Button disabled={busy} onClick={() => setStatus(mode === 'reserve' ? 'reserved' : 'out_of_service', note.trim() || null)}>{mode === 'reserve' ? 'Reservar' : 'Poner fuera de servicio'}</Button>
          <Button variant="ghost" onClick={() => setMode('main')}>Atrás</Button>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
    </Sheet>
  )
}
