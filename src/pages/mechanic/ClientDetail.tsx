import { useWords } from '../../lib/trade'
import { Link, useNavigate, useParams } from 'react-router'
import { useState } from 'react'
import { Calendar, CheckCircle2, HandCoins, Mail, Pencil, Phone, Ship } from 'lucide-react'
import PaySheet from '../../components/PaySheet'
import { useAuth } from '../../auth/AuthProvider'
import { useMechanic } from '../../lib/useMechanic'
import { addPayment, balanceOf, loadMoney, owed, paidSoFar, received, reminderMessage, sumOwed, type MoneyRow } from '../../lib/money'
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
  const w = useWords()
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
    // Salón: sus visitas (lo que se hizo, cuándo, con quién y cuánto)
    const visits = boatIds.length
      ? ((await db().from('appointments').select('id, starts_at, title, status, staff(name, color)').in('boat_id', boatIds).lt('starts_at', new Date().toISOString()).neq('status', 'cancelled').order('starts_at', { ascending: false }).limit(20)).data ?? []) as unknown as { id: string; starts_at: string; title: string | null; status: string; staff: { name: string; color: string } | null }[]
      : []
    return { client, boats, appts, money, visits }
  }, [id])

  if (loading) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se encontró el cliente.'} onRetry={reload} />
  const { client: c, boats, appts, money, visits } = data
  const debt = owed(money)
  const paidHistory = received(money).slice(0, 8)
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
            <span className="text-2xl font-extrabold text-red-800">{formatMoney(sumOwed(debt))}</span>
          </div>
          <div className="mt-2 space-y-2">
            {debt.map((r) => (
              <div key={r.id} className="rounded-xl bg-white p-3">
                <Link to={`/trabajos/${r.id}`} className="flex justify-between gap-2 text-base">
                  <span className="min-w-0 truncate">Factura #{r.invoice!.number} · {r.boats.name} · {ago(r.invoice!.created_at)}{r.payments.length > 0 ? ` · ya pagó ${formatMoney(paidSoFar(r.payments))}` : ''}</span>
                  <b className="shrink-0">{formatMoney(balanceOf(r))}</b>
                </Link>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {c.phone ? (
                    <a href={whatsappLink(c.phone, reminderMessage(r, mech?.ath_movil_number ?? null, profile?.full_name ?? '', w.delItem))} target="_blank" rel="noreferrer"
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
        <Pencil size={18} /> {w.salon ? 'Editar datos y notas' : 'Editar datos del cliente'}
      </Link>

      {w.salon ? (
        <>
          {c.notes && (
            <div className="mt-4 rounded-2xl bg-pink-50 p-3 text-base text-pink-950 ring-1 ring-pink-200">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-pink-700">Notas (fórmula, alergias, gustos)</div>
              <p className="whitespace-pre-line">{c.notes}</p>
            </div>
          )}
          <Link to={`/citas/nueva?clienta=${c.id}`} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-navy-800 text-lg font-bold text-white active:bg-navy-900">
            <Calendar size={22} /> Nueva cita
          </Link>
          {appts.length > 0 && (
            <>
              <SectionHeader title="Próximas citas" />
              <div className="space-y-2">
                {appts.map((a) => (
                  <RowLink key={a.id} to={`/citas/${a.id}`} icon={Calendar} title={`${formatLongDate(a.starts_at)} · ${formatTime(a.starts_at)}`} subtitle={a.title ?? undefined} />
                ))}
              </div>
            </>
          )}
          <SectionHeader title="Historial de visitas" />
          {visits.length === 0 && <p className="text-base text-slate-600">Todavía no ha venido.</p>}
          {visits.length > 0 && (
            <p className="mb-2 text-sm font-semibold text-slate-600">Última visita: {ago(visits[0].starts_at)} · {visits.length} {visits.length === 1 ? 'visita' : 'visitas'}</p>
          )}
          <div className="space-y-1">
            {visits.map((v) => (
              <Link key={v.id} to={`/citas/${v.id}`} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-base ring-1 ring-slate-200">
                {v.staff && <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: v.staff.color }} aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{formatDate(v.starts_at)} · {v.title ?? 'Visita'}{v.staff ? ` · ${v.staff.name}` : ''}</span>
              </Link>
            ))}
          </div>
        </>
      ) : <>
      <SectionHeader title={w.Items} addTo={`/botes/nuevo?cliente=${c.id}`} addLabel={w.Item} />
      {boats.length === 0 && <p className="text-base text-slate-600">{`Todavía no tiene ${w.items}. Toca “${w.Item}” para añadir${w.elItem.startsWith('la') ? 'la' : 'lo'}.`}</p>}
      <div className="space-y-2">
        {boats.map((b) => (
          <RowLink
            key={b.id}
            to={`/botes/${b.id}`}
            icon={Ship}
            title={b.name}
            subtitle={[[b.make, b.model, b.year].filter(Boolean).join(' '), w.marina ? b.marina_name ?? labelOf(LOCATION_TYPES, b.location_type) : b.town].filter(Boolean).join(' · ')}
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
      </>}

      {paidHistory.length > 0 && (
        <>
          <SectionHeader title="Pagos" />
          <div className="space-y-1">
            {paidHistory.map((p) => (
              <Link key={p.key} to={`/trabajos/${p.row.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-base ring-1 ring-slate-200">
                <span className="min-w-0 truncate">{formatDate(p.date)} · {p.row.invoice ? `#${p.row.invoice.number}` : 'Depósito'} · {p.row.boats.name}</span>
                <b className="shrink-0 text-emerald-700">{formatMoney(p.amount)}</b>
              </Link>
            ))}
          </div>
        </>
      )}

      <PaySheet
        open={!!paying}
        balance={paying ? balanceOf(paying) : 0}
        onClose={() => setPaying(null)}
        onPay={async (method, amount) => {
          if (!paying) return
          await addPayment(paying.id, amount, method)
          setPaying(null)
          reload()
        }}
      />

      <ConfirmDelete
        label="Borrar cliente"
        question={`¿Borrar a ${c.full_name}?`}
        detail={`Se borran también sus ${w.items}${w.engines ? ', motores, equipos' : ''} y citas. Esto no se puede deshacer.`}
        onConfirm={async () => {
          must(await db().from('clients').delete().eq('id', c.id))
          navigate('/clientes', { replace: true })
        }}
      />
    </>
  )
}
