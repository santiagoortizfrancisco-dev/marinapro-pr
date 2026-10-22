import { useEffect } from 'react'
import { Mail, Phone, UserPlus } from 'lucide-react'
import { db } from '../lib/db'
import { formatDate, formatTime } from '../lib/format'
import { telLink } from '../lib/links'
import { TRADES, type Trade } from '../lib/trade'
import { useLoad } from '../lib/useLoad'

interface Signup { id: string; full_name: string | null; business_name: string | null; business_type: string | null; email: string | null; phone: string | null; town: string | null; created_at: string; seen_at: string | null }

/** Admin → Registros nuevos: quién se registró (nombre, negocio, oficio, email y teléfono). Al verlos quedan vistos. */
export default function AdminSignups() {
  const { data } = useLoad(async () => ((await db().rpc('admin_new_signups')).data ?? []) as Signup[], [])
  useEffect(() => {
    if (data?.some((s) => !s.seen_at)) db().rpc('admin_mark_signups_seen').then(() => undefined)
  }, [data])

  if (!data || data.length === 0) return null
  const fresh = data.filter((s) => !s.seen_at).length

  return (
    <section className="mb-5" aria-label="Registros nuevos">
      <h2 className="mb-2 flex items-center gap-2 text-xl font-extrabold text-navy-900">
        <UserPlus size={22} /> Registros nuevos
        {fresh > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-sm text-white">{fresh}</span>}
      </h2>
      <div className="space-y-2">
        {data.slice(0, 30).map((s) => {
          const t = TRADES.find((x) => x.value === (s.business_type as Trade))
          return (
            <div key={s.id} className={`rounded-2xl bg-white p-3 ring-1 ${s.seen_at ? 'ring-slate-200' : 'ring-2 ring-red-300'}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-extrabold text-slate-900">{s.business_name || s.full_name || 'Sin nombre'}</div>
                  <div className="truncate text-sm text-slate-600">{[s.full_name, t ? `${t.emoji} ${t.label}` : s.business_type, s.town].filter(Boolean).join(' · ')}</div>
                </div>
                {!s.seen_at && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Nuevo</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {s.phone && <a href={telLink(s.phone)} className="flex items-center gap-1 font-semibold text-navy-700"><Phone size={14} /> {s.phone}</a>}
                {s.email && <a href={`mailto:${s.email}`} className="flex items-center gap-1 font-semibold text-navy-700"><Mail size={14} /> {s.email}</a>}
              </div>
              <div className="mt-1 text-xs text-slate-400">{formatDate(s.created_at)} {formatTime(s.created_at)}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
