import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { EQUIPMENT_CATEGORIES, EQUIPMENT_MAKES } from '../../lib/catalog'
import { db } from '../../lib/db'
import type { Equipment } from '../../lib/types'
import { blank, must } from '../../lib/useLoad'
import ConfirmDelete from '../../components/ConfirmDelete'
import { BackTitle, Choice, Field, FormActions, Input, Loading, Suggestions, Textarea } from '../../components/ui'

type Form = { category: string | null; make: string; model: string; serial_number: string; location_on_boat: string; installed_at: string; warranty_until: string; notes: string }
const EMPTY: Form = { category: null, make: '', model: '', serial_number: '', location_on_boat: '', installed_at: '', warranty_until: '', notes: '' }
const str = (v: unknown) => (v == null ? '' : String(v))

/** /botes/:boatId/equipos/nuevo  o  /equipos/:id/editar */
export default function EquipmentForm() {
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
        const { data } = await db().from('equipment').select('*').eq('id', id).single()
        const q = data as Equipment | null
        if (q) {
          bid = q.boat_id
          setBoatId(q.boat_id)
          setF({ category: q.category, make: str(q.make), model: str(q.model), serial_number: str(q.serial_number), location_on_boat: str(q.location_on_boat), installed_at: str(q.installed_at), warranty_until: str(q.warranty_until), notes: str(q.notes) })
        }
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
    if (!f.category) {
      setError('Escoge qué equipo es.')
      return
    }
    setBusy(true)
    setError('')
    const row = {
      category: f.category, make: blank(f.make), model: blank(f.model), serial_number: blank(f.serial_number),
      location_on_boat: blank(f.location_on_boat), installed_at: blank(f.installed_at), warranty_until: blank(f.warranty_until), notes: blank(f.notes),
    }
    const res = id ? await db().from('equipment').update(row).eq('id', id) : await db().from('equipment').insert({ ...row, boat_id: boatId })
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
      <BackTitle subtitle={boatName ? `Bote ${boatName}` : undefined}>{id ? 'Editar equipo' : 'Equipo nuevo'}</BackTitle>
      <form onSubmit={save} className="space-y-4">
        <Field label="¿Qué equipo es? *">
          <Choice value={f.category} onChange={(v) => set('category', v)} options={EQUIPMENT_CATEGORIES} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca">
            <Input list="equipment-makes" value={f.make} onChange={(e) => set('make', e.target.value)} placeholder="Garmin" />
          </Field>
          <Field label="Modelo">
            <Input value={f.model} onChange={(e) => set('model', e.target.value)} placeholder="GPSMAP 1243" />
          </Field>
        </div>
        <Suggestions id="equipment-makes" values={EQUIPMENT_MAKES} />
        <Field label="Número de serie">
          <Input value={f.serial_number} onChange={(e) => set('serial_number', e.target.value.toUpperCase())} />
        </Field>
        <Field label="¿Dónde está en el bote?" hint="Ej.: consola, proa, cuarto de máquinas, debajo del asiento">
          <Input value={f.location_on_boat} onChange={(e) => set('location_on_boat', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Instalado">
            <Input type="date" value={f.installed_at} onChange={(e) => set('installed_at', e.target.value)} />
          </Field>
          <Field label="Garantía hasta">
            <Input type="date" value={f.warranty_until} onChange={(e) => set('warranty_until', e.target.value)} />
          </Field>
        </div>
        <Field label="Notas">
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <FormActions busy={busy} error={error} saveLabel={id ? 'Guardar cambios' : 'Guardar equipo'} />
      </form>
      {id && (
        <ConfirmDelete
          label="Borrar equipo"
          question="¿Borrar este equipo?"
          onConfirm={async () => {
            must(await db().from('equipment').delete().eq('id', id))
            navigate(`/botes/${boatId}`, { replace: true })
          }}
        />
      )}
    </>
  )
}
