import { useEffect } from 'react'
import { Mail, MessageSquareText } from 'lucide-react'
import { db } from '../lib/db'
import { formatDate, formatTime } from '../lib/format'
import { useLoad } from '../lib/useLoad'

interface InfoRequest { id: string; full_name: string; email: string; business_type: string | null; message: string | null; created_at: string; seen_at: string | null }

/** Admin → Piden información: lo que dejaron en la página /info (nombre, email, negocio, mensaje). Al verlos quedan vistos. */
export default function AdminInfoRequests() {
  const { data } = useLoad(async () => ((await db().rpc('admin_info_requests')).data ?? []) as InfoRequest[], [])
  useEffect(() => {
    if (data?.some((r) => !r.seen_at)) db().rpc('admin_mark_info_seen').then(() => undefined)
  }, [data])

  if (!data || data.length === 0) return null
  const fresh = data.filter((r) => !r.seen_at).length

  return (
    <section className="mb-5" aria-label="Piden información">
      <h2 className="mb-2 flex items-center gap-2 text-xl font-extrabold text-navy-900">
        <MessageSquareText size={22} /> Piden información
        {fresh > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-sm text-white">{fresh}</span>}
      </h2>
      <div className="space-y-2">
        {data.slice(0, 30).map((r) => (
          <div key={r.id} className={`rounded-2xl bg-white p-3 ring-1 ${r.seen_at ? 'ring-slate-200' : 'ring-2 ring-red-300'}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-extrabold text-slate-900">{r.full_name}</div>
                {r.business_type && <div className="truncate text-sm text-slate-600">{r.business_type}</div>}
              </div>
              {!r.seen_at && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Nuevo</span>}
            </div>
            {r.message && <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-2 text-base text-slate-800">{r.message}</p>}
            <a href={`mailto:${r.email}?subject=${encodeURIComponent('FacturaFácil PR')}`} className="mt-2 flex items-center gap-1 text-sm font-semibold text-navy-700"><Mail size={14} /> {r.email}</a>
            <div className="mt-1 text-xs text-slate-400">{formatDate(r.created_at)} {formatTime(r.created_at)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
