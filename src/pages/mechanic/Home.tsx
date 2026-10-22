import { useWords } from '../../lib/trade'
import { Link } from 'react-router'
import { CalendarDays, CalendarHeart, ChevronRight, Heart, Receipt, Sparkles, Users, Wallet, Wrench, Zap, type LucideIcon } from 'lucide-react'
import { NailPolishIcon, NailsHandIcon } from '../../components/BeautyIcons'
import { GaugeIcon, PistonIcon, PropellerIcon, SparkPlugIcon } from '../../components/PartIcons'
import { useAuth } from '../../auth/AuthProvider'
import DueServices from '../../components/DueServices'
import SalonReminders from '../../components/SalonReminders'
import ExamplesBanner from '../../components/ExamplesBanner'
import { db } from '../../lib/db'
import { formatDate, formatLongDate, formatMoney, formatTime, prRange, prTime, todayPR } from '../../lib/format'
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

/** Botón grande con forma de batería de bote: dos postes arriba y cuerpo con brillo de metal. */
function Tile({ to, icon: Icon, label, sub, from, color, badge }: { to: string; icon: LucideIcon; label: string; sub?: string; from: string; color: string; badge?: React.ReactNode }) {
  return (
    <Link to={to} className="group block transition active:scale-[0.97]">
      <span className="flex justify-between px-4">
        <Post sign="−" />
        <Post sign="+" />
      </span>
      <span
        className="relative flex h-44 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-black/25 px-3 pb-6 pt-3 text-center text-white shadow-lg [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]"
        style={{ backgroundImage: `linear-gradient(160deg, ${from} 0%, ${color} 100%)` }}
      >
        {/* brillo de metal y las rayitas de la batería */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/30 to-transparent" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 bottom-2 h-1.5 rounded-full bg-black/15" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-md ring-4 ring-white/40" style={{ color }}>
          <Icon size={38} strokeWidth={2.2} />
          {badge && <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full text-white ring-2 ring-white" style={{ backgroundColor: color }}>{badge}</span>}
        </span>
        <span className="relative text-lg font-extrabold leading-tight">{label}</span>
        {sub && <span className="relative rounded-full bg-black/20 px-3 py-0.5 text-base font-extrabold">{sub}</span>}
      </span>
    </Link>
  )
}

/** Botón grande del salón: tarjeta redonda rosada, con su ícono de belleza (sin baterías). */
function BeautyTile({ to, icon: Icon, label, sub, from, color, badge }: { to: string; icon: LucideIcon; label: string; sub?: string; from: string; color: string; badge?: React.ReactNode }) {
  return (
    <Link to={to} className="block transition active:scale-[0.97]">
      <span
        className="relative flex h-44 flex-col items-center justify-center gap-2 overflow-hidden rounded-[28px] px-3 text-center text-white shadow-lg shadow-pink-900/20 [text-shadow:0_1px_2px_rgba(0,0,0,0.2)]"
        style={{ backgroundImage: `linear-gradient(150deg, ${from} 0%, ${color} 100%)` }}
      >
        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-white/10" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-md" style={{ color }}>
          <Icon size={36} strokeWidth={2} />
          {badge && <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full text-white ring-2 ring-white" style={{ backgroundColor: color }}>{badge}</span>}
        </span>
        <span className="relative text-lg font-extrabold leading-tight">{label}</span>
        {sub && <span className="relative rounded-full bg-black/15 px-3 py-0.5 text-base font-extrabold">{sub}</span>}
      </span>
    </Link>
  )
}

/** Botón grande sencillo (aire, plomería, electricidad, otros): tarjeta blanca con el ícono de color. */
function PlainTile({ to, icon: Icon, label, sub, color }: { to: string; icon: LucideIcon; label: string; sub?: string; color: string }) {
  return (
    <Link to={to} className="flex h-40 flex-col items-center justify-center gap-2 rounded-3xl bg-white px-3 text-center shadow-[0_6px_24px_-14px_rgba(8,47,73,0.45)] ring-1 ring-slate-200 transition active:scale-[0.97]">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: color }}><Icon size={34} /></span>
      <span className="text-lg font-extrabold leading-tight text-navy-900">{label}</span>
      {sub && <span className="text-base font-extrabold" style={{ color }}>{sub}</span>}
    </Link>
  )
}

/** Pantalla de inicio: lo que puedes hacer (4 botones grandes) y lo que tienes hoy. */
export default function Home() {
  const words = useWords()
  const { profile } = useAuth()
  const today = todayPR()
  const { data } = useLoad(async () => {
    const [start, end] = prRange(today, 1)
    const [appts, working, money] = await Promise.all([
      db().from('appointments').select('id, starts_at, status, boats(name, clients(full_name))').gte('starts_at', start).lt('starts_at', end).neq('status', 'cancelled').order('starts_at'),
      db().from('work_orders').select('id, status, appointment_id, boats(name, clients(full_name)), appointments(starts_at, title)').in('status', ['approved', 'waiting_parts', 'in_progress', 'sea_trial']).order('created_at', { ascending: false }).limit(10),
      loadMoney(),
    ])
    return { appts: must(appts) as unknown as TodayAppt[], working: must(working) as unknown as Working[], debt: sumOwed(owed(money)) }
  }, [today])

  const first = (profile?.full_name ?? '').split(' ')[0]
  const debt = data ? formatMoney(data.debt) : '…'
  // Cada negocio con su estilo: baterías para los mecánicos (botes y autos), belleza para el salón, sencillo para los demás
  const look = words.salon ? 'beauty' : ['marine', 'auto'].includes(words.trade) ? 'battery' : 'plain'

  return (
    <>
      <div className="mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight text-navy-900">¡{greeting()}{first ? `, ${first}` : ''}!</h1>
        <p className="mt-1 text-base text-slate-600">{formatLongDate(today)}</p>
      </div>

      <ExamplesBanner />

      {look === 'battery' && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <Tile to="/citas/nueva" icon={PropellerIcon as unknown as LucideIcon} badge={<CalendarDays size={16} strokeWidth={2.5} />} label="Hacer cita" from="#3b82f6" color="#1e3a8a" />
          <Tile to="/cobrar" icon={GaugeIcon as unknown as LucideIcon} badge={<Zap size={16} strokeWidth={2.5} />} label="Factura rápida" from="#38bdf8" color="#0369a1" />
          <Tile to="/clientes" icon={SparkPlugIcon as unknown as LucideIcon} badge={<Users size={16} strokeWidth={2.5} />} label={words.Clients} from="#64748b" color="#0f172a" />
          <Tile to="/trabajos" icon={PistonIcon as unknown as LucideIcon} label="Me deben" sub={debt} from="#fca5a5" color="#ef4444" />
        </div>
      )}
      {look === 'beauty' && (
        <div className="grid grid-cols-2 gap-3">
          <BeautyTile to="/citas/nueva" icon={NailPolishIcon as unknown as LucideIcon} badge={<CalendarHeart size={15} strokeWidth={2.5} />} label="Hacer cita" from="#f472b6" color="#be185d" />
          <BeautyTile to="/cobrar" icon={NailsHandIcon as unknown as LucideIcon} badge={<Sparkles size={15} strokeWidth={2.5} />} label="Factura rápida" from="#c084fc" color="#7e22ce" />
          <BeautyTile to="/clientes" icon={Users} badge={<Heart size={14} strokeWidth={2.5} />} label={words.Clients} from="#fb923c" color="#c2410c" />
          <BeautyTile to="/trabajos" icon={Wallet} label="Me deben" sub={debt} from="#fb7185" color="#be123c" />
        </div>
      )}
      {look === 'plain' && (
        <div className="grid grid-cols-2 gap-3">
          <PlainTile to="/citas/nueva" icon={CalendarDays} label="Hacer cita" color={words.trade === 'pool' ? '#0891b2' : '#1d4ed8'} />
          <PlainTile to="/cobrar" icon={Receipt} label="Factura rápida" color="#0369a1" />
          <PlainTile to="/clientes" icon={Users} label={words.Clients} color="#334155" />
          <PlainTile to="/trabajos" icon={Wallet} label="Me deben" sub={debt} color="#dc2626" />
        </div>
      )}

      {words.salon && <SalonReminders />}

      {/* Hoy */}
      <section className="mt-6">
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
      </section>

      {/* Trabajos en proceso */}
      {/* Salón: lo que ya pasó y falta cobrar (las citas de más tarde salen en Hoy) */}
      {data && words.salon && (() => {
        const now = Date.now()
        const due = data.working.filter((x) => !x.appointments || new Date(x.appointments.starts_at).getTime() <= now)
        return due.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 flex items-center gap-2 text-xl font-extrabold text-navy-900"><Wallet size={22} /> Sin cobrar</h2>
            <div className={`${CARD} divide-y divide-slate-100`}>
              {due.map((x) => (
                <Link key={x.id} to={x.appointment_id ? `/citas/${x.appointment_id}` : `/trabajos/${x.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-slate-900">{x.boats.clients.full_name}</span>
                    <span className="block truncate text-sm text-slate-600">{[x.appointments ? `${formatDate(x.appointments.starts_at).slice(0, 5)} ${formatTime(x.appointments.starts_at)}` : null, x.appointments?.title].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-pink-100 px-3 py-1 text-sm font-bold text-pink-800">Por cobrar</span>
                </Link>
              ))}
            </div>
          </section>
        )
      })()}
      {data && !words.salon && data.working.length > 0 && (
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

      <div className="mt-6">
        <DueServices />
      </div>
    </>
  )
}
