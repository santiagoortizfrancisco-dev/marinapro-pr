import { Link } from 'react-router'
import { CalendarDays, ChevronRight, Plus, Wrench, Zap, type LucideIcon } from 'lucide-react'
import { GaugeIcon, PistonIcon, PropellerIcon, SparkPlugIcon } from '../../components/PartIcons'
import { useAuth } from '../../auth/AuthProvider'
import DueServices from '../../components/DueServices'
import { db } from '../../lib/db'
import { formatLongDate, formatMoney, formatTime, prRange, prTime, todayPR } from '../../lib/format'
import { WORK_ORDER_STATUS } from '../../lib/catalog'
import { loadMoney, owed, sum } from '../../lib/money'
import type { WorkOrder } from '../../lib/types'
import { must, useLoad } from '../../lib/useLoad'
import { CARD, Pill } from '../../components/ui'

interface TodayAppt { id: string; starts_at: string; status: string; boats: { name: string; clients: { full_name: string } } }
interface Working { id: string; status: WorkOrder['status']; appointment_id: string | null; boats: { name: string; clients: { full_name: string } } }

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
        className="relative flex min-h-32 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-black/25 px-3 pb-6 pt-3 text-center text-white shadow-lg [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]"
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

/** Pantalla de inicio: lo que puedes hacer (4 botones grandes) y lo que tienes hoy. */
export default function Home() {
  const { profile } = useAuth()
  const today = todayPR()
  const { data } = useLoad(async () => {
    const [start, end] = prRange(today, 1)
    const [appts, working, money] = await Promise.all([
      db().from('appointments').select('id, starts_at, status, boats(name, clients(full_name))').gte('starts_at', start).lt('starts_at', end).neq('status', 'cancelled').order('starts_at'),
      db().from('work_orders').select('id, status, appointment_id, boats(name, clients(full_name))').in('status', ['approved', 'waiting_parts', 'in_progress', 'sea_trial']).order('created_at', { ascending: false }).limit(10),
      loadMoney(),
    ])
    return { appts: must(appts) as unknown as TodayAppt[], working: must(working) as unknown as Working[], debt: sum(owed(money)) }
  }, [today])

  const first = (profile?.full_name ?? '').split(' ')[0]

  return (
    <>
      <div className="mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight text-navy-900">¡{greeting()}{first ? `, ${first}` : ''}!</h1>
        <p className="mt-1 text-base text-slate-600">{formatLongDate(today)}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Tile to="/citas/nueva" icon={PropellerIcon as unknown as LucideIcon} badge={<CalendarDays size={16} strokeWidth={2.5} />} label="Hacer cita" from="#3b82f6" color="#1e3a8a" />
        <Tile to="/cobrar" icon={GaugeIcon as unknown as LucideIcon} badge={<Zap size={16} strokeWidth={2.5} />} label="Factura rápida" from="#38bdf8" color="#0369a1" />
        <Tile to="/clientes/nuevo" icon={SparkPlugIcon as unknown as LucideIcon} badge={<Plus size={18} strokeWidth={3} />} label="Añadir cliente" from="#64748b" color="#0f172a" />
        <Tile to="/trabajos" icon={PistonIcon as unknown as LucideIcon} label="Me deben" sub={data ? formatMoney(data.debt) : '…'} from="#fca5a5" color="#ef4444" />
      </div>

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
      {data && data.working.length > 0 && (
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
