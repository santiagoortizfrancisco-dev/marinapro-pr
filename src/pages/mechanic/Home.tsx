import { useWords } from '../../lib/trade'
import { Link } from 'react-router'
import { CalendarDays, CalendarHeart, ChevronRight, Receipt, Sparkles, Users, Wallet, Wrench, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import DueServices from '../../components/DueServices'
import StorageHome from '../../components/StorageHome'
import SalonReminders from '../../components/SalonReminders'
import ExamplesBanner from '../../components/ExamplesBanner'
import { db } from '../../lib/db'
import { daysUntil, formatDate, formatLongDate, formatMoney, formatTime, prRange, prTime, todayPR } from '../../lib/format'
import { WORK_ORDER_STATUS } from '../../lib/catalog'
import { loadMoney, owed, sumOwed } from '../../lib/money'
import type { WorkOrder } from '../../lib/types'
import { must, useLoad } from '../../lib/useLoad'
import { CARD, Pill } from '../../components/ui'

interface TodayAppt { id: string; starts_at: string; status: string; boats: { name: string; clients: { full_name: string } } }
interface Working { id: string; status: WorkOrder['status']; appointment_id: string | null; boats: { name: string; clients: { full_name: string } }; appointments: { starts_at: string; title: string | null } | null }

/** Saludo según la hora de Puerto Rico. */
function greeting(): string {
  const h = Number(prTime(new Date()).split(':')[0])
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

/** Poste de batería (el + rojo y el − negro), con brillo de metal. */
function Post({ sign }: { sign: '+' | '−' }) {
  const plus = sign === '+'
  return (
    <span aria-hidden="true" className="flex w-12 flex-col items-center">
      <span className={`text-3xl font-black leading-none [text-shadow:0_1px_0_rgba(255,255,255,0.8)] ${plus ? 'text-red-600' : 'text-slate-900'}`}>{sign}</span>
      <span className={`mt-0.5 h-4 w-11 rounded-t-lg border-2 border-black/25 shadow-inner ${plus ? 'bg-gradient-to-b from-red-400 to-red-700' : 'bg-gradient-to-b from-slate-500 to-slate-900'}`} />
    </span>
  )
}

/** Botón grande sencillo (aire, plomería, electricidad, otros): tarjeta blanca con el ícono de color. */
function PlainTile({ to, icon: Icon, label, sub, color }: { to: string; icon: LucideIcon; label: string; sub?: string; color: string }) {
  return (
    <Link to={to} className="flex h-40 flex-col items-center justify-center gap-2 rounded-3xl bg-white px-3 text-center shadow-[0_4px_18px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70 transition active:scale-[0.97]">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}1a`, color }}><Icon size={32} strokeWidth={2.2} /></span>
      <span className="text-lg font-extrabold leading-tight text-navy-900">{label}</span>
      {sub && <span className="text-base font-extrabold" style={{ color }}>{sub}</span>}
    </Link>
  )
}

/** Pantalla de inicio: lo que puedes hacer (4 botones grandes) y lo que tienes hoy. */
export default function Home() {
  const words = useWords()
  const { profile, session } = useAuth()
  const today = todayPR()
  const { data } = useLoad(async () => {
    const [start, end] = prRange(today, 1)
    const [appts, working, money, storage] = await Promise.all([
      db().from('appointments').select('id, starts_at, status, boats(name, clients(full_name))').gte('starts_at', start).lt('starts_at', end).neq('status', 'cancelled').order('starts_at'),
      db().from('work_orders').select('id, status, appointment_id, boats(name, clients(full_name)), appointments(starts_at, title)').in('status', ['approved', 'waiting_parts', 'in_progress', 'sea_trial']).order('created_at', { ascending: false }).limit(10),
      loadMoney(),
      words.storage ? db().from('storage_contracts').select('monthly_price, end_date, insurance_expires').eq('status', 'active') : Promise.resolve({ data: [] }),
    ])
    // Guardería: cuántos botes, la renta del mes y cuántos contratos o seguros están por vencer
    const k = (storage.data ?? []) as { monthly_price: number; end_date: string | null; insurance_expires: string | null }[]
    const soon = (d: string | null, days: number) => Boolean(d) && daysUntil(d!) <= days
    const yard = { boats: k.length, monthly: k.reduce((t, c) => t + Number(c.monthly_price), 0), alerts: k.filter((c) => soon(c.end_date, 30) || soon(c.insurance_expires, 15)).length }
    return { appts: must(appts) as unknown as TodayAppt[], working: must(working) as unknown as Working[], debt: sumOwed(owed(money)), yard }
  }, [today])

  const first = (profile?.full_name ?? '').split(' ')[0]
  const debt = data ? formatMoney(data.debt) : '…'
  // Cada negocio con su estilo: baterías para los mecánicos (botes y autos), belleza para el salón, sencillo para los demás
  // Mismo orden y mismos botones de siempre; todos con el estilo limpio (cada oficio con sus colores)
  const look = words.storage ? 'storage' : 'plain'
  const tileColors = words.salon ? ['#db2777', '#9333ea', '#ea580c', '#e11d48']
    : words.trade === 'pool' ? ['#0891b2', '#0369a1', '#334155', '#dc2626']
    : ['#1d4ed8', '#0369a1', '#334155', '#dc2626']

  return (
    <>
      <div className="mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight text-navy-900">¡{greeting()}{first ? `, ${first}` : ''}!</h1>
        <p className="mt-1 text-base text-slate-600">{formatLongDate(today)}</p>
      </div>

      <ExamplesBanner />

      {look === 'plain' && (
        <div className="grid grid-cols-2 gap-3">
          <PlainTile to="/citas/nueva" icon={words.salon ? CalendarHeart : CalendarDays} label="Hacer cita" color={tileColors[0]} />
          <PlainTile to="/cobrar" icon={words.salon ? Sparkles : Receipt} label="Factura rápida" color={tileColors[1]} />
          <PlainTile to="/clientes" icon={Users} label={words.Clients} color={tileColors[2]} />
          <PlainTile to="/trabajos" icon={Wallet} label="Me deben" sub={debt} color={tileColors[3]} />
        </div>
      )}

      {look === 'storage' && session && <StorageHome me={session.user.id} />}

      {words.salon && <SalonReminders />}

      {/* Hoy */}
      {!words.salon && !words.storage && <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-navy-900">Hoy{data ? ` · ${data.appts.length} ${data.appts.length === 1 ? 'cita' : 'citas'}` : ''}</h2>
          <Link to="/agenda" className="flex items-center text-base font-bold text-navy-700">Ver agenda <ChevronRight size={18} /></Link>
        </div>
        <div className={`${CARD} divide-y divide-slate-100`}>
          {data && data.appts.length === 0 && <p className="p-4 text-base text-slate-600">No tienes citas hoy.</p>}
          {data?.appts.map((a) => (
            <Link key={a.id} to={`/citas/${a.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
              <span className="w-20 shrink-0 text-base font-extrabold text-navy-900">{formatTime(a.starts_at)}</span>
              <span className="min-w-0 flex-1 truncate text-base text-slate-800">{a.boats.name} · {a.boats.clients.full_name}</span>
              <ChevronRight size={18} className="shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
      </section>}

      {/* Trabajos en proceso */}
      {data && !words.salon && !words.storage && data.working.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-extrabold text-navy-900"><Wrench size={22} /> Trabajando</h2>
          <div className={`${CARD} divide-y divide-slate-100`}>
            {data.working.map((w) => (
              <Link key={w.id} to={w.appointment_id ? `/citas/${w.appointment_id}` : `/trabajos/${w.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                <span className="min-w-0 flex-1 truncate text-base text-slate-800">{w.boats.name} · {w.boats.clients.full_name}</span>
                <Pill label={WORK_ORDER_STATUS[w.status].label} style={WORK_ORDER_STATUS[w.status].style} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {!words.salon && !words.storage && (
        <div className="mt-6">
          <DueServices />
        </div>
      )}
    </>
  )
}
