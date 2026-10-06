import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ChevronDown, ChevronUp, Search, Ship, UserPlus, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { DURATIONS, WORK_AREAS } from '../../lib/catalog'
import { db } from '../../lib/db'
import { formatTime, prDay, prRange, prTime, prToISO, todayPR } from '../../lib/format'
import { PR_TOWNS } from '../../lib/towns'
import type { Appointment } from '../../lib/types'
import { blank } from '../../lib/useLoad'
import { ensureWorkOrder } from '../../lib/workOrders'
import { BackTitle, Choice, Field, FormActions, Input, Loading, MultiChoice, Select, Suggestions, Textarea } from '../../components/ui'

interface ClientRow { id: string; full_name: string; phone: string | null; town: string | null; boats: { id: string; name: string }[] }

/** Lo que se escogió: un bote que ya existe, un bote nuevo para un cliente que ya existe, o cliente y bote nuevos. */
type Target = { kind: 'boat'; boatId: string } | { kind: 'newBoat'; clientId: string } | { kind: 'new' } | null

const JOB_SUGGESTIONS = [
  'Servicio de 100 horas', 'Cambio de aceite y filtros', 'Diagnóstico', 'Cambio de impeller', 'Cambio de bujías',
  'Servicio de pata (lower unit)', 'Revisión eléctrica', 'Instalación de GPS / electrónica', 'Reparación de windlass',
  'Servicio de generador', 'Servicio de aire acondicionado', 'Cambio de baterías', 'Reparación de bomba de achique',
  'Servicio de dirección hidráulica', 'Prueba en el agua',
]

