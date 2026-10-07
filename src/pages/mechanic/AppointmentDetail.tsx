import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CalendarClock, Check, MapPin, Navigation, Phone, Ship, XCircle } from 'lucide-react'
import { WhatsAppIcon } from '../../components/BrandIcons'
import { useAuth } from '../../auth/AuthProvider'
import { APPOINTMENT_STATUS, DURATIONS, LOCATION_TYPES, WORK_AREAS, labelOf } from '../../lib/catalog'
import { db } from '../../lib/db'
import { formatDate, formatLongDate, formatTime, prDay } from '../../lib/format'
import { googleMapsLink, hasPlace, telLink, wazeLink, whatsappLink } from '../../lib/links'
import type { Appointment, AppointmentFull } from '../../lib/types'
import { must, useLoad } from '../../lib/useLoad'
import { ensureWorkOrder } from '../../lib/workOrders'
import ConfirmDelete from '../../components/ConfirmDelete'
import JobPanel from '../../components/JobPanel'
import { Sheet } from '../../components/Sheet'
import { BackTitle, Button, ErrorBox, LinkButton, Loading } from '../../components/ui'

const SELECT = '*, service_requests(description), boats(id, name, location_type, marina_name, slip_number, town, lat, lng, location_notes, clients(id, full_name, phone))'

/** La visita completa: la cita arriba y, debajo, su trabajo (problema, piezas, fotos, factura). */
export default function AppointmentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const { data, loading, error, reload, setData } = useLoad(async () => {
    const appt = must(await db().from('appointments').select(SELECT).eq('id', id!).single()) as AppointmentFull
    // Citas viejas (antes de juntar cita y trabajo) reciben su trabajo al abrirlas
    const woId = appt.status === 'cancelled'
      ? ((await db().from('work_orders').select('id').eq('appointment_id', id!).limit(1)).data?.[0]?.id as string | undefined) ?? null
      : await ensureWorkOrder(id!, session!.user.id)
    return { a: appt, woId }
  }, [id])

  async function setStatus(status: Appointment['status']) {
    setBusy(true)
    const { error } = await db().from('appointments').update({ status }).eq('id', id!)
    setBusy(false)
    setCancelOpen(false)
    if (!error && data) setData({ ...data, a: { ...data.a, status } })
  }

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se encontró la cita.'} onRetry={reload} />

  const { a, woId } = data
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
      <BackTitle to={`/agenda?dia=${prDay(a.starts_at)}`}>{b.name} · {c.full_name.split(' ').slice(0, 2).join(' ')}</BackTitle>

      {/* La cita */}
      <section className="rounded-2xl border-2 border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xl font-extrabold text-navy-900">{formatLongDate(a.starts_at)}</div>
            <div className="text-lg text-slate-700">{formatTime(a.starts_at)} · {labelOf(DURATIONS, a.duration_min) || `${a.duration_min} min`}</div>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${st.style}`}>{st.label}</span>
        </div>
        {a.title && <div className="mt-3 text-lg font-bold text-slate-900">{a.title}</div>}
        {a.systems.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {a.systems.map((s) => <span key={s} className="rounded-full bg-navy-50 px-3 py-1 text-base font-semibold text-navy-800">{labelOf(WORK_AREAS, s)}</span>)}
          </div>
        )}
        {a.notes && <p className="mt-3 whitespace-pre-line text-base text-slate-700">{a.notes}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => navigate(`/citas/${a.id}/editar`)} className="min-h-12 text-base"><CalendarClock size={20} /> Mover / editar</Button>
          {a.status === 'requested' ? (
            <Button disabled={busy} onClick={() => setStatus('confirmed')} className="min-h-12 text-base"><Check size={20} /> Ya confirmé</Button>
          ) : a.status === 'cancelled' ? (
            <Button variant="secondary" disabled={busy} onClick={() => setStatus('confirmed')} className="min-h-12 text-base">Activar otra vez</Button>
          ) : (
            <Button variant="danger" onClick={() => setCancelOpen(true)} className="min-h-12 text-base"><XCircle size={20} /> Cancelar</Button>
          )}
        </div>
      </section>

      {/* El bote y dónde está */}
      <section className="mt-3 rounded-2xl border-2 border-slate-200 bg-white p-4">
        <Link to={`/botes/${b.id}`} className="flex items-center gap-3 text-base">
          <Ship size={24} className="shrink-0 text-navy-700" />
          <span className="flex-1"><b className="text-lg">{b.name}</b> · {c.full_name}</span>
        </Link>
        <div className="mt-2 flex items-start gap-3 text-base">
          <MapPin size={24} className="mt-0.5 shrink-0 text-navy-700" />
          <div>
            <div className="font-bold">{labelOf(LOCATION_TYPES, b.location_type)}</div>
            <div className="text-slate-700">{where || 'Sin datos de ubicación'}</div>
            {b.location_notes && <div className="mt-1 whitespace-pre-line text-slate-600">{b.location_notes}</div>}
          </div>
        </div>
        {hasPlace(b) && (
          <div className="mt-3 flex gap-2">
            <LinkButton href={wazeLink(b)} external><Navigation size={20} /> Waze</LinkButton>
            <LinkButton href={googleMapsLink(b)} external><MapPin size={20} /> Maps</LinkButton>
          </div>
        )}
        {c.phone && (
          <div className="mt-2 flex gap-2">
            <LinkButton href={whatsappLink(c.phone, message)} external variant="whatsapp"><WhatsAppIcon size={24} /> Enviar cita por WhatsApp</LinkButton>
            <a href={telLink(c.phone)} aria-label="Llamar" className="flex min-h-14 w-16 items-center justify-center rounded-xl border-2 border-navy-800 text-navy-800"><Phone size={24} /></a>
          </div>
        )}
      </section>

      {/* El trabajo de esta visita */}
      {woId && <JobPanel woId={woId} embedded />}

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
        detail="Se borra también su trabajo, piezas y fotos, si no tiene factura. Usa esto solo si la creaste por error."
        onConfirm={async () => {
          if (woId) {
            const { data: inv } = await db().from('invoices').select('id').eq('work_order_id', woId).limit(1)
            if (inv && inv.length > 0) throw new Error('Tiene factura')
            const { data: photos } = await db().from('photos').select('storage_path').eq('work_order_id', woId)
            if (photos?.length) await db().storage.from('photos').remove(photos.map((p) => p.storage_path as string))
            must(await db().from('work_orders').delete().eq('id', woId))
          }
          must(await db().from('appointments').delete().eq('id', a.id))
          navigate('/agenda', { replace: true })
        }}
      />
    </>
  )
}
