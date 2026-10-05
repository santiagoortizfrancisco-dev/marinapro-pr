import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { db } from '../../lib/db'
import type { Mechanic } from '../../lib/types'
import { BackTitle, Button, ErrorBox, Field, Loading, Select } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'

interface BoatOption { id: string; name: string; clients: { full_name: string } }

/** Crea un trabajo (desde una cita, desde un bote o escogiendo el bote) y abre su pantalla. */
export default function JobNew() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const apptId = params.get('cita')
  const [boatId, setBoatId] = useState(params.get('bote') ?? '')
  const [boats, setBoats] = useState<BoatOption[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const started = useRef(false) // no crear dos trabajos si React corre el efecto dos veces

  async function create(bid: string) {
    setBusy(true)
    setError('')
    try {
      // Si la cita ya tiene trabajo, abrir ese
      if (apptId) {
        const { data: existing } = await db().from('work_orders').select('id').eq('appointment_id', apptId).limit(1)
        if (existing && existing.length > 0) {
          navigate(`/trabajos/${existing[0].id}`, { replace: true })
          return
        }
      }
      const { data: m } = await db().from('mechanics').select('labor_rate_hour, ivu_on_labor, ivu_on_parts').eq('profile_id', session!.user.id).single()
      const mech = m as Pick<Mechanic, 'labor_rate_hour' | 'ivu_on_labor' | 'ivu_on_parts'> | null
      let complaint: string | null = null
      if (apptId) {
        const { data: ap } = await db().from('appointments').select('boat_id, title, service_requests(description)').eq('id', apptId).single()
        const a = ap as unknown as { boat_id: string; title: string | null; service_requests: { description: string } | null } | null
        if (a) {
          bid = a.boat_id
          complaint = a.service_requests?.description ?? a.title ?? null
        }
      }
      const { data, error } = await db()
        .from('work_orders')
        .insert({
          boat_id: bid,
          appointment_id: apptId,
          complaint,
          labor_rate: mech?.labor_rate_hour ?? 0,
          charge_ivu_labor: mech?.ivu_on_labor ?? true,
          charge_ivu_parts: mech?.ivu_on_parts ?? true,
        })
        .select('id')
        .single()
      if (error) throw error
      navigate(`/trabajos/${(data as { id: string }).id}`, { replace: true })
    } catch (e) {
      console.error(e)
      setError('No se pudo crear el trabajo. Intenta otra vez.')
      setBusy(false)
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (apptId || boatId) {
      create(boatId)
      return
    }
    db().from('boats').select('id, name, clients(full_name)').then(({ data }) => {
      setBoats(((data ?? []) as unknown as BoatOption[]).sort((a, b) => a.clients.full_name.localeCompare(b.clients.full_name)))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) return <ErrorBox message={error} />
  if (!boats || busy) return <Loading />

  return (
    <>
      <BackTitle>Trabajo nuevo</BackTitle>
      {boats.length === 0 ? (
        <p className="rounded-xl bg-sun-400/30 p-4 text-base">Primero añade un cliente con su bote en la pestaña <b>Clientes</b>.</p>
      ) : (
        <div className="space-y-4">
          <Field label="¿De qué bote?">
            <Select value={boatId} onChange={(e) => setBoatId(e.target.value)}>
              <option value="">Escoge el bote</option>
              {boats.map((b) => <option key={b.id} value={b.id}>{b.clients.full_name} — {b.name}</option>)}
            </Select>
          </Field>
          <Button disabled={!boatId} onClick={() => create(boatId)}>Empezar trabajo</Button>
        </div>
      )}
    </>
  )
}