function plain(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Hora por defecto: la que se tocó en la agenda; si es hoy, la próxima media hora; si no, 8:00. */
function defaultTime(day: string, hora: string | null): string {
  if (hora) return hora
  if (day !== todayPR()) return '08:00'
  const [h, m] = prTime(new Date()).split(':').map(Number)
  const next = m < 30 ? `${String(h).padStart(2, '0')}:30` : `${String(Math.min(h + 1, 23)).padStart(2, '0')}:00`
  return next
}

export default function AppointmentForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const startDay = params.get('dia') ?? todayPR()
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [pick, setPick] = useState<Target>(params.get('bote') ? { kind: 'boat', boatId: params.get('bote')! } : null)
  const [search, setSearch] = useState('')
  const [newClient, setNewClient] = useState({ full_name: '', phone: '', town: '' })
  const [newBoatName, setNewBoatName] = useState('')
  const [day, setDay] = useState(startDay)
  const [time, setTime] = useState(defaultTime(startDay, params.get('hora')))
  const [duration, setDuration] = useState(120)
  const [title, setTitle] = useState('')
  const [systems, setSystems] = useState<string[]>([])
  const [status, setStatus] = useState<'confirmed' | 'requested'>('confirmed')
  const [notes, setNotes] = useState('')
  const [problem, setProblem] = useState(params.get('problema') ?? '')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [sameDay, setSameDay] = useState<{ id: string; starts_at: string; duration_min: number; boats: { name: string } }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data } = await db().from('clients').select('id, full_name, phone, town, boats(id, name)').order('full_name')
      if (id) {
        const { data: ap } = await db().from('appointments').select('*, service_requests(id, description)').eq('id', id).single()
        const a = ap as (Appointment & { service_requests: { id: string; description: string } | null }) | null
        if (a) {
          setPick({ kind: 'boat', boatId: a.boat_id })
          setDay(prDay(a.starts_at))
          setTime(prTime(a.starts_at))
          setDuration(a.duration_min)
          setTitle(a.title ?? '')
          setSystems(a.systems)
          setStatus(a.status === 'requested' ? 'requested' : 'confirmed')
          setNotes(a.notes ?? '')
          setProblem(a.service_requests?.description ?? '')
          setRequestId(a.service_requests?.id ?? null)
          if (a.title || a.systems.length || a.notes) setMoreOpen(true)
        }
      }
      setClients((data ?? []) as unknown as ClientRow[])
    })()
  }, [id])

  // Lo que ya hay ese día, para no montar dos citas a la misma hora
  useEffect(() => {
    if (!day) return
    const [start, end] = prRange(day, 1)
    db().from('appointments').select('id, starts_at, duration_min, boats(name)').gte('starts_at', start).lt('starts_at', end).neq('status', 'cancelled').order('starts_at')
      .then(({ data }) => setSameDay(((data ?? []) as unknown as typeof sameDay).filter((x) => x.id !== id)))
  }, [day, id])

  const durationOptions = useMemo(() => (DURATIONS.some((d) => d.value === duration) ? DURATIONS : [...DURATIONS, { value: duration, label: `${duration} min` }]), [duration])

  // Resultados de la búsqueda: un renglón por bote (y uno por cliente sin bote)
  const results = useMemo(() => {
    if (!clients) return []
    const term = plain(search.trim())
    const digits = term.replace(/\D/g, '')
    const rows: { key: string; title: string; sub: string; pick: Target }[] = []
    for (const c of clients) {
      const match = (s: string | null) => !term || plain(s ?? '').includes(term)
      const phoneMatch = digits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digits)
      if (c.boats.length === 0) {
        if (match(c.full_name) || phoneMatch) rows.push({ key: c.id, title: c.full_name, sub: 'Sin bote todavía · añadir bote', pick: { kind: 'newBoat', clientId: c.id } })
      }
      for (const b of c.boats) {
        if (match(c.full_name) || match(b.name) || phoneMatch) rows.push({ key: b.id, title: `${b.name} · ${c.full_name}`, sub: [c.phone, c.town].filter(Boolean).join(' · '), pick: { kind: 'boat', boatId: b.id } })
      }
    }
    return rows.slice(0, term ? 20 : 8)
  }, [clients, search])

  const chosen = useMemo(() => {
    if (!pick || !clients) return null
    if (pick.kind === 'boat') {
      for (const c of clients) for (const b of c.boats) if (b.id === pick.boatId) return { title: b.name, sub: c.full_name }
      return { title: 'Bote', sub: '' }
    }
    if (pick.kind === 'newBoat') return { title: 'Bote nuevo', sub: clients.find((c) => c.id === pick.clientId)?.full_name ?? '' }
    return null
  }, [pick, clients])

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!pick) return setError('Escoge el cliente y el bote, o toca “Cliente nuevo”.')
    if (pick.kind === 'new' && !newClient.full_name.trim()) return setError('Escribe el nombre del cliente.')
    if (pick.kind !== 'boat' && !newBoatName.trim()) return setError('Escribe el nombre del bote.')
    setBusy(true)
    try {
      // 1) Cliente y bote (si son nuevos)
      let boatId = pick.kind === 'boat' ? pick.boatId : ''
      let clientId = pick.kind === 'newBoat' ? pick.clientId : ''
      if (pick.kind === 'new') {
        const c = await db().from('clients').insert({ mechanic_id: session!.user.id, full_name: newClient.full_name.trim(), phone: blank(newClient.phone), town: blank(newClient.town) }).select('id').single()
        if (c.error) throw c.error
        clientId = (c.data as { id: string }).id
      }
      if (pick.kind !== 'boat') {
        const town = pick.kind === 'new' ? blank(newClient.town) : clients?.find((c) => c.id === clientId)?.town ?? null
        const b = await db().from('boats').insert({ client_id: clientId, name: newBoatName.trim(), town }).select('id').single()
        if (b.error) throw b.error
        boatId = (b.data as { id: string }).id
      }
      if (!clientId) clientId = clients?.find((c) => c.boats.some((b) => b.id === boatId))?.id ?? ''

      // 2) El problema (se guarda como "problema reportado" del bote)
      let srId = requestId
      const text = problem.trim()
      if (text && srId) {
        await db().from('service_requests').update({ description: text, boat_id: boatId, client_id: clientId }).eq('id', srId)
      } else if (text && clientId) {
        const sr = await db().from('service_requests').insert({ boat_id: boatId, client_id: clientId, description: text, status: 'scheduled' }).select('id').single()
        if (sr.error) throw sr.error
        srId = (sr.data as { id: string }).id
      } else if (!text && srId) {
        await db().from('service_requests').delete().eq('id', srId)
        srId = null
      }

      // 3) La cita
      const row = { service_request_id: srId, boat_id: boatId, starts_at: prToISO(day, time), duration_min: duration, title: blank(title), systems, notes: blank(notes) }
      const res = id
        ? await db().from('appointments').update({ ...row, status }).eq('id', id).select('id').single()
        : await db().from('appointments').insert({ ...row, status, mechanic_id: session!.user.id }).select('id').single()
      if (res.error) throw res.error
      const apptId = (res.data as { id: string }).id

      // 4) Su trabajo: una cita nueva ya trae su trabajo; si se editó, el trabajo copia el problema y el bote
      if (id) {
        await db().from('work_orders').update({ boat_id: boatId, ...(text ? { complaint: text } : {}) }).eq('appointment_id', id).not('status', 'in', '(invoiced,paid)')
      } else {
        await ensureWorkOrder(apptId, session!.user.id)
      }
      navigate(`/citas/${apptId}`, { replace: true })
    } catch (err) {
      console.error(err)
      setError('No se pudo guardar. Revisa la señal e intenta otra vez.')
      setBusy(false)
    }
  }

  if (!clients) return <Loading />

  return (
    <>
      <BackTitle>{id ? 'Mover / editar cita' : 'Cita nueva'}</BackTitle>
      <form onSubmit={save} className="space-y-4">
        {/* ¿Para quién? */}
        <Field label="Cliente y bote *">
          {chosen ? (
            <div className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-navy-800 bg-navy-50 px-4 py-2">
              <Ship size={24} className="shrink-0 text-navy-700" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold text-navy-900">{chosen.title}</div>
                <div className="truncate text-base text-slate-600">{chosen.sub}</div>
              </div>
              {!id && (
                <button type="button" onClick={() => { setPick(null); setNewBoatName('') }} aria-label="Cambiar" className="flex h-12 w-12 items-center justify-center text-slate-600">
                  <X />
                </button>
              )}
            </div>
          ) : pick?.kind === 'new' ? (
            <div className="space-y-3 rounded-xl border-2 border-sun-400 bg-sun-400/10 p-3">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-navy-900">Cliente nuevo</span>
                <button type="button" onClick={() => setPick(null)} aria-label="Cancelar cliente nuevo" className="flex h-10 w-10 items-center justify-center text-slate-600"><X /></button>
              </div>
              <Input required autoComplete="off" value={newClient.full_name} onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })} placeholder="Nombre del cliente *" />
              <Input type="tel" inputMode="tel" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder="Teléfono / WhatsApp" />
              <Select value={newClient.town} onChange={(e) => setNewClient({ ...newClient, town: e.target.value })}>
                <option value="">Pueblo (opcional)</option>
                {PR_TOWNS.map((t) => <option key={t}>{t}</option>)}
              </Select>
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
              {search && results.length === 0 && <p className="text-base text-slate-600">Nadie con “{search}”.</p>}
              <button
                type="button"
                onClick={() => { setPick({ kind: 'new' }); setNewClient({ ...newClient, full_name: /\d/.test(search) ? '' : search, phone: /\d/.test(search) ? search : '' }) }}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy-700 text-lg font-bold text-navy-800 active:bg-navy-50"
              >
                <UserPlus /> Cliente nuevo
              </button>
            </div>
          )}
        </Field>
        {pick && pick.kind !== 'boat' && (
          <Field label="Nombre del bote *" hint="Lo demás del bote (motores, marina, mapa) lo llenas después">
            <Input required value={newBoatName} onChange={(e) => setNewBoatName(e.target.value)} placeholder="La Tranquila" />
          </Field>
        )}

        <Field label="¿Qué problema tiene?" hint="Lo que te dice el cliente">
          <Textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="El motor de babor no arranca en frío" />
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
            <ul className="mt-1">{sameDay.map((x) => <li key={x.id}>{formatTime(x.starts_at)} a {formatTime(new Date(new Date(x.starts_at).getTime() + x.duration_min * 60000))} · {x.boats.name}</li>)}</ul>
          </div>
        )}
        <Field label="¿Cuánto tiempo?">
          <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {durationOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>
        <Field label="¿Ya lo hablaste con el cliente?">
          <Choice value={status} onChange={setStatus} options={[{ value: 'confirmed', label: 'Sí, confirmada' }, { value: 'requested', label: 'Falta confirmar' }]} />
        </Field>

        <button type="button" onClick={() => setMoreOpen((v) => !v)} className="flex min-h-12 w-full items-center justify-between rounded-xl bg-slate-100 px-4 text-base font-bold text-slate-800">
          Más detalles (opcional) {moreOpen ? <ChevronUp /> : <ChevronDown />}
        </button>
        {moreOpen && (
          <div className="space-y-4">
            <Field label="¿Qué se va a hacer?">
              <Input list="jobs" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Servicio de 100 horas" />
            </Field>
            <Suggestions id="jobs" values={JOB_SUGGESTIONS} />
            <Field label="¿En qué?">
              <MultiChoice value={systems} onChange={setSystems} options={WORK_AREAS} />
            </Field>
            <Field label="Notas" hint="Piezas que llevar, llaves, contacto en la marina">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        )}

        <FormActions busy={busy} error={error} saveLabel={id ? 'Guardar cambios' : 'Guardar cita'} />
      </form>
    </>
  )
}
