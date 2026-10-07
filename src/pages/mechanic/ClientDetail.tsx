import { Link, useNavigate, useParams } from 'react-router'
import { Calendar, Mail, Pencil, Phone, Ship } from 'lucide-react'
import { WhatsAppIcon } from '../../components/BrandIcons'
import { CONTACT_PREFS, LOCATION_TYPES, labelOf } from '../../lib/catalog'
import { db } from '../../lib/db'
import { formatLongDate, formatTime } from '../../lib/format'
import { mailLink, telLink, whatsappLink } from '../../lib/links'
import type { Appointment, Boat, Client } from '../../lib/types'
import { must, useLoad } from '../../lib/useLoad'
import ConfirmDelete from '../../components/ConfirmDelete'
import { BackTitle, ErrorBox, InfoList, LinkButton, Loading, RowLink, SectionHeader } from '../../components/ui'

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useLoad(async () => {
    const client = must(await db().from('clients').select('*').eq('id', id!).single()) as Client
    const boats = must(await db().from('boats').select('*').eq('client_id', id!).order('name')) as Boat[]
    const boatIds = boats.map((b) => b.id)
    const appts = boatIds.length
      ? (must(
          await db().from('appointments').select('*').in('boat_id', boatIds).gte('starts_at', new Date().toISOString()).neq('status', 'cancelled').order('starts_at').limit(5),
        ) as Appointment[])
      : []
    return { client, boats, appts }
  }, [id])

  if (loading) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se encontró el cliente.'} onRetry={reload} />
  const { client: c, boats, appts } = data
  const boatName = (bid: string) => boats.find((b) => b.id === bid)?.name ?? ''

  return (
    <>
      <BackTitle to="/clientes" subtitle={c.town ?? undefined}>{c.full_name}</BackTitle>

      {(c.phone || c.email) && (
        <div className="mb-4 space-y-2">
          {c.phone && <div className="flex"><LinkButton href={whatsappLink(c.phone)} external variant="whatsapp"><WhatsAppIcon size={26} /> WhatsApp</LinkButton></div>}
          <div className="flex gap-2">
            {c.phone && <LinkButton href={telLink(c.phone)}><Phone size={22} /> Llamar</LinkButton>}
            {c.email && <LinkButton href={mailLink(c.email)}><Mail size={22} /> Email</LinkButton>}
          </div>
        </div>
      )}

      <InfoList
        rows={[
          ['Teléfono', c.phone],
          ['Prefiere', labelOf(CONTACT_PREFS, c.preferred_contact)],
          ['Email', c.email],
          ['Dirección', c.address],
          ['Notas', c.notes],
        ]}
      />
      <Link to={`/clientes/${c.id}/editar`} className="mt-3 flex min-h-12 items-center justify-center gap-2 text-base font-bold text-navy-700">
        <Pencil size={18} /> Editar datos del cliente
      </Link>

      <SectionHeader title="Botes" addTo={`/botes/nuevo?cliente=${c.id}`} addLabel="Bote" />
      {boats.length === 0 && <p className="text-base text-slate-600">Todavía no tiene botes. Toca “Bote” para añadirlo.</p>}
      <div className="space-y-2">
        {boats.map((b) => (
          <RowLink
            key={b.id}
            to={`/botes/${b.id}`}
            icon={Ship}
            title={b.name}
            subtitle={[[b.make, b.model, b.year].filter(Boolean).join(' '), b.marina_name ?? labelOf(LOCATION_TYPES, b.location_type)].filter(Boolean).join(' · ')}
          />
        ))}
      </div>

      {boats.length > 0 && (
        <>
          <SectionHeader title="Próximas citas" addTo={`/citas/nueva?bote=${boats[0].id}`} addLabel="Cita" />
          {appts.length === 0 && <p className="text-base text-slate-600">No tiene citas pendientes.</p>}
          <div className="space-y-2">
            {appts.map((a) => (
              <RowLink key={a.id} to={`/citas/${a.id}`} icon={Calendar} title={`${formatLongDate(a.starts_at)} · ${formatTime(a.starts_at)}`} subtitle={[boatName(a.boat_id), a.title].filter(Boolean).join(' · ')} />
            ))}
          </div>
        </>
      )}

      <ConfirmDelete
        label="Borrar cliente"
        question={`¿Borrar a ${c.full_name}?`}
        detail="Se borran también sus botes, motores, equipos y citas. Esto no se puede deshacer."
        onConfirm={async () => {
          must(await db().from('clients').delete().eq('id', c.id))
          navigate('/clientes', { replace: true })
        }}
      />
    </>
  )
}
