import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Calendar, CalendarPlus, ChevronLeft, ChevronRight, MapPin, Plus, User, Wrench } from 'lucide-react'
import { LOCATION_TYPES, labelOf } from '../../lib/catalog'
import { db } from '../../lib/db'
import { addDays, formatDate, formatLongDate, formatTime, prDay, prRange, prTime, prToISO, todayPR, weekStart } from '../../lib/format'
import type { AppointmentFull } from '../../lib/types'
import { must, useLoad } from '../../lib/useLoad'
import { ErrorBox, Fab, Loading } from '../../components/ui'
import DueServices from '../../components/DueServices'

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
  confirmed: { stripe: 'bg-emerald-600', pill: 'bg-emerald-100 text-emerald-800', label: 'Confirmada' },
  requested: { stripe: 'bg-amber-500', pill: 'bg-amber-100 text-amber-900', label: 'Por confirmar' },
  done: { stripe: 'bg-slate-400', pill: 'bg-slate-200 text-slate-700', label: 'Hecha' },
  cancelled: { stripe: 'bg-red-500', pill: 'bg-red-100 text-red-800', label: 'Cancelada' },
} as const

/** Tarjeta blanca con sombra suave (se ve bien al sol y en pantallas pequeñas). */
const CARD = 'rounded-3xl bg-white shadow-[0_6px_24px_-12px_rgba(8,47,73,0.35)] ring-1 ring-slate-200/70'

type Slot = { kind: 'free'; start: number; end: number } | { kind: 'appt'; start: number; end: number; a: AppointmentFull }

/** El app recuerda si el mecánico prefiere ver el mes o la semana. */
function savedView(): 'mes' | 'semana' {
  try {
    return localStorage.getItem('agenda-vista') === 'semana' ? 'semana' : 'mes'
  } catch {
    return 'mes'
  }
}

/** Días que se ven en el calendario del mes (de lunes a domingo, semanas completas). */
function monthGrid(day: string): string[] {
  const first = `${day.slice(0, 7)}-01`
  const last = addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1)
  const start = weekStart(first)
  const days: string[] = []
  for (let d = start; d <= last || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d)
  return days
}

