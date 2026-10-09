import { Link, useNavigate, useParams } from 'react-router'
import { useState } from 'react'
import { Calendar, CheckCircle2, HandCoins, Mail, Pencil, Phone, Ship } from 'lucide-react'
import PaySheet from '../../components/PaySheet'
import { useAuth } from '../../auth/AuthProvider'
import { useMechanic } from '../../lib/useMechanic'
import { loadMoney, owed, payInvoice, reminderMessage, sum, type MoneyRow } from '../../lib/money'
import { WhatsAppIcon } from '../../components/BrandIcons'
import { CONTACT_PREFS, LOCATION_TYPES, labelOf } from '../../lib/catalog'
import { db } from '../../lib/db'
import { ago, formatDate, formatLongDate, formatMoney, formatTime } from '../../lib/format'
import { mailLink, telLink, whatsappLink } from '../../lib/links'
import type { Appointment, Boat, Client } from '../../lib/types'
import { must, useLoad } from '../../lib/useLoad'
import ConfirmDelete from '../../components/ConfirmDelete'
import { BackTitle, ErrorBox, InfoList, LinkButton, Loading, RowLink, SectionHeader } from '../../components/ui'

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: mech } = useMechanic()
  const [paying, setPaying] = useState<MoneyRow | null>(null)
  const { data, loading, error, reload } = useLoad(async () => {
    const client = must(await db().from('clients').select('*').eq('id', id!).single()) as Client
    const boats = must(await db().from('boats').select('*').eq('client_id', id!).order('name')) as Boat[]
    const boatIds = boats.map((b) => b.id)
    const appts = boatIds.length
      ? (must(
          await db().from('appointments').select('*').in('boat_id', boatIds).gte('starts_at', new Date().toISOString()).neq('status', 'cancelled').order('starts_at').limit(5),
        ) as Appointment[])
      : []
    const money = (await loadMoney()).filter((r) => r.boats.clients.id === id)
    return { client, boats, appts, money }
  }, [id])

  if (loading) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se encontró el cliente.'} onRetry={reload} />
  const { client: c, boats, appts, money } = data
  const debt = owed(money)
  const paidHistory = money.filter((r) => r.invoice?.paid_at).sort((a, b) => b.invoice!.paid_at!.localeCompare(a.invoice!.paid_at!)).slice(0, 5)
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

      {debt.length > 0 && (
        <section className="mb-4 rounded-2xl bg-red-50 p-4 ring-2 ring-red-200">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-lg font-extrabold text-red-800"><HandCoins size={22} /> Debe</span>
            <span className="text-2xl font-extrabold text-red-800">{formatMoney(sum(debt))}</span>
          </div>
          <div className="mt-2 space-y-2">
            {debt.map((r) => (
              <div key={r.id} className="rounded-xl bg-white p-3">
                <Link to={`/trabajos/${r.id}`} className="flex justify-between gap-2 text-base">
                  <span className="min-w-0 truncate">Factura #{r.invoice!.number} · {r.boats.name} · {ago(r.invoice!.created_at)}</span>
                  <b className="shrink-0">{formatMoney(Number(r.invoice!.total))}</b>
                </Link>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {c.phone ? (
                    <a href={whatsappLink(c.phone, reminderMessage(r, mech?.ath_movil_number ?? null, profile?.full_name ?? ''))} target="_blank" rel="noreferrer"
                      className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-[#25D366] text-base font-bold text-white">
                      <WhatsAppIcon size={20} /> Recordarle
                    </a>
                  ) : <span />}
                  <button onClick={() => setPaying(r)} className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-emerald-700 text-base font-bold text-white">
                    <CheckCircle2 size={20} /> Ya me pagó
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
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

      {paidHistory.length > 0 && (
        <>
          <SectionHeader title="Pagos" />
          <div className="space-y-1">
            {paidHistory.map((r) => (
              <Link key={r.id} to={`/trabajos/${r.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-base ring-1 ring-slate-200">
                <span className="min-w-0 truncate">{formatDate(r.invoice!.paid_at!)} · #{r.invoice!.number} · {r.boats.name}</span>
                <b className="shrink-0 text-emerald-700">{formatMoney(Number(r.invoice!.total))}</b>
              </Link>
            ))}
          </div>
        </>
      )}

      <PaySheet
        open={!!paying}
        total={Number(paying?.invoice?.total ?? 0)}
        onClose={() => setPaying(null)}
        onPay={async (method) => {
          if (!paying?.invoice) return
          await payInvoice(paying.invoice.id, paying.id, method)
          setPaying(null)
          reload()
        }}
      />

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
