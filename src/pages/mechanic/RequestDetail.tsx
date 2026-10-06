import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CalendarPlus, MessageCircle, Phone, Trash2 } from 'lucide-react'
import { db } from '../../lib/db'
import { formatDate, formatTime } from '../../lib/format'
import { telLink, whatsappLink } from '../../lib/links'
import { must, useLoad } from '../../lib/useLoad'
import { BackTitle, Button, ErrorBox, InfoList, Loading } from '../../components/ui'

interface Req {
  id: string
  status: 'new' | 'seen' | 'scheduled' | 'closed'
  description: string
  contact_name: string | null
  contact_phone: string | null
  preferred_when: string | null
  boat_location: string | null
  created_at: string
  boat_id: string
  client_id: string
  boats: { name: string; make: string | null } | null
}

/** Una solicitud que llegó del directorio: quién, qué le pasa al bote, y "Hacer cita". */
export default function RequestDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const { data: r, loading, error } = useLoad(
    async () => must(await db().from('service_requests').select('*, boats(name, make)').eq('id', id!).single()) as unknown as Req,
    [id],
  )

  // Al abrirla queda como "vista"
  useEffect(() => {
    if (r?.status === 'new') db().from('service_requests').update({ status: 'seen' }).eq('id', r.id).then(() => {})
  }, [r])

  async function discard(spam: boolean) {
    await db().from('service_requests').update({ status: 'closed', spam }).eq('id', id!)
    navigate('/agenda', { replace: true })
  }

  if (loading) return <Loading />
  if (error || !r) return <ErrorBox message={error || 'No se encontró la solicitud.'} />

  const first = (r.contact_name ?? '').split(' ')[0]
  const wa = r.contact_phone && whatsappLink(r.contact_phone, `Hola ${first}, es sobre tu bote. Vi tu solicitud en Marine Mechanics PR.`)
  const open = r.status === 'new' || r.status === 'seen'

  return (
    <>
      <BackTitle to="/agenda" subtitle={`Llegó por el directorio · ${formatDate(r.created_at)} ${formatTime(r.created_at)}`}>
        {r.contact_name ?? 'Solicitud'} pidió cita
      </BackTitle>

      <section className="rounded-2xl bg-amber-50 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-navy-800">Qué le pasa al bote</h2>
        <p className="mt-1 whitespace-pre-line text-lg font-semibold text-navy-900">{r.description}</p>
      </section>

      <div className="mt-4">
        <InfoList rows={[
          ['Teléfono', r.contact_phone ?? '—'],
          ['Bote', [r.boats?.name, r.boats?.make].filter(Boolean).join(' · ') || '—'],
          ['Dónde está', r.boat_location ?? '—'],
          ['Cuándo le conviene', r.preferred_when ?? '—'],
        ]} />
      </div>

      {r.contact_phone && (
        <div className="mt-4 flex gap-3">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-base font-bold text-white">
              <MessageCircle size={20} /> WhatsApp
            </a>
          )}
          <a href={telLink(r.contact_phone)} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-navy-800 bg-white px-3 text-base font-bold text-navy-800">
            <Phone size={20} /> Llamar
          </a>
        </div>
      )}

      {open ? (
        <div className="mt-6 space-y-3">
          <Link to={`/citas/nueva?solicitud=${r.id}`} className="flex min-h-16 items-center justify-center gap-2 rounded-xl bg-sun-400 text-xl font-extrabold text-navy-900 active:bg-sun-500">
            <CalendarPlus size={26} /> Hacer cita
          </Link>
          <p className="text-center text-sm text-slate-500">El cliente y el bote ya quedaron guardados en Clientes.</p>
          {confirmDiscard ? (
            <div className="space-y-2 rounded-2xl border-2 border-slate-200 p-4">
              <p className="text-base font-semibold text-slate-800">¿Quitar esta solicitud?</p>
              <Button variant="secondary" onClick={() => discard(false)}>Sí, ya lo atendí por otro lado</Button>
              <Button variant="danger" onClick={() => discard(true)}>Es basura / no es real</Button>
              <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>Cancelar</Button>
            </div>
          ) : (
            <button onClick={() => setConfirmDiscard(true)} className="flex min-h-12 w-full items-center justify-center gap-2 text-base font-bold text-slate-600">
              <Trash2 size={18} /> Quitar solicitud
            </button>
          )}
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-slate-100 p-3 text-center text-base font-semibold text-slate-700">
          {r.status === 'scheduled' ? 'Ya tiene cita.' : 'Solicitud cerrada.'}
        </p>
      )}

      <Link to={`/clientes/${r.client_id}`} className="mt-4 block text-center text-base font-bold text-navy-700 underline">Ver cliente</Link>
    </>
  )
}
