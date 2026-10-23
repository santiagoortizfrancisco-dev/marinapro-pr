import { useState } from 'react'
import { Link } from 'react-router'
import { Banknote, BellRing, CalendarDays, CalendarHeart, Check, ChevronRight, Globe, Wallet, type LucideIcon } from 'lucide-react'
import DueServices from './DueServices'
import { Sheet } from './Sheet'
import { WhatsAppIcon } from './BrandIcons'
import { useAuth } from '../auth/AuthProvider'
import { db } from '../lib/db'
import { addDays, formatDate, formatLongDate, formatMoney, formatTime, prRange, todayPR } from '../lib/format'
import { whatsappLink } from '../lib/links'
import { useLoad } from '../lib/useLoad'
import { CARD } from './ui'

interface Appt {
  deposit_asked?: number | null
  deposit_reported_at?: string | null
  created_at?: string | null
  id: string; starts_at: string; status: string; title: string | null; reminded_at: string | null; source: string
  staff: { name: string } | null
  boats: { clients: { full_name: string; phone: string | null } }
}
const SELECT = 'id, starts_at, status, title, reminded_at, source, created_at, staff(name), boats(clients(full_name, phone))'

type Panel = 'paid' | 'asked' | 'next' | 'due' | 'today' | 'back'

/** "23/10 3:15 PM": día y hora de cuándo pasó algo */
const when = (iso: string) => `${formatDate(iso).slice(0, 5)} ${formatTime(iso)}`

/**
 * Inicio del salón: las citas que pidieron por internet (para confirmarlas) y las de mañana
 * con un botón para recordarle a cada clienta por WhatsApp (queda marcada como recordada).
 */
