import { useState } from 'react'
import { Button, Field, Input, Select } from './ui'
import { db } from '../lib/db'
import { formatMoney, todayPR } from '../lib/format'
import { bySpot, spotName, spotState, zonePrice, type Contract, type Spot, type Zone } from '../lib/storage'
import { useLoad } from '../lib/useLoad'

interface BoatRow { id: string; name: string; length_ft: number | null; clients: { full_name: string } | null }

/**
 * Poner un bote en un espacio, todo en el mismo sitio: el dueño, su teléfono, el bote, sus pies y el espacio.
 * Si el bote ya está en Clientes, se escoge de la lista. El precio del mes sale de la zona (y se puede cambiar).
 */
export default function StorageNewBoat({ zones, spots, contracts, me, presetSpot = null, onDone }: {
  zones: Zone[]; spots: Spot[]; contracts: Contract[]; me: string; presetSpot?: string | null; onDone: (msg: string) => void
}) {
  const inYard = new Set(contracts.filter((c) => c.status === 'active').map((c) => c.boat_id))
  const { data: boats } = useLoad(async () => ((await db().from('boats').select('id, name, length_ft, clients(full_name)').order('name')).data ?? []) as unknown as BoatRow[], [])
  const known = (boats ?? []).filter((b) => !inYard.has(b.id))
  const free = bySpot(spots.filter((s) => s.id === presetSpot || spotState(s, contracts).state === 'free'), zones)

  const [existing, setExisting] = useState('')
  const [owner, setOwner] = useState('')
  const [phone, setPhone] = useState('')
  const [boatName, setBoatName] = useState('')
  const [feet, setFeet] = useState('')
  const [spotId, setSpotId] = useState(presetSpot ?? '')
  const [priceText, setPriceText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const chosen = known.find((b) => b.id === existing)
  const ft = chosen ? chosen.length_ft : Number(feet) || null
  const spot = spots.find((s) => s.id === spotId)
  const auto = zonePrice(zones.find((z) => z.id === spot?.zone_id), ft)
  const price = priceText.trim() ? Number(priceText.replace(/[$,\s]/g, '')) : auto

  async function save() {
    if (!chosen) {
      if (!owner.trim()) return setError('Escribe el nombre del dueño.')
      if (!boatName.trim()) return setError('Escribe el nombre del bote.')
      if (!ft) return setError('Escribe cuántos pies tiene el bote.')
    }
    if (!spot) return setError('Escoge su espacio.')
    if (price == null || !(price >= 0)) return setError('Escribe cuánto paga al mes.')
    setBusy(true)
    setError('')
    let boatId = chosen?.id
    if (!boatId) {
      const c = await db().from('clients').insert({ mechanic_id: me, full_name: owner.trim(), phone: phone.trim() || null }).select('id').single()
      if (c.error || !c.data) { setBusy(false); return setError('No se pudo guardar el dueño. Intenta otra vez.') }
      const b = await db().from('boats').insert({ client_id: (c.data as { id: string }).id, name: boatName.trim(), length_ft: ft, location_type: 'dry_storage' }).select('id').single()
      if (b.error || !b.data) { setBusy(false); return setError('No se pudo guardar el bote. Intenta otra vez.') }
      boatId = (b.data as { id: string }).id
    }
    const { error } = await db().from('storage_contracts').insert({ mechanic_id: me, boat_id: boatId, spot_id: spot.id, space_label: spotName(spot, zones), monthly_price: price, start_date: todayPR() })
    setBusy(false)
    // El candado de la base de datos dice por qué (ej. "El espacio P-1 ya está ocupado por Mar Azul")
    if (error) return setError(/ocupado|fuera de servicio/.test(error.message) ? error.message : 'No se pudo guardar. Intenta otra vez.')
    onDone(`${chosen?.name ?? boatName.trim()} en ${spot.label}`)
  }

  return (
    <div className="space-y-4">
      {known.length > 0 && (
        <Field label="¿Ya está en tus clientes?">
          <Select aria-label="Bote que ya está en tus clientes" value={existing} onChange={(e) => setExisting(e.target.value)}>
            <option value="">No, es nuevo</option>
            {known.map((b) => <option key={b.id} value={b.id}>{b.name}{b.length_ft ? ` (${Number(b.length_ft)}')` : ''} · {b.clients?.full_name ?? ''}</option>)}
          </Select>
        </Field>
      )}
      {!chosen && <>
        <Field label="Nombre del dueño *"><Input aria-label="Nombre del dueño" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Juan Rivera" /></Field>
        <Field label="Su teléfono (para WhatsApp)"><Input aria-label="Teléfono del dueño" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="787-555-0123" /></Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Nombre del bote *"><Input aria-label="Nombre del bote" value={boatName} onChange={(e) => setBoatName(e.target.value)} placeholder="Mar Azul" /></Field>
          <Field label="Pies *"><Input aria-label="Pies del bote" inputMode="decimal" value={feet} onChange={(e) => setFeet(e.target.value)} placeholder="22" /></Field>
        </div>
      </>}
      <Field label="Su espacio *">
        <Select aria-label="Su espacio" value={spotId} onChange={(e) => { setSpotId(e.target.value); setPriceText('') }}>
          <option value="">Escoge un espacio libre</option>
          {free.map((s) => <option key={s.id} value={s.id}>{spotName(s, zones)}</option>)}
        </Select>
      </Field>
      <Field label="Paga al mes" hint={auto != null ? 'Sale del precio de la zona. Lo puedes cambiar.' : 'Escoge el espacio y los pies, o escribe el precio.'}>
        <Input aria-label="Paga al mes" inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder={auto != null ? formatMoney(auto) : '$'} />
      </Field>
      {price != null && price >= 0 && spot && <p className="rounded-xl bg-emerald-50 p-3 text-base font-bold text-emerald-900">{chosen?.name ?? (boatName.trim() || 'El bote')} en {spot.label}: {formatMoney(price)} al mes</p>}
      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
      <Button disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar el bote en su espacio'}</Button>
    </div>
  )
}
