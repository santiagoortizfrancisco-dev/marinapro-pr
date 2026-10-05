import { Link, useSearchParams } from 'react-router'
import { Calendar, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { APPOINTMENT_STATUS, LOCATION_TYPES, WORK_AREAS, labelOf } from '../../lib/catalog'
import { db } from '../../lib/db'
import { addDays, formatDate, formatLongDate, formatShortDay, formatTime, prDay, prRange, todayPR, weekStart } from '../../lib/format'
import type { AppointmentFull } from '../../lib/types'
import { must, useLoad } from '../../lib/useLoad'
import { EmptyState, ErrorBox, Fab, Loading } from '../../components/ui'

const SELECT = '*, service_requests(description), boats(id, name, location_type, marina_name, slip_number, town, lat, lng, location_notes, clients(id, full_name, phone))'

export default function Agenda() {
  const [params, setParams] = useSearchParams()
  const today = todayPR()
  const day = params.get('dia') ?? today
  const week = params.get('vista') === 'semana'
  const from = week ? weekStart(day) : day
  const days = week ? 7 : 1

  const { data, loading, error, reload } = useLoad(async () => {
    const [start, end] = prRange(from, days)
    return must(await db().from('appointments').select(SELECT).gte('starts_at', start).lt('starts_at', end).neq('status', 'cancelled').order('starts_at')) as AppointmentFull[]
  }, [from, days])

  const go = (d: string, w = week) => setParams(w ? { dia: d, vista: 'semana' } : { dia: d }, { replace: true })

  return (
    <>
      {/* Día / Semana */}
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {[false, true].map((w) => (
          <button key={String(w)} onClick={() => go(day, w)} className={`min-h-12 rounded-lg text-lg font-bold ${week === w ? 'bg-white text-navy-900 shadow' : 'text-slate-600'}`}>
            {w ? 'Semana' : 'Día'}
          </button>
        ))}
      </div>

      {/* Cambiar de día o semana */}
      <div className="mb-4 flex items-center gap-2">
        <button aria-label="Anterior" onClick={() => go(addDays(day, week ? -7 : -1))} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 text-navy-800 active:bg-slate-100">
          <ChevronLeft size={30} />
        </button>
        <div className="min-w-0 flex-1 text-center leading-tight">
          <div className="text-xl font-extrabold text-navy-900">
            {week ? `Semana del ${formatShortDay(from)}` : day === today ? 'Hoy' : day === addDays(today, 1) ? 'Mañana' : formatLongDate(day).split(',')[0]}
          </div>
          <div className="text-base text-slate-600">{week ? `${formatDate(from)} al ${formatDate(addDays(from, 6))}` : `${formatLongDate(day)} · ${formatDate(day)}`}</div>
        </div>
        <button aria-label="Siguiente" onClick={() => go(addDays(day, week ? 7 : 1))} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 text-navy-800 active:bg-slate-100">
          <ChevronRight size={30} />
        </button>
      </div>
      {day !== today && (
        <button onClick={() => go(today)} className="mb-4 w-full text-base font-bold text-navy-700 underline underline-offset-4">Volver a hoy</button>
      )}
      <label className="mb-4 flex items-center gap-2 text-base text-slate-600">
        <Calendar size={20} /> Ir a la fecha:
        <input type="date" value={day} onChange={(e) => e.target.value && go(e.target.value)} className="min-h-12 flex-1 rounded-xl border-2 border-slate-300 px-3 text-base" />
      </label>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && !week && (
        data.length === 0
          ? <EmptyState icon={Calendar} title="No hay citas este día" text="Toca “Cita” para anotar el día y la hora que acordaste con el cliente." />
          : <div className="space-y-3">{data.map((a) => <ApptCard key={a.id} a={a} />)}</div>
      )}

      {data && week && (
        <div className="space-y-5">
          {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => {
            const list = data.filter((a) => prDay(a.starts_at) === d)
            return (
              <section key={d}>
                <button onClick={() => go(d, false)} className={`mb-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left ${d === today ? 'bg-navy-800 text-white' : 'bg-slate-100 text-navy-900'}`}>
                  <span className="text-lg font-extrabold">{formatLongDate(d)}</span>
                  <span className="text-base font-semibold">{list.length === 0 ? 'Libre' : `${list.length} ${list.length === 1 ? 'cita' : 'citas'}`}</span>
                </button>
                <div className="space-y-2">{list.map((a) => <ApptCard key={a.id} a={a} compact />)}</div>
              </section>
            )
          })}
        </div>
      )}

      <Fab to={`/citas/nueva?dia=${day}`} label="Cita" />
    </>
  )
}

function ApptCard({ a, compact }: { a: AppointmentFull; compact?: boolean }) {
  const st = APPOINTMENT_STATUS[a.status]
  const b = a.boats
  const where = [b.marina_name ?? labelOf(LOCATION_TYPES, b.location_type), b.slip_number, b.town].filter(Boolean).join(' · ')
  return (
    <Link to={`/citas/${a.id}`} className={`block rounded-2xl border-2 bg-white p-4 active:bg-slate-50 ${a.status === 'done' ? 'border-slate-200 opacity-70' : 'border-navy-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xl font-extrabold text-navy-900">{formatTime(a.starts_at)}</div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${st.style}`}>{st.label}</span>
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900">{b.name} <span className="font-semibold text-slate-600">· {b.clients.full_name}</span></div>
      {a.title && <div className="text-base text-slate-800">{a.title}</div>}
      {a.service_requests?.description && <div className="mt-1 line-clamp-2 rounded-lg bg-amber-50 px-2 py-1 text-base text-amber-900">⚠ {a.service_requests.description}</div>}
      {!compact && where && (
        <div className="mt-1 flex items-center gap-1 text-base text-slate-600"><MapPin size={18} /> {where}</div>
      )}
      {!compact && a.systems.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {a.systems.map((s) => <span key={s} className="rounded-full bg-navy-50 px-2 py-0.5 text-sm font-semibold text-navy-800">{labelOf(WORK_AREAS, s)}</span>)}
        </div>
      )}
    </Link>
  )
}
