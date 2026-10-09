import { Check, Mail, UserCheck, X } from 'lucide-react'
import { db } from '../lib/db'
import { formatDate, formatTime } from '../lib/format'
import { mailLink, whatsappLink } from '../lib/links'
import { must, useLoad } from '../lib/useLoad'
import { WhatsAppIcon } from './BrandIcons'
import { IconBadge } from './ui'

interface Pending {
  id: string
  full_name: string | null
  business_name: string | null
  email: string | null
  phone: string | null
  town: string | null
  access: 'pending' | 'rejected'
  created_at: string
}

/** Mecánicos que se registraron solos: el admin los aprueba (o rechaza) aquí. */
export default function AdminPending() {
  const { data, reload } = useLoad(async () => must(await db().rpc('admin_pending_accounts')) as Pending[], [])

  async function setAccess(p: Pending, access: 'approved' | 'rejected' | 'pending') {
    await db().rpc('admin_set_access', { p_user: p.id, p_access: access })
    reload()
  }

  const pending = (data ?? []).filter((p) => p.access === 'pending')
  const rejected = (data ?? []).filter((p) => p.access === 'rejected')
  if (!data || data.length === 0) return null

  return (
    <section className="mb-6 space-y-3 rounded-2xl border-2 border-red-500 p-4">
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-navy-900">
        <IconBadge icon={UserCheck} tone="green" size="sm" /> Cuentas por aprobar
        {pending.length > 0 && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-sm text-white">{pending.length}</span>}
      </h2>
      {pending.length === 0 && <p className="text-base text-slate-500">No hay nadie esperando.</p>}
      {pending.map((p) => (
        <article key={p.id} className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-lg font-bold text-slate-900">{p.business_name || p.full_name || 'Sin nombre'}</div>
              <div className="text-sm text-slate-700">{[p.business_name && p.full_name, p.town].filter(Boolean).join(' · ')}</div>
              <div className="truncate text-sm text-slate-600">{[p.phone, p.email].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="shrink-0 text-right text-xs text-slate-500">{formatDate(p.created_at)}<br />{formatTime(p.created_at)}</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => setAccess(p, 'approved')} className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-emerald-700 text-base font-bold text-white active:bg-emerald-800">
              <Check size={20} /> Aprobar
            </button>
            <button onClick={() => setAccess(p, 'rejected')} className="flex min-h-12 items-center justify-center gap-1 rounded-xl border-2 border-red-700 bg-white text-base font-bold text-red-700">
              <X size={20} /> Rechazar
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            {p.phone && (
              <a href={whatsappLink(p.phone, `Hola ${p.full_name?.split(' ')[0] ?? ''}, es sobre tu cuenta de Salt Marine Repair.`)} target="_blank" rel="noreferrer" className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-[#25D366] text-sm font-bold text-white">
                <WhatsAppIcon size={18} /> WhatsApp
              </a>
            )}
            {p.email && <a href={mailLink(p.email)} className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border-2 border-navy-800 text-sm font-bold text-navy-800"><Mail size={16} /> Email</a>}
          </div>
        </article>
      ))}
      {rejected.length > 0 && (
        <details className="text-sm text-slate-600">
          <summary className="cursor-pointer font-semibold">Rechazados ({rejected.length})</summary>
          {rejected.map((p) => (
            <div key={p.id} className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2">
              <span className="truncate">{p.business_name || p.full_name} · {p.email}</span>
              <button onClick={() => setAccess(p, 'approved')} className="shrink-0 rounded-lg border-2 border-emerald-700 px-2 py-1 font-bold text-emerald-700">Aprobar</button>
            </div>
          ))}
        </details>
      )}
    </section>
  )
}
