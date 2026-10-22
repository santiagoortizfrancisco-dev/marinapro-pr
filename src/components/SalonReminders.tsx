import { useState } from 'react'
import { Link } from 'react-router'
import { BellRing, Check, ChevronRight, Globe } from 'lucide-react'
import { WhatsAppIcon } from './BrandIcons'
import { useAuth } from '../auth/AuthProvider'
import { db } from '../lib/db'
import { addDays, formatDate, formatLongDate, formatTime, prRange, todayPR } from '../lib/format'
import { whatsappLink } from '../lib/links'
import { useLoad } from '../lib/useLoad'
import { CARD } from './ui'

interface Appt {
  id: string; starts_at: string; status: string; title: string | null; reminded_at: string | null; source: string
  staff: { name: string } | null
  boats: { clients: { full_name: string; phone: string | null } }
}
const SELECT = 'id, starts_at, status, title, reminded_at, source, staff(name), boats(clients(full_name, phone))'

/**
 * Inicio del salón: las citas que pidieron por internet (para confirmarlas) y las de mañana
 * con un botón para recordarle a cada clienta por WhatsApp (queda marcada como recordada).
 */
export default function SalonReminders() {
  const { session } = useAuth()
  const tomorrow = addDays(todayPR(), 1)
  const [sent, setSent] = useState<string[]>([])
  const { data } = useLoad(async () => {
    const [start, end] = prRange(tomorrow, 1)
    const [asked, next, mech] = await Promise.all([
      db().from('appointments').select(SELECT).eq('status', 'requested').gte('starts_at', new Date().toISOString()).order('starts_at').limit(20),
      db().from('appointments').select(SELECT).gte('starts_at', start).lt('starts_at', end).in('status', ['requested', 'confirmed']).order('starts_at'),
      db().from('mechanics').select('business_name').eq('profile_id', session!.user.id).single(),
    ])
    return {
      asked: (asked.data ?? []) as unknown as Appt[],
      next: (next.data ?? []) as unknown as Appt[],
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

  return (
    <>
      {data.asked.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-extrabold text-navy-900"><Globe size={22} /> Pedidas por internet</h2>
          <div className={`${CARD} divide-y divide-slate-100`}>
            {data.asked.map((a) => (
              <Link key={a.id} to={`/citas/${a.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-slate-900">{a.boats.clients.full_name}</span>
                  <span className="block truncate text-sm text-slate-600">{formatDate(a.starts_at).slice(0, 5)} {formatTime(a.starts_at)}{a.title ? ` · ${a.title}` : ''}</span>
                </span>
                <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">Confirmar</span>
                <ChevronRight size={18} className="shrink-0 text-slate-400" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.next.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-extrabold text-navy-900"><BellRing size={22} /> Mañana · recordarles</h2>
          <div className={`${CARD} divide-y divide-slate-100`}>
            {data.next.map((a) => {
              const done = Boolean(a.reminded_at) || sent.includes(a.id)
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <Link to={`/citas/${a.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-slate-900">{formatTime(a.starts_at)} · {a.boats.clients.full_name}</span>
                    {(a.title || a.staff) && <span className="block truncate text-sm text-slate-600">{[a.title, a.staff ? `con ${a.staff.name}` : null].filter(Boolean).join(' · ')}</span>}
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
        </section>
      )}
    </>
  )
}
