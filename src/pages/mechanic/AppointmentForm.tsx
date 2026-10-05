import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { DURATIONS, WORK_AREAS } from '../../lib/catalog'
import { db } from '../../lib/db'
import { formatTime, prDay, prRange, prTime, prToISO, todayPR } from '../../lib/format'
import type { Appointment } from '../../lib/types'
import { blank } from '../../lib/useLoad'
import { BackTitle, Choice, Field, FormActions, Input, Loading, MultiChoice, Select, Suggestions, Textarea } from '../../components/ui'

interface BoatOption { id: string; name: string; client_id: string; clients: { full_name: string } }

const JOB_SUGGESTIONS = [
  'Servicio de 100 horas', 'Cambio de aceite y filtros', 'Diagnóstico', 'Cambio de impeller', 'Cambio de bujías',
  'Servicio de pata (lower unit)', 'Revisión eléctrica', 'Instalación de GPS / electrónica', 'Reparación de windlass',
  'Servicio de generador', 'Servicio de aire acondicionado', 'Cambio de baterías', 'Reparación de bomba de achique',
  'Servicio de dirección hidráulica', 'Prueba en el agua',
]

export default function AppointmentForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [boats, setBoats] = useState<BoatOption[] | null>(null)
  const [boatId, setBoatId] = useState(params.get('bote') ?? '')
  const [day, setDay] = useState(params.get('dia') ?? todayPR())
  const [time, setTime] = useState('08:00')
  const [duration, setDuration] = useState(120)
  const [title, setTitle] = useState('')
  const [systems, setSystems] = useState<string[]>([])
  const [status, setStatus] = useState<'confirmed' | 'requested'>('confirmed')
  const [notes, setNotes] = useState('')
  const [problem, setProblem] = useState('')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [sameDay, setSameDay] = useState<{ id: string; starts_at: string; boats: { name: string } }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data } = await db().from('boats').select('id, name, client_id, clients(full_name)')
      const list = ((data ?? []) as unknown as BoatOption[]).sort((a, b) => a.clients.full_name.localeCompare(b.clients.full_name) || a.name.localeCompare(b.name))
      if (id) {
        const { data: ap } = await db().from('appointments').select('*, service_requests(id, description)').eq('id', id).single()
        const a = ap as (Appointment & { service_requests: { id: string; description: string } | null }) | null
        if (a) {
          setBoatId(a.boat_id)
          setDay(prDay(a.starts_at))
          setTime(prTime(a.starts_at))
          setDuration(a.duration_min)
          setTitle(a.title ?? '')
          setSystems(a.systems)
          setStatus(a.status === 'requested' ? 'requested' : 'confirmed')
          setNotes(a.notes ?? '')
          setProblem(a.service_requests?.description ?? '')
          setRequestId(a.service_requests?.id ?? null)
        }
      }
      setBoats(list)
    })()
  }, [id])

  // Lo que ya hay ese día, para no montar dos citas a la misma hora
  useEffect(() => {
    if (!day) return
    const [start, end] = prRange(day, 1)
    db().from('appointments').select('id, starts_at, boats(name)').gte('starts_at', start).lt('starts_at', end).neq('status', 'cancelled').order('starts_at')
      .then(({ data }) => setSameDay(((data ?? []) as unknown as typeof sameDay).filter((x) => x.id !== id)))
  }, [day, id])

  const durationOptions = useMemo(() => (DURATIONS.some((d) => d.value === duration) ? DURATIONS : [...DURATIONS, { value: duration, label: `${duration} min` }]), [duration])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!boatId) {
      setError('Escoge el bote.')
      return
    }
    setBusy(true)
    setError('')
    // El problema se guarda como "problema reportado" del bote (service_requests) y se liga a la cita
    let srId = requestId
    const text = problem.trim()
    const clientId = boats?.find((b) => b.id === boatId)?.client_id
    if (text && srId) {
      await db().from('service_requests').update({ description: text, boat_id: boatId, client_id: clientId }).eq('id', srId)
    } else if (text && clientId) {
      const sr = await db().from('service_requests').insert({ boat_id: boatId, client_id: clientId, description: text, status: 'scheduled' }).select('id').single()
      if (sr.error) {
        setBusy(false)
        setError('No se pudo guardar el problema. Intenta otra vez.')
        return
      }
      srId = (sr.data as { id: string }).id
    } else if (!text && srId) {
      await db().from('service_requests').delete().eq('id', srId)
      srId = null
    }
    const row = { service_request_id: srId, boat_id: boatId, starts_at: prToISO(day, time), duration_min: duration, title: blank(title), systems, notes: blank(notes) }
    const res = id
      ? await db().from('appointments').update({ ...row, status }).eq('id', id).select('id').single()
      : await db().from('appointments').insert({ ...row, status, mechanic_id: session!.user.id }).select('id').single()
    setBusy(false)
    if (res.error) {
      setError('No se pudo guardar. Intenta otra vez.')
      return
    }
    navigate(`/citas/${(res.data as { id: string }).id}`, { replace: true })
  }

  if (!boats) return <Loading />

  return (
    <>
      <BackTitle>{id ? 'Mover / editar cita' : 'Cita nueva'}</BackTitle>
      {boats.length === 0 ? (
        <p className="rounded-xl bg-sun-400/30 p-4 text-base">Primero añade un cliente con su bote en la pestaña <b>Clientes</b>.</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <Field label="Bote *">
            <Select required value={boatId} onChange={(e) => setBoatId(e.target.value)}>
              <option value="">Escoge el bote</option>
              {boats.map((b) => <option key={b.id} value={b.id}>{b.clients.full_name} — {b.name}</option>)}
            </Select>
          </Field>
          <Field label="¿Qué problema tiene?" hint="Lo que te dice el cliente. Ej.: el motor de babor no arranca en frío y suena la alarma de aceite">
            <Textarea rows={4} value={problem} onChange={(e) => setProblem(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Día *">
              <Input type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
            </Field>
            <Field label="Hora *">
              <Input type="time" required step={900} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          {sameDay.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-base text-amber-900">
              <b>Ese día ya tienes:</b>
              <ul className="mt-1">{sameDay.map((x) => <li key={x.id}>{formatTime(x.starts_at)} · {x.boats.name}</li>)}</ul>
            </div>
          )}
          <Field label="¿Cuánto tiempo?">
            <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {durationOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </Select>
          </Field>
          <Field label="¿Qué se va a hacer?">
            <Input list="jobs" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Servicio de 100 horas" />
          </Field>
          <Suggestions id="jobs" values={JOB_SUGGESTIONS} />
          <Field label="¿En qué?">
            <MultiChoice value={systems} onChange={setSystems} options={WORK_AREAS} />
          </Field>
          <Field label="¿Ya lo hablaste con el cliente?">
            <Choice
              value={status}
              onChange={setStatus}
              options={[
                { value: 'confirmed', label: 'Sí, confirmada' },
                { value: 'requested', label: 'Falta confirmar' },
              ]}
            />
          </Field>
          <Field label="Notas" hint="Piezas que llevar, llaves, contacto en la marina">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <FormActions busy={busy} error={error} saveLabel={id ? 'Guardar cambios' : 'Guardar cita'} />
        </form>
      )}
    </>
  )
}
