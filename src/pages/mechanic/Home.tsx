import { Link } from 'react-router'
import { CalendarPlus, ChevronRight, HandCoins, UserPlus, Wrench, Zap, type LucideIcon } from 'lucide-react'
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

function Tile({ to, icon: Icon, label, sub, color }: { to: string; icon: LucideIcon; label: string; sub?: string; color: string }) {
  return (
    <Link to={to} className={`flex min-h-36 flex-col items-center justify-center gap-2 rounded-3xl p-3 text-center text-white shadow-lg transition active:scale-[0.97] ${color}`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20"><Icon size={32} /></span>
      <span className="text-lg font-extrabold leading-tight">{label}</span>
      {sub && <span className="text-sm font-semibold text-white/85">{sub}</span>}
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

      <div className="grid grid-cols-2 gap-3">
        <Tile to="/citas/nueva" icon={CalendarPlus} label="Hacer cita" color="bg-navy-800" />
        <Tile to="/cobrar" icon={Zap} label="Factura rápida" color="bg-sky-600" />
        <Tile to="/clientes/nuevo" icon={UserPlus} label="Añadir cliente" color="bg-slate-800" />
        <Tile to="/trabajos" icon={HandCoins} label="Me deben" sub={data ? formatMoney(data.debt) : '…'} color="bg-orange-400 [text-shadow:0_1px_2px_rgba(0,0,0,0.25)]" />
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
