import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Calendar, ChevronLeft, ChevronRight, MapPin, Plus } from 'lucide-react'
import { LOCATION_TYPES, labelOf } from '../../lib/catalog'
import { db } from '../../lib/db'
import { addDays, formatDate, formatLongDate, formatTime, prDay, prRange, prTime, prToISO, todayPR, weekStart } from '../../lib/format'
import type { AppointmentFull } from '../../lib/types'
import { must, useLoad } from '../../lib/useLoad'
import { ErrorBox, Fab, Loading } from '../../components/ui'

const SELECT = '*, service_requests(description), boats(id, name, location_type, marina_name, slip_number, town, lat, lng, location_notes, clients(id, full_name, phone))'

/** Horario de trabajo (por ahora fijo): 7:00 AM a 5:00 PM, lunes a sábado. */
const WORK_START = 7 * 60
const WORK_END = 17 * 60
const WORK_DAYS = [1, 2, 3, 4, 5, 6] // 0 = domingo

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

const dow = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()
const minutesOf = (iso: string) => {
  const [h, m] = prTime(iso).split(':').map(Number)
  return h * 60 + m
}
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const hoursText = (min: number) => {
  const h = Math.round((min / 60) * 2) / 2
  return h === 1 ? '1 hora' : `${String(h).replace('.5', '½')} horas`
}

const STYLE = {
  confirmed: { box: 'border-l-emerald-700 bg-emerald-50', title: 'text-emerald-950', sub: 'text-emerald-800', label: 'Confirmada' },
  requested: { box: 'border-l-amber-600 bg-amber-50', title: 'text-amber-950', sub: 'text-amber-800', label: 'Por confirmar' },
  done: { box: 'border-l-slate-500 bg-slate-100', title: 'text-slate-800', sub: 'text-slate-600', label: 'Hecha' },
  cancelled: { box: 'border-l-red-600 bg-red-50', title: 'text-red-900', sub: 'text-red-700', label: 'Cancelada' },
} as const

type Slot = { kind: 'free'; start: number; end: number } | { kind: 'appt'; start: number; end: number; a: AppointmentFull }

