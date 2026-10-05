import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { BOAT_MAKES, LOCATION_TYPES, PR_MARINAS, type LocationType } from '../../lib/catalog'
import { db } from '../../lib/db'
import { PR_TOWNS } from '../../lib/towns'
import type { Boat } from '../../lib/types'
import { blank, num } from '../../lib/useLoad'
import MapPicker from '../../components/MapPicker'
import { BackTitle, Choice, Field, FormActions, Input, Loading, Select, Suggestions, Textarea } from '../../components/ui'

type Form = {
  name: string; make: string; model: string; year: string; length_ft: string; hull_color: string
  hull_id: string; registration_number: string; marbete_expires: string
  location_type: LocationType; marina_name: string; slip_number: string; town: string; location_notes: string
  lat: number | null; lng: number | null; notes: string
}
const EMPTY: Form = {
  name: '', make: '', model: '', year: '', length_ft: '', hull_color: '', hull_id: '', registration_number: '', marbete_expires: '',
  location_type: 'water_slip', marina_name: '', slip_number: '', town: '', location_notes: '', lat: null, lng: null, notes: '',
}

const str = (v: unknown) => (v == null ? '' : String(v))

export default function BoatForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [clientId, setClientId] = useState(params.get('cliente') ?? '')
  const [clientName, setClientName] = useState('')
  const [f, setF] = useState<Form>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    ;(async () => {
      let cid = clientId
      if (id) {
        const { data } = await db().from('boats').select('*').eq('id', id).single()
        const b = data as Boat | null
        if (b) {
          cid = b.client_id
          setClientId(b.client_id)
          setF({
            name: b.name, make: str(b.make), model: str(b.model), year: str(b.year), length_ft: str(b.length_ft), hull_color: str(b.hull_color),
            hull_id: str(b.hull_id), registration_number: str(b.registration_number), marbete_expires: str(b.marbete_expires),
            location_type: b.location_type, marina_name: str(b.marina_name), slip_number: str(b.slip_number), town: str(b.town),
            location_notes: str(b.location_notes), lat: b.lat, lng: b.lng, notes: str(b.notes),
          })
        }
      }
      if (cid) {
        const { data } = await db().from('clients').select('full_name, town').eq('id', cid).single()
        const c = data as { full_name: string; town: string | null } | null
        setClientName(c?.full_name ?? '')
        // Bote nuevo: empezar con el pueblo del cliente
        if (!id && c?.town) setF((p) => (p.town ? p : { ...p, town: c.town! }))
      }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const atMarina = f.location_type === 'water_slip' || f.location_type === 'dry_storage'
    const row = {
      name: f.name.trim(), make: blank(f.make), model: blank(f.model), year: num(f.year), length_ft: num(f.length_ft), hull_color: blank(f.hull_color),
      hull_id: blank(f.hull_id), registration_number: blank(f.registration_number), marbete_expires: blank(f.marbete_expires),
      location_type: f.location_type, marina_name: atMarina ? blank(f.marina_name) : null, slip_number: atMarina ? blank(f.slip_number) : null,
      town: blank(f.town), location_notes: blank(f.location_notes), lat: f.lat, lng: f.lng, notes: blank(f.notes),
    }
    const res = id
      ? await db().from('boats').update(row).eq('id', id).select('id').single()
      : await db().from('boats').insert({ ...row, client_id: clientId }).select('id').single()
    setBusy(false)
    if (res.error) {
      setError('No se pudo guardar. Intenta otra vez.')
      return
    }
    navigate(`/botes/${(res.data as { id: string }).id}`, { replace: true })
  }

  if (loading) return <Loading />
  if (!clientId) return <BackTitle to="/clientes">Primero escoge un cliente</BackTitle>

  const atMarina = f.location_type === 'water_slip' || f.location_type === 'dry_storage'

  return (
    <>
      <BackTitle subtitle={clientName ? `De ${clientName}` : undefined}>{id ? 'Editar bote' : 'Bote nuevo'}</BackTitle>
      <form onSubmit={save} className="space-y-4">
        <Field label="Nombre del bote *">
          <Input required value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="La Tranquila" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca">
            <Input list="boat-makes" value={f.make} onChange={(e) => set('make', e.target.value)} placeholder="Grady-White" />
          </Field>
          <Field label="Modelo">
            <Input value={f.model} onChange={(e) => set('model', e.target.value)} placeholder="Freedom 255" />
          </Field>
          <Field label="Año">
            <Input inputMode="numeric" value={f.year} onChange={(e) => set('year', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2018" />
          </Field>
          <Field label="Largo (pies)">
            <Input inputMode="decimal" value={f.length_ft} onChange={(e) => set('length_ft', e.target.value)} placeholder="25" />
          </Field>
        </div>
        <Suggestions id="boat-makes" values={BOAT_MAKES} />

        <h2 className="pt-3 text-xl font-extrabold text-navy-900">¿Dónde está?</h2>
        <Choice value={f.location_type} onChange={(v) => set('location_type', v)} options={LOCATION_TYPES} />
        {atMarina && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Marina">
                <Input list="marinas" value={f.marina_name} onChange={(e) => set('marina_name', e.target.value)} placeholder="Puerto del Rey" />
              </Field>
            </div>
            <Field label={f.location_type === 'water_slip' ? 'Muelle / Slip' : 'Rack'}>
              <Input value={f.slip_number} onChange={(e) => set('slip_number', e.target.value)} placeholder={f.location_type === 'water_slip' ? 'C-42' : 'Rack 3, nivel 2'} />
            </Field>
          </div>
        )}
        <Suggestions id="marinas" values={PR_MARINAS} />
        <Field label="Pueblo">
          <Select value={f.town} onChange={(e) => set('town', e.target.value)}>
            <option value="">Escoge el pueblo</option>
            {PR_TOWNS.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label={atMarina ? 'Cómo llegar / acceso' : 'Dirección y cómo llegar'} hint="Portón, código, a quién preguntar, dónde estacionar">
          <Textarea value={f.location_notes} onChange={(e) => set('location_notes', e.target.value)} />
        </Field>
        <Field label="Pin en el mapa">
          <MapPicker lat={f.lat} lng={f.lng} onChange={(lat, lng) => setF((p) => ({ ...p, lat, lng }))} />
        </Field>

        <h2 className="pt-3 text-xl font-extrabold text-navy-900">Documentos</h2>
        <Field label="Número de registro (DRNA)">
          <Input value={f.registration_number} onChange={(e) => set('registration_number', e.target.value.toUpperCase())} placeholder="PR-1234-AB" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marbete vence">
            <Input type="date" value={f.marbete_expires} onChange={(e) => set('marbete_expires', e.target.value)} />
          </Field>
          <Field label="Color del casco">
            <Input value={f.hull_color} onChange={(e) => set('hull_color', e.target.value)} placeholder="Blanco" />
          </Field>
        </div>
        <Field label="Número de casco (HIN)">
          <Input value={f.hull_id} onChange={(e) => set('hull_id', e.target.value.toUpperCase())} placeholder="NTLCV123A818" />
        </Field>
        <Field label="Notas del bote">
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        <FormActions busy={busy} error={error} saveLabel={id ? 'Guardar cambios' : 'Guardar bote'} />
      </form>
    </>
  )
}