export default function SalonReminders() {
  const { session } = useAuth()
  const tomorrow = addDays(todayPR(), 1)
  const [sent, setSent] = useState<string[]>([])
  const [open, setOpen] = useState<Panel | null>(null)
  const { data } = useLoad(async () => {
    const [start, end] = prRange(tomorrow, 1)
    const [today0, today1] = prRange(todayPR(), 1)
    const [asked, next, mech, paid, today, working, back] = await Promise.all([
      db().from('appointments').select(SELECT).eq('status', 'requested').gte('starts_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(20),
      db().from('appointments').select(SELECT).gte('starts_at', start).lt('starts_at', end).in('status', ['requested', 'confirmed']).order('starts_at'),
      db().from('mechanics').select('business_name').eq('profile_id', session!.user.id).single(),
      db().from('appointments').select(SELECT + ', deposit_asked, deposit_reported_at').not('deposit_reported_at', 'is', null).is('deposit_ok_at', null).neq('status', 'cancelled').order('deposit_reported_at', { ascending: false }).limit(20),
      db().from('appointments').select(SELECT).gte('starts_at', today0).lt('starts_at', today1).neq('status', 'cancelled').order('starts_at'),
      db().from('work_orders').select('id, appointment_id, boats(clients(full_name)), appointments(starts_at, title)').in('status', ['approved', 'waiting_parts', 'in_progress', 'sea_trial']).order('created_at', { ascending: false }).limit(30),
      db().from('maintenance_schedules').select('id').in('status', ['pending', 'notified']).lte('due_date', addDays(todayPR(), 30)),
    ])
    const nowMs = Date.now()
    type W = { id: string; appointment_id: string | null; boats: { clients: { full_name: string } }; appointments: { starts_at: string; title: string | null } | null }
    return {
      asked: (asked.data ?? []) as unknown as Appt[],
      next: (next.data ?? []) as unknown as Appt[],
      paid: (paid.data ?? []) as unknown as Appt[],
      today: (today.data ?? []) as unknown as Appt[],
      // Ya pasó la cita y falta cobrar (la más reciente primero)
      due: ((working.data ?? []) as unknown as W[]).filter((x) => !x.appointments || new Date(x.appointments.starts_at).getTime() <= nowMs)
        .sort((x, y) => (y.appointments?.starts_at ?? '').localeCompare(x.appointments?.starts_at ?? '')),
      back: (back.data ?? []).length,
      business: ((mech.data as { business_name: string | null } | null)?.business_name) ?? '',
    }
  }, [tomorrow])

  if (!data) return null

  function remind(a: Appt) {
    setSent((s) => [...s, a.id])
    db().from('appointments').update({ reminded_at: new Date().toISOString() }).eq('id', a.id).then(() => undefined)
  }

  const message = (a: Appt) => {
    const first = a.boats.clients.full_name.split(' ')[0]
    return `Hola ${first}, te recordamos tu cita mañana ${formatLongDate(a.starts_at).toLowerCase()} a las ${formatTime(a.starts_at)}` +
      (a.title ? ` para ${a.title}` : '') + (a.staff ? ` con ${a.staff.name}` : '') + `. Si no puedes llegar, avísanos. ¡Te esperamos! 💅 ${data.business}`.trimEnd()
  }

  const tiles: { key: Panel; label: string; count: number; icon: LucideIcon; color: string }[] = [
    { key: 'paid', label: 'Depósitos por verificar', count: data.paid.length, icon: Banknote, color: '#059669' },
    { key: 'asked', label: 'Pedidas por internet', count: data.asked.length, icon: Globe, color: '#d97706' },
    { key: 'next', label: 'Recordar mañana', count: data.next.filter((a) => !a.reminded_at && !sent.includes(a.id)).length, icon: BellRing, color: '#2563eb' },
    { key: 'due', label: 'Sin cobrar', count: data.due.length, icon: Wallet, color: '#db2777' },
    { key: 'today', label: 'Citas hoy', count: data.today.length, icon: CalendarDays, color: '#7c3aed' },
    { key: 'back', label: 'Le toca volver', count: data.back, icon: CalendarHeart, color: '#be185d' },
  ]
  const current = tiles.find((t) => t.key === open)

  return (
    <>
      {/* Todo lo pendiente de un vistazo: cada cuadro dice cuántas hay; al tocarlo sale su lista */}
      <div className="mt-5 grid grid-cols-3 gap-x-2 gap-y-4">
        {tiles.map((t) => {
          const on = t.count > 0
          return (
            <button key={t.key} type="button" onClick={() => setOpen(t.key)} aria-label={`${t.label}: ${t.count}`}
              className="flex flex-col items-center gap-1.5 rounded-2xl py-1 active:scale-95">
              <span className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full text-white shadow-md" style={{ backgroundColor: on ? t.color : '#cbd5e1' }}>
                <t.icon size={30} />
                <span className="absolute -right-1 -top-1 flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-1.5 text-base font-black ring-2" style={{ color: on ? t.color : '#94a3b8', borderColor: on ? t.color : '#cbd5e1' }}>{t.count}</span>
              </span>
              <span className={`text-center text-sm font-bold leading-tight ${on ? 'text-slate-900' : 'text-slate-500'}`}>{t.label}</span>
            </button>
          )
        })}
      </div>

      <Sheet open={open !== null} title={current?.label ?? ''} onClose={() => setOpen(null)}>
        {current && current.count === 0 && open !== 'next' && open !== 'today' && open !== 'back' && <p className="py-4 text-center text-base text-slate-500">No hay nada pendiente aquí. ✓</p>}
        {open === 'paid' && data.paid.length > 0 && (
        <div className={`${CARD} divide-y divide-slate-100`}>
          {data.paid.map((a) => (
            <Link key={a.id} to={`/citas/${a.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-slate-900">{a.boats.clients.full_name}</span>
                <span className="block truncate text-sm text-slate-600">Dice que envió {formatMoney(Number(a.deposit_asked) || 0)}{a.deposit_reported_at ? ` el ${when(a.deposit_reported_at)}` : ''}</span>
                <span className="block truncate text-xs text-slate-500">Cita: {formatDate(a.starts_at).slice(0, 5)} {formatTime(a.starts_at)}</span>
              </span>
              <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">Verificar</span>
              <ChevronRight size={18} className="shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
        )}
        {open === 'asked' && data.asked.length > 0 && (
        <div className={`${CARD} divide-y divide-slate-100`}>
          {data.asked.map((a) => (
            <Link key={a.id} to={`/citas/${a.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-slate-900">{a.boats.clients.full_name}</span>
                <span className="block truncate text-sm text-slate-600">Cita: {formatDate(a.starts_at).slice(0, 5)} {formatTime(a.starts_at)}{a.title ? ` · ${a.title}` : ''}</span>
                {a.created_at && <span className="block truncate text-xs text-slate-500">La pidió el {when(a.created_at)}</span>}
              </span>
              <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">Confirmar</span>
              <ChevronRight size={18} className="shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
        )}
        {open === 'next' && (data.next.length === 0 ? <p className="py-4 text-center text-base text-slate-500">Mañana no hay citas.</p> : (
        <div className={`${CARD} divide-y divide-slate-100`}>
          {data.next.map((a) => {
            const done = Boolean(a.reminded_at) || sent.includes(a.id)
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <Link to={`/citas/${a.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-slate-900">{formatTime(a.starts_at)} · {a.boats.clients.full_name}</span>
                  {(a.title || a.staff) && <span className="block truncate text-sm text-slate-600">{[a.title, a.staff ? `con ${a.staff.name}` : null].filter(Boolean).join(' · ')}</span>}
                  {a.created_at && <span className="block truncate text-xs text-slate-500">Hecha el {when(a.created_at)}</span>}
                </Link>
                {done ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"><Check size={16} /> Recordada</span>
                ) : a.boats.clients.phone ? (
                  <a href={whatsappLink(a.boats.clients.phone, message(a))} target="_blank" rel="noreferrer" onClick={() => remind(a)}
                    aria-label={`Recordarle a ${a.boats.clients.full_name}`}
                    className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-[#25D366] px-3 text-sm font-bold text-white"><WhatsAppIcon size={18} /> Recordarle</a>
                ) : <span className="shrink-0 text-xs text-slate-400">Sin teléfono</span>}
              </div>
            )
          })}
        </div>
        ))}
        {open === 'due' && data.due.length > 0 && (
          <div className={`${CARD} divide-y divide-slate-100`}>
            {data.due.map((x) => (
              <Link key={x.id} to={x.appointment_id ? `/citas/${x.appointment_id}` : `/trabajos/${x.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-slate-900">{x.boats.clients.full_name}</span>
                  <span className="block truncate text-sm text-slate-600">{[x.appointments ? `Cita: ${when(x.appointments.starts_at)}` : null, x.appointments?.title].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="shrink-0 rounded-full bg-pink-100 px-3 py-1 text-sm font-bold text-pink-800">Pagar</span>
              </Link>
            ))}
          </div>
        )}
        {open === 'today' && (
          <>
            <div className={`${CARD} divide-y divide-slate-100`}>
              {data.today.length === 0 && <p className="p-4 text-base text-slate-600">No tienes citas hoy.</p>}
              {data.today.map((a) => (
                <Link key={a.id} to={`/citas/${a.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                  <span className="w-20 shrink-0 text-base font-extrabold text-navy-900">{formatTime(a.starts_at)}</span>
                  <span className="min-w-0 flex-1 truncate text-base text-slate-800">{a.boats.clients.full_name}{a.title ? ` · ${a.title}` : ''}</span>
                  <ChevronRight size={18} className="shrink-0 text-slate-400" />
                </Link>
              ))}
            </div>
            <Link to="/agenda" className="mt-3 flex min-h-12 items-center justify-center gap-1 text-base font-bold text-pink-700">Ver la agenda <ChevronRight size={18} /></Link>
          </>
        )}
        {open === 'back' && (data.back > 0 ? <DueServices /> : <p className="py-4 text-center text-base text-slate-500">Nadie le toca volver todavía.</p>)}
      </Sheet>
    </>
  )
}
