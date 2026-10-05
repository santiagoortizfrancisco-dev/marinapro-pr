import { Link, useNavigate, useParams } from 'react-router'
import { Calendar, Cog, Cpu, MapPin, Navigation, Pencil, User } from 'lucide-react'
import { DRIVE_TYPES, ENGINE_POSITIONS, EQUIPMENT_CATEGORIES, FUELS, LOCATION_TYPES, labelOf } from '../../lib/catalog'
import { db } from '../../lib/db'
import { formatDate, formatLongDate, formatTime, todayPR } from '../../lib/format'
import { googleMapsLink, hasPlace, wazeLink } from '../../lib/links'
import type { Appointment, Boat, Client, Engine, Equipment } from '../../lib/types'
import { must, useLoad } from '../../lib/useLoad'
import ConfirmDelete from '../../components/ConfirmDelete'
import { BackTitle, ErrorBox, InfoList, LinkButton, Loading, RowLink, SectionHeader } from '../../components/ui'

export default function BoatDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useLoad(async () => {
    const boat = must(await db().from('boats').select('*, clients(id, full_name, phone)').eq('id', id!).single()) as Boat & { clients: Pick<Client, 'id' | 'full_name' | 'phone'> }
    const [engines, equipment, appts] = await Promise.all([
      db().from('engines').select('*').eq('boat_id', id!).order('position'),
      db().from('equipment').select('*').eq('boat_id', id!).order('category'),
      db().from('appointments').select('*, service_requests(description)').eq('boat_id', id!).neq('status', 'cancelled').gte('starts_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('starts_at').limit(8),
    ])
    return { boat, engines: must(engines) as Engine[], equipment: must(equipment) as Equipment[], appts: must(appts) as (Appointment & { service_requests: { description: string } | null })[] }
  }, [id])

  if (loading) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se encontró el bote.'} onRetry={reload} />
  const { boat: b, engines, equipment, appts } = data
  const marbeteVencido = b.marbete_expires && b.marbete_expires < todayPR()

  return (
    <>
      <BackTitle to={`/clientes/${b.client_id}`} subtitle={[b.make, b.model, b.year].filter(Boolean).join(' ') || undefined}>{b.name}</BackTitle>

      <Link to={`/clientes/${b.clients.id}`} className="mb-4 flex min-h-12 items-center gap-2 rounded-xl bg-slate-100 px-4 text-base font-semibold text-slate-800">
        <User size={20} /> {b.clients.full_name}
      </Link>

      {/* Ubicación */}
      <section className="rounded-2xl border-2 border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <MapPin size={26} className="mt-0.5 shrink-0 text-navy-700" />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-slate-900">{labelOf(LOCATION_TYPES, b.location_type)}</div>
            <div className="text-base text-slate-700">
              {[b.marina_name, b.slip_number && (b.location_type === 'water_slip' ? `Muelle ${b.slip_number}` : b.slip_number), b.town].filter(Boolean).join(' · ') || 'Sin datos de ubicación'}
            </div>
            {b.location_notes && <p className="mt-1 whitespace-pre-line text-base text-slate-600">{b.location_notes}</p>}
          </div>
        </div>
        {hasPlace(b) && (
          <div className="mt-3 flex gap-2">
            <LinkButton href={wazeLink(b)} external variant="primary"><Navigation size={20} /> Waze</LinkButton>
            <LinkButton href={googleMapsLink(b)} external><MapPin size={20} /> Google Maps</LinkButton>
          </div>
        )}
      </section>

      <div className="mt-4">
        <InfoList
          rows={[
            ['Largo', b.length_ft ? `${b.length_ft} pies` : null],
            ['Color', b.hull_color],
            ['Registro (DRNA)', b.registration_number],
            ['Marbete vence', b.marbete_expires ? <span className={marbeteVencido ? 'text-red-700' : ''}>{formatDate(b.marbete_expires)}{marbeteVencido ? ' (vencido)' : ''}</span> : null],
            ['HIN', b.hull_id],
            ['Notas', b.notes],
          ]}
        />
      </div>
      <Link to={`/botes/${b.id}/editar`} className="mt-3 flex min-h-12 items-center justify-center gap-2 text-base font-bold text-navy-700">
        <Pencil size={18} /> Editar bote y ubicación
      </Link>

      <SectionHeader title="Motores" addTo={`/botes/${b.id}/motores/nuevo`} addLabel="Motor" />
      {engines.length === 0 && <p className="text-base text-slate-600">Sin motores todavía.</p>}
      <div className="space-y-2">
        {engines.map((e) => (
          <RowLink
            key={e.id}
            to={`/motores/${e.id}/editar`}
            icon={Cog}
            title={`${engines.length > 1 || e.position !== 'single' ? labelOf(ENGINE_POSITIONS, e.position) + ': ' : ''}${[e.make, e.model].filter(Boolean).join(' ') || 'Motor'}`}
            subtitle={[e.hp && `${e.hp} HP`, e.year, e.hours != null && `${e.hours} horas`, e.drive_type && labelOf(DRIVE_TYPES, e.drive_type), labelOf(FUELS, e.fuel), e.serial_number && `Serie ${e.serial_number}`].filter(Boolean).join(' · ')}
          />
        ))}
      </div>

      <SectionHeader title="Equipos" addTo={`/botes/${b.id}/equipos/nuevo`} addLabel="Equipo" />
      {equipment.length === 0 && <p className="text-base text-slate-600">GPS, windlass, generador, radar, A/C, baterías… añade lo que tenga el bote.</p>}
      <div className="space-y-2">
        {equipment.map((q) => (
          <RowLink
            key={q.id}
            to={`/equipos/${q.id}/editar`}
            icon={Cpu}
            title={labelOf(EQUIPMENT_CATEGORIES, q.category)}
            subtitle={[[q.make, q.model].filter(Boolean).join(' '), q.location_on_boat, q.serial_number && `Serie ${q.serial_number}`].filter(Boolean).join(' · ') || undefined}
          />
        ))}
      </div>

      <SectionHeader title="Citas" addTo={`/citas/nueva?bote=${b.id}`} addLabel="Cita" />
      {appts.length === 0 && <p className="text-base text-slate-600">No hay citas para este bote.</p>}
      <div className="space-y-2">
        {appts.map((a) => (
          <RowLink key={a.id} to={`/citas/${a.id}`} icon={Calendar} title={`${formatLongDate(a.starts_at)} · ${formatTime(a.starts_at)}`} subtitle={[a.title, a.service_requests?.description].filter(Boolean).join(' · ') || undefined} />
        ))}
      </div>

      <ConfirmDelete
        label="Borrar bote"
        question={`¿Borrar el bote ${b.name}?`}
        detail="Se borran también sus motores, equipos y citas. Esto no se puede deshacer."
        onConfirm={async () => {
          must(await db().from('boats').delete().eq('id', b.id))
          navigate(`/clientes/${b.client_id}`, { replace: true })
        }}
      />
    </>
  )
}