export default function Agenda() {
  const [params, setParams] = useSearchParams()
  const today = todayPR()
  const day = params.get('dia') ?? today
  const from = weekStart(day)
  const week = Array.from({ length: 7 }, (_, i) => addDays(from, i))

  const { data, loading, error, reload } = useLoad(async () => {
    const [start, end] = prRange(from, 7)
    return must(await db().from('appointments').select(SELECT).gte('starts_at', start).lt('starts_at', end).neq('status', 'cancelled').order('starts_at')) as AppointmentFull[]
  }, [from])

  const go = (d: string) => setParams({ dia: d }, { replace: true })
  const byDay = (d: string) => (data ?? []).filter((a) => prDay(a.starts_at) === d)
  const list = byDay(day)
  const workDay = WORK_DAYS.includes(dow(day))

  // El día por horas: citas y huecos libres entre ellas
  const slots = useMemo<Slot[]>(() => {
    const appts = list.map((a) => ({ a, start: minutesOf(a.starts_at), end: minutesOf(a.starts_at) + a.duration_min }))
    const dayStart = Math.min(WORK_START, ...appts.map((x) => Math.floor(x.start / 60) * 60))
    const dayEnd = Math.max(WORK_END, ...appts.map((x) => x.end))
    const out: Slot[] = []
    let cursor = dayStart
    for (const x of appts) {
      if (x.start - cursor >= 30 && workDay) out.push({ kind: 'free', start: cursor, end: x.start })
      out.push({ kind: 'appt', ...x })
      cursor = Math.max(cursor, x.end)
    }
    if (dayEnd - cursor >= 30 && workDay) out.push({ kind: 'free', start: cursor, end: dayEnd })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, day])

  const freeMin = slots.filter((s) => s.kind === 'free').reduce((t, s) => t + Math.max(0, Math.min(s.end, WORK_END) - Math.max(s.start, WORK_START)), 0)
  const [y, m] = from.split('-').map(Number)
  const label = (min: number) => formatTime(prToISO(day, hhmm(min)))

  return (
    <>
      {/* La semana */}
      <div className="mb-2 flex items-center gap-2">
        <button aria-label="Semana anterior" onClick={() => go(addDays(day, -7))} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 text-navy-800 active:bg-slate-100">
          <ChevronLeft size={28} />
        </button>
        <div className="min-w-0 flex-1 text-center leading-tight">
          <div className="text-xl font-extrabold capitalize text-navy-900">{MONTHS.at(m - 1)} {y}</div>
          <div className="text-sm text-slate-600">Semana del {Number(from.slice(8))} al {Number(addDays(from, 6).slice(8))}</div>
        </div>
        <button aria-label="Semana siguiente" onClick={() => go(addDays(day, 7))} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 text-navy-800 active:bg-slate-100">
          <ChevronRight size={28} />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-7 gap-1">
        {week.map((d) => {
          const n = byDay(d).length
          const sel = d === day
          const off = !WORK_DAYS.includes(dow(d))
          return (
            <button
              key={d}
              onClick={() => go(d)}
              className={`flex min-h-20 flex-col items-center justify-center rounded-xl py-1 ${sel ? 'bg-navy-800 text-white' : d === today ? 'border-2 border-navy-700 bg-white' : off ? 'bg-slate-50 text-slate-400' : 'bg-white'}`}
            >
              <span className={`text-xs font-semibold ${sel ? 'text-navy-100' : 'text-slate-500'}`}>{WEEKDAYS.at(dow(d))}</span>
              <span className="text-xl font-extrabold">{Number(d.slice(8))}</span>
              <span className={`text-xs font-bold ${sel ? 'text-sun-400' : n ? 'text-emerald-700' : 'text-slate-400'}`}>
                {n === 0 ? (off ? '—' : 'libre') : n <= 3 ? '●'.repeat(n) : `●● +${n - 2}`}
              </span>
            </button>
          )
        })}
      </div>

      {day !== today && (
        <button onClick={() => go(today)} className="mb-3 w-full text-base font-bold text-navy-700 underline underline-offset-4">Volver a hoy</button>
      )}

      {/* El día escogido */}
      <div className="mb-3 flex items-baseline justify-between gap-2 border-t-2 border-slate-200 pt-3">
        <h1 className="text-xl font-extrabold text-navy-900">{day === today ? 'Hoy, ' : ''}{formatLongDate(day)}</h1>
        <span className="shrink-0 text-sm font-semibold text-slate-600">
          {list.length === 0 ? 'Sin citas' : `${list.length} ${list.length === 1 ? 'cita' : 'citas'}`}{workDay ? ` · ${hoursText(freeMin)} libres` : ''}
        </span>
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && !workDay && list.length === 0 && (
        <p className="mb-3 rounded-xl bg-slate-100 p-4 text-base text-slate-700">Día libre. Si igual vas a trabajar, toca “Cita”.</p>
      )}

      {data && (
        <div className="space-y-2">
          {slots.map((s) =>
            s.kind === 'free' ? (
              <Link
                key={`free-${s.start}`}
                to={`/citas/nueva?dia=${day}&hora=${hhmm(s.start)}`}
                className="grid grid-cols-[4.5rem_1fr] items-center gap-2 active:opacity-70"
              >
                <span className="text-sm font-semibold text-slate-500">{label(s.start)}</span>
                <span className="flex min-h-14 items-center justify-between rounded-xl border-2 border-dashed border-slate-300 px-4 text-base text-slate-500">
                  <span>Libre · {hoursText(s.end - s.start)}</span>
                  <span className="flex items-center gap-1 font-bold text-navy-700"><Plus size={20} /> Cita</span>
                </span>
              </Link>
            ) : (
              <Link key={s.a.id} to={`/citas/${s.a.id}`} className="grid grid-cols-[4.5rem_1fr] gap-2 active:opacity-80">
                <span className="pt-3 text-sm font-semibold text-slate-700">{label(s.start)}</span>
                <span className={`block border-l-[6px] px-4 py-3 ${STYLE[s.a.status].box}`} style={{ minHeight: `${Math.max(64, (s.end - s.start) * 0.9)}px` }}>
                  <span className={`block text-lg font-extrabold leading-tight ${STYLE[s.a.status].title}`}>{s.a.boats.name}</span>
                  <span className={`block text-base ${STYLE[s.a.status].sub}`}>
                    {s.a.boats.clients.full_name} · {label(s.start)} a {label(s.end)}{s.a.status !== 'confirmed' ? ` · ${STYLE[s.a.status].label}` : ''}
                  </span>
                  {(s.a.service_requests?.description || s.a.title) && (
                    <span className={`mt-1 line-clamp-2 block text-base ${STYLE[s.a.status].title}`}>{s.a.service_requests?.description || s.a.title}</span>
                  )}
                  {(s.a.boats.marina_name || s.a.boats.town) && (
                    <span className={`mt-1 flex items-center gap-1 text-sm ${STYLE[s.a.status].sub}`}>
                      <MapPin size={16} /> {[s.a.boats.marina_name ?? labelOf(LOCATION_TYPES, s.a.boats.location_type), s.a.boats.slip_number, s.a.boats.town].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </Link>
            ),
          )}
        </div>
      )}

      <label className="mt-6 flex items-center gap-2 text-base text-slate-600">
        <Calendar size={20} /> Ir a otra fecha:
        <input type="date" value={day} onChange={(e) => e.target.value && go(e.target.value)} className="min-h-12 flex-1 rounded-xl border-2 border-slate-300 px-3 text-base" />
      </label>
      <p className="mt-2 text-center text-xs text-slate-400">{formatDate(day)}</p>

      <Fab to={`/citas/nueva?dia=${day}`} label="Cita" />
    </>
  )
}