export default function Agenda() {
  const [params, setParams] = useSearchParams()
  const today = todayPR()
  const day = params.get('dia') ?? today
  const [view, setView] = useState<'mes' | 'semana'>(savedView)
  const from = weekStart(day)
  const week = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const grid = view === 'mes' ? monthGrid(day) : week

  const { data, loading, error, reload } = useLoad(async () => {
    const [start, end] = prRange(grid[0], grid.length)
    return must(await db().from('appointments').select(SELECT).gte('starts_at', start).lt('starts_at', end).neq('status', 'cancelled').order('starts_at')) as AppointmentFull[]
  }, [grid[0], grid.length])

  function changeView(v: 'mes' | 'semana') {
    setView(v)
    try {
      localStorage.setItem('agenda-vista', v)
    } catch {
      /* sin memoria del teléfono: no pasa nada */
    }
  }

  /** Mes anterior o siguiente: abre el día 1 (o hoy, si es el mes de hoy). */
  function shiftMonth(n: number) {
    const target = `${addDays(`${day.slice(0, 7)}-15`, n * 30).slice(0, 7)}-01`
    go(target.slice(0, 7) === today.slice(0, 7) ? today : target)
  }

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
      {day === today && <DueServices />}

      {/* Mes | Semana */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
        {(['mes', 'semana'] as const).map((v) => (
          <button key={v} onClick={() => changeView(v)} className={`min-h-12 rounded-xl text-lg font-bold transition ${view === v ? 'bg-white text-navy-900 shadow-md' : 'text-slate-500'}`}>
            {v === 'mes' ? 'Mes' : 'Semana'}
          </button>
        ))}
      </div>

      <section className={`${CARD} mb-4 p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <button aria-label={view === 'mes' ? 'Mes anterior' : 'Semana anterior'} onClick={() => (view === 'mes' ? shiftMonth(-1) : go(addDays(day, -7)))} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-800 transition active:scale-95 active:bg-navy-100">
          <ChevronLeft size={28} />
        </button>
        <div className="min-w-0 flex-1 text-center leading-tight">
          <div className="text-xl font-extrabold capitalize text-navy-900">{view === 'mes' ? `${MONTHS.at(Number(day.slice(5, 7)) - 1)} ${day.slice(0, 4)}` : `${MONTHS.at(m - 1)} ${y}`}</div>
          {view === 'semana' && <div className="text-sm text-slate-600">Semana del {Number(from.slice(8))} al {Number(addDays(from, 6).slice(8))}</div>}
        </div>
        <button aria-label={view === 'mes' ? 'Mes siguiente' : 'Semana siguiente'} onClick={() => (view === 'mes' ? shiftMonth(1) : go(addDays(day, 7)))} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-800 transition active:scale-95 active:bg-navy-100">
          <ChevronRight size={28} />
        </button>
      </div>

      {view === 'mes' && (
        <div className="mb-1">
          <div className="mb-1 grid grid-cols-7 text-center text-xs font-bold uppercase tracking-wide text-slate-400">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {grid.map((d) => {
              const appts = byDay(d)
              const sel = d === day
              const otherMonth = d.slice(0, 7) !== day.slice(0, 7)
              const off = !WORK_DAYS.includes(dow(d))
              return (
                <button
                  key={d}
                  onClick={() => go(d)}
                  aria-label={`${formatLongDate(d)}${appts.length ? `, ${appts.length} ${appts.length === 1 ? 'cita' : 'citas'}` : ''}`}
                  className={`flex h-11 flex-col items-center justify-center rounded-2xl transition active:scale-95 ${sel ? 'bg-navy-800 text-white shadow-md shadow-navy-900/30' : d === today ? 'bg-sun-400/15 text-navy-900 ring-2 ring-sun-400' : ''} ${otherMonth && !sel ? 'opacity-30' : ''} ${off && !sel && d !== today ? 'text-slate-400' : ''}`}
                >
                  <span className="text-lg font-bold leading-none">{Number(d.slice(8))}</span>
                  <span className="mt-1 flex h-2 items-center gap-0.5">
                    {appts.slice(0, 3).map((a) => (
                      <span key={a.id} className={`h-1.5 w-1.5 rounded-full ${sel ? 'bg-white' : a.status === 'requested' ? 'bg-amber-500' : 'bg-emerald-600'}`} />
                    ))}
                    {appts.length > 3 && <span className={`text-[10px] font-bold leading-none ${sel ? 'text-white' : 'text-emerald-700'}`}>+</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {view === 'semana' && <div className="mb-1 grid grid-cols-7 gap-1">
        {week.map((d) => {
          const n = byDay(d).length
          const sel = d === day
          const off = !WORK_DAYS.includes(dow(d))
          return (
            <button
              key={d}
              onClick={() => go(d)}
              className={`flex min-h-20 flex-col items-center justify-center rounded-2xl py-1 transition active:scale-95 ${sel ? 'bg-navy-800 text-white shadow-md shadow-navy-900/30' : d === today ? 'bg-sun-400/15 ring-2 ring-sun-400' : off ? 'bg-slate-50 text-slate-400' : 'bg-slate-50'}`}
            >
              <span className={`text-xs font-semibold ${sel ? 'text-navy-100' : 'text-slate-500'}`}>{WEEKDAYS.at(dow(d))}</span>
              <span className="text-xl font-extrabold">{Number(d.slice(8))}</span>
              <span className={`text-xs font-bold ${sel ? 'text-white' : n ? 'text-emerald-700' : 'text-slate-400'}`}>
                {n === 0 ? (off ? '—' : 'libre') : n <= 3 ? '●'.repeat(n) : `●● +${n - 2}`}
              </span>
            </button>
          )
        })}
      </div>}

      {day !== today && (
        <button onClick={() => go(today)} className="mx-auto mt-1 flex min-h-11 items-center gap-1 rounded-full bg-navy-50 px-4 text-base font-bold text-navy-700 active:bg-navy-100">
          <Calendar size={18} /> Volver a hoy
        </button>
      )}
      </section>

      {/* El día escogido */}
      <div className="mb-3">
        {day === today && <span className="mb-1 inline-block rounded-full bg-sun-400 px-3 py-0.5 text-xs font-extrabold uppercase tracking-wide text-white">Hoy</span>}
        <h1 className="text-2xl font-extrabold leading-tight text-navy-900">{formatLongDate(day)}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-sm font-bold">
          <span className="rounded-full bg-navy-50 px-3 py-1 text-navy-800">{list.length === 0 ? 'Sin citas' : `${list.length} ${list.length === 1 ? 'cita' : 'citas'}`}</span>
          {workDay && <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">{hoursText(freeMin)} libres</span>}
        </div>
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && !workDay && list.length === 0 && (
        <p className="mb-3 rounded-xl bg-slate-100 p-4 text-base text-slate-700">Día libre. Si igual vas a trabajar, toca “Hacer cita”.</p>
      )}

      {data && (
        <div className="space-y-2">
          {slots.map((s) =>
            s.kind === 'free' ? (
              <Link
                key={`free-${s.start}`}
                to={`/citas/nueva?dia=${day}&hora=${hhmm(s.start)}`}
                className="grid grid-cols-[4.5rem_1fr] items-center gap-2 transition active:scale-[0.98]"
              >
                <span className="text-sm font-semibold text-slate-400">{label(s.start)}</span>
                <span className="flex min-h-14 items-center justify-between rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-4 text-base text-slate-500">
                  <span>Libre · {hoursText(s.end - s.start)}</span>
                  <span className="flex items-center gap-1 rounded-full bg-sun-400/20 px-3 py-1 font-bold text-navy-800"><Plus size={18} /> Cita</span>
                </span>
              </Link>
            ) : (
              <Link key={s.a.id} to={`/citas/${s.a.id}`} className="grid grid-cols-[4.5rem_1fr] gap-2 transition active:scale-[0.98]">
                <span className="pt-3 leading-tight">
                  <span className="block text-base font-extrabold text-navy-900">{label(s.start)}</span>
                  <span className="block text-xs font-semibold text-slate-400">a {label(s.end)}</span>
                </span>
                <span className={`${CARD} relative block overflow-hidden !rounded-2xl py-3 pl-5 pr-4`} style={{ minHeight: `${Math.max(64, (s.end - s.start) * 0.9)}px` }}>
                  <span className={`absolute inset-y-0 left-0 w-1.5 ${STYLE[s.a.status].stripe}`} />
                  <span className="block text-lg font-extrabold leading-tight text-slate-900">{s.a.boats.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-slate-600">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STYLE[s.a.status].pill}`}>{STYLE[s.a.status].label}</span>
                    <span className="flex items-center gap-1.5"><User size={16} className="shrink-0 text-slate-400" /> {s.a.boats.clients.full_name}</span>
                  </span>
                  {(s.a.service_requests?.description || s.a.title) && (
                    <span className="mt-1 flex gap-1.5 text-base text-slate-800"><Wrench size={16} className="mt-1 shrink-0 text-slate-400" /><span className="line-clamp-2">{s.a.service_requests?.description || s.a.title}</span></span>
                  )}
                  {(s.a.boats.marina_name || s.a.boats.town) && (
                    <span className="mt-2 inline-flex max-w-full items-start gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-sm text-slate-600">
                      <MapPin size={14} className="mt-0.5 shrink-0" /> <span>{[s.a.boats.marina_name ?? labelOf(LOCATION_TYPES, s.a.boats.location_type), s.a.boats.slip_number, s.a.boats.town].filter(Boolean).join(' · ')}</span>
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

      <Fab to={`/citas/nueva?dia=${day}`} label="Hacer cita" icon={CalendarPlus} />
    </>
  )
}
