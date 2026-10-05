import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { DRIVE_TYPES, ENGINE_MAKES, ENGINE_POSITIONS, FUELS } from '../../lib/catalog'
import { db } from '../../lib/db'
import type { Engine } from '../../lib/types'
import { blank, must, num } from '../../lib/useLoad'
import ConfirmDelete from '../../components/ConfirmDelete'
import { BackTitle, Choice, Field, FormActions, Input, Loading, Suggestions, Textarea } from '../../components/ui'

type Form = {
  position: Engine['position']; make: string; model: string; hp: string; year: string; serial_number: string
  hours: string; fuel: Engine['fuel']; drive_type: NonNullable<Engine['drive_type']> | null; propeller: string; notes: string
}
const EMPTY: Form = { position: 'single', make: '', model: '', hp: '', year: '', serial_number: '', hours: '', fuel: 'gas', drive_type: 'outboard', propeller: '', notes: '' }
const str = (v: unknown) => (v == null ? '' : String(v))

/** /botes/:boatId/motores/nuevo  o  /motores/:id/editar */
export default function EngineForm() {
  const { id, boatId: boatParam } = useParams()
  const navigate = useNavigate()
  const [boatId, setBoatId] = useState(boatParam ?? '')
  const [boatName, setBoatName] = useState('')
  const [f, setF] = useState<Form>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    ;(async () => {
      let bid = boatParam ?? ''
      if (id) {
        const { data } = await db().from('engines').select('*').eq('id', id).single()
        const e = data as Engine | null
        if (e) {
          bid = e.boat_id
          setBoatId(e.boat_id)
          setF({ position: e.position, make: str(e.make), model: str(e.model), hp: str(e.hp), year: str(e.year), serial_number: str(e.serial_number), hours: str(e.hours), fuel: e.fuel, drive_type: e.drive_type, propeller: str(e.propeller), notes: str(e.notes) })
        }
      } else if (bid) {
        // Si ya tiene un motor, el próximo probablemente es el otro lado
        const { data } = await db().from('engines').select('position').eq('boat_id', bid)
        if (data && data.length > 0) setF((p) => ({ ...p, position: data.some((x) => x.position === 'port') ? 'starboard' : 'port' }))
      }
      if (bid) {
        const { data } = await db().from('boats').select('name').eq('id', bid).single()
        setBoatName((data as { name: string } | null)?.name ?? '')
      }
      setLoading(false)
    })()
  }, [id, boatParam])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const row = {
      position: f.position, make: blank(f.make), model: blank(f.model), hp: num(f.hp), year: num(f.year), serial_number: blank(f.serial_number),
      hours: num(f.hours), fuel: f.fuel, drive_type: f.drive_type, propeller: blank(f.propeller), notes: blank(f.notes),
    }
    const res = id ? await db().from('engines').update(row).eq('id', id) : await db().from('engines').insert({ ...row, boat_id: boatId })
    setBusy(false)
    if (res.error) {
      setError('No se pudo guardar. Intenta otra vez.')
      return
    }
    navigate(`/botes/${boatId}`, { replace: true })
  }

  if (loading) return <Loading />

  return (
    <>
      <BackTitle subtitle={boatName ? `Bote ${boatName}` : undefined}>{id ? 'Editar motor' : 'Motor nuevo'}</BackTitle>
      <form onSubmit={save} className="space-y-4">
        <Field label="Posición">
          <Choice value={f.position} onChange={(v) => set('position', v)} options={ENGINE_POSITIONS} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca">
            <Input list="engine-makes" value={f.make} onChange={(e) => set('make', e.target.value)} placeholder="Yamaha" />
          </Field>
          <Field label="Modelo">
            <Input value={f.model} onChange={(e) => set('model', e.target.value)} placeholder="F200" />
          </Field>
          <Field label="HP">
            <Input inputMode="numeric" value={f.hp} onChange={(e) => set('hp', e.target.value.replace(/\D/g, ''))} placeholder="200" />
          </Field>
          <Field label="Año">
            <Input inputMode="numeric" value={f.year} onChange={(e) => set('year', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2019" />
          </Field>
          <Field label="Horas">
            <Input inputMode="decimal" value={f.hours} onChange={(e) => set('hours', e.target.value)} placeholder="412.5" />
          </Field>
          <Field label="Hélice">
            <Input value={f.propeller} onChange={(e) => set('propeller', e.target.value)} placeholder="15¼ x 17" />
          </Field>
        </div>
        <Suggestions id="engine-makes" values={ENGINE_MAKES} />
        <Field label="Número de serie">
          <Input value={f.serial_number} onChange={(e) => set('serial_number', e.target.value.toUpperCase())} placeholder="6AW-1012345" />
        </Field>
        <Field label="Tipo">
          <Choice value={f.drive_type} onChange={(v) => set('drive_type', v)} options={DRIVE_TYPES} />
        </Field>
        <Field label="Combustible">
          <Choice value={f.fuel} onChange={(v) => set('fuel', v)} options={FUELS} />
        </Field>
        <Field label="Notas" hint="Último servicio, problemas conocidos, piezas especiales">
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <FormActions busy={busy} error={error} saveLabel={id ? 'Guardar cambios' : 'Guardar motor'} />
      </form>
      {id && (
        <ConfirmDelete
          label="Borrar motor"
          question="¿Borrar este motor?"
          onConfirm={async () => {
            must(await db().from('engines').delete().eq('id', id))
            navigate(`/botes/${boatId}`, { replace: true })
          }}
        />
      )}
    </>
  )
}
