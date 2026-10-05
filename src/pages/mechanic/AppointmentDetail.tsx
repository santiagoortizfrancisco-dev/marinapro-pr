import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CalendarClock, Check, CheckCircle2, MapPin, MessageCircle, Navigation, Phone, Ship, Wrench, XCircle } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { APPOINTMENT_STATUS, DURATIONS, LOCATION_TYPES, WORK_AREAS, labelOf } from '../../lib/catalog'
import { db } from '../../lib/db'
import { formatDate, formatLongDate, formatTime, prDay } from '../../lib/format'
import { googleMapsLink, hasPlace, telLink, wazeLink, whatsappLink } from '../../lib/links'
import type { Appointment, AppointmentFull } from '../../lib/types'
import { must, useLoad } from '../../lib/useLoad'
import ConfirmDelete from '../../components/ConfirmDelete'
import { Sheet } from '../../components/Sheet'
import { BackTitle, Button, ErrorBox, LinkButton, Loading } from '../../components/ui'

const SELECT = '*, service_requests(description), boats(id, name, location_type, marina_name, slip_number, town, lat, lng, location_notes, clients(id, full_name, phone))'

export default function AppointmentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const { data: a, loading, error, reload, setData } = useLoad(
    async () => must(await db().from('appointments').select(SELECT).eq('id', id!).single()) as AppointmentFull,
    [id],
  )

  async function setStatus(status: Appointment['status']) {
    setBusy(true)
    const { error } = await db().from('appointments').update({ status }).eq('id', id!)
    setBusy(false)
    setCancelOpen(false)
    if (!error && a) setData({ ...a, status })
  }

  if (loading) return <Loading />
  if (error || !a) return <ErrorBox message={error || 'No se encontró la cita.'} onRetry={reload} />

  const b = a.boats
  const c = b.clients
  const st = APPOINTMENT_STATUS[a.status]
  const where = [b.marina_name, b.slip_number && (b.location_type === 'water_slip' ? `muelle ${b.slip_number}` : b.slip_number), b.town].filter(Boolean).join(', ')
  const firstName = c.full_name.split(' ')[0]
  const message =
    `Hola ${firstName}, te confirmo la cita para el bote ${b.name} el ${formatLongDate(a.starts_at).toLowerCase()} (${formatDate(a.starts_at)}) a las ${formatTime(a.starts_at)}` +
    (where ? ` en ${where}` : '') +
    (a.title ? `. Trabajo: ${a.title}` : '') +
    `. Cualquier cambio me avisas. ${profile?.full_name ?? ''}`.trimEnd()

  return (
    <>
      <BackTitle to={`/agenda?dia=${prDay(a.starts_at)}`}>{formatTime(a.starts_at)} · {b.name}</BackTitle>

      <section className="rounded-2xl border-2 border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xl font-extrabold text-navy-900">{formatLongDate(a.starts_at)}</div>
            <div className="text-lg text-slate-700">{formatDate(a.starts_at)} · {formatTime(a.starts_at)} · {labelOf(DURATIONS, a.duration_min) || `${a.duration_min} min`}</div>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${st.style}`}>{st.label}</span>
        </div>
        {a.service_requests?.description && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3">
            <div className="text-sm font-bold uppercase tracking-wide text-amber-800">Problema</div>
            <p className="whitespace-pre-line text-lg text-amber-950">{a.service_requests.description}</p>
          </div>
        )}
        {a.title && <div className="mt-3 text-lg font-bold text-slate-900">{a.title}</div>}
        {a.systems.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {a.systems.map((s) => <span key={s} className="rounded-full bg-navy-50 px-3 py-1 text-base font-semibold text-navy-800">{labelOf(WORK_AREAS, s)}</span>)}
          </div>
        )}
        {a.notes && <p className="mt-3 whitespace-pre-line text-base text-slate-700">{a.notes}</p>}
      </section>

      <Link to={`/botes/${b.id}`} className="mt-3 flex min-h-14 items-center gap-3 rounded-2xl bg-slate-100 px-4 text-base active:bg-slate-200">
        <Ship size={24} className="text-navy-700" />
        <span className="flex-1"><b className="text-lg">{b.name}</b> · {c.full_name}</span>
      </Link>

      {/* Dónde */}
      <section className="mt-3 rounded-2xl border-2 border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <MapPin size={24} className="mt-0.5 shrink-0 text-navy-700" />
          <div className="text-base">
            <div className="font-bold">{labelOf(LOCATION_TYPES, b.location_type)}</div>
            <div className="text-slate-700">{where || 'Sin datos de ubicación'}</div>
            {b.location_notes && <div className="mt-1 whitespace-pre-line text-slate-600">{b.location_notes}</div>}
          </div>
        </div>
        {hasPlace(b) && (
          <div className="mt-3 flex gap-2">
            <LinkButton href={wazeLink(b)} external variant="primary"><Navigation size={20} /> Waze</LinkButton>
            <LinkButton href={googleMapsLink(b)} external><MapPin size={20} /> Maps</LinkButton>
          </div>
        )}
      </section>

      {/* Avisar al cliente */}
      {c.phone && (
        <div className="mt-3 flex gap-2">
          <LinkButton href={whatsappLink(c.phone, message)} external variant="primary"><MessageCircle size={22} /> Enviar cita por WhatsApp</LinkButton>
          <a href={telLink(c.phone)} aria-label="Llamar" className="flex min-h-14 w-16 items-center justify-center rounded-xl border-2 border-navy-800 text-navy-800"><Phone size={24} /></a>
        </div>
      )}

      {/* Acciones */}
      <div className="mt-6 space-y-3">
        {a.status !== 'cancelled' && (
          <Button onClick={() => navigate(`/trabajos/nuevo?cita=${a.id}`)} className="bg-sun-400 text-navy-900 active:bg-sun-500"><Wrench /> Empezar / ver trabajo</Button>
        )}
        {a.status === 'requested' && <Button disabled={busy} onClick={() => setStatus('confirmed')}><Check /> Ya la confirmé con el cliente</Button>}
        {(a.status === 'confirmed' || a.status === 'requested') && <Button disabled={busy} onClick={() => setStatus('done')}><CheckCircle2 /> Marcar como hecha</Button>}
        {a.status === 'done' && <Button variant="secondary" disabled={busy} onClick={() => setStatus('confirmed')}>Desmarcar “hecha”</Button>}
        {a.status === 'cancelled' && <Button variant="secondary" disabled={busy} onClick={() => setStatus('confirmed')}>Volver a activar la cita</Button>}
        <Button variant="secondary" onClick={() => navigate(`/citas/${a.id}/editar`)}><CalendarClock /> Mover o editar</Button>
        {a.status !== 'cancelled' && a.status !== 'done' && (
          <Button variant="danger" onClick={() => setCancelOpen(true)}><XCircle /> Cancelar cita</Button>
        )}
      </div>

      <Sheet open={cancelOpen} title="¿Cancelar esta cita?" onClose={() => setCancelOpen(false)}>
        <p className="mb-5 text-base text-slate-600">La cita queda marcada como cancelada y sale de la agenda. Acuérdate de avisarle al cliente.</p>
        <div className="space-y-3">
          <Button disabled={busy} onClick={() => setStatus('cancelled')} className="bg-red-700 active:bg-red-800"><XCircle /> Sí, cancelar</Button>
          <Button variant="secondary" onClick={() => setCancelOpen(false)}>No</Button>
        </div>
      </Sheet>

      <ConfirmDelete
        label="Borrar cita"
        question="¿Borrar esta cita?"
        detail="Usa esto solo si la creaste por error. Para un cambio de planes es mejor “Cancelar cita”."
        onConfirm={async () => {
          must(await db().from('appointments').delete().eq('id', a.id))
          navigate('/agenda', { replace: true })
        }}
      />
    </>
  )
}
