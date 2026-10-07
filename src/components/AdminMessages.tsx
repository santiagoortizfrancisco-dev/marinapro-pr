import { Check, Inbox, Mail, Phone } from 'lucide-react'
import { db } from '../lib/db'
import { formatDate, formatTime } from '../lib/format'
import { mailLink, telLink, whatsappLink } from '../lib/links'
import { must, useLoad } from '../lib/useLoad'
import { WhatsAppIcon } from './BrandIcons'
import { IconBadge } from './ui'

interface Msg {
  id: string
  name: string | null
  business: string | null
  email: string | null
  phone: string | null
  contact: string | null
  message: string
  app_version: string | null
  page: string | null
  created_at: string
  read_at: string | null
}

/** Mensajes que mandan los mecánicos con "Contactar al desarrollador". Solo los ve el admin. */
export default function AdminMessages() {
  const { data, setData } = useLoad(async () => must(await db().from('support_messages').select('*').order('created_at', { ascending: false }).limit(50)) as Msg[], [])
  const unread = (data ?? []).filter((m) => !m.read_at).length

  async function markRead(m: Msg) {
    const read_at = new Date().toISOString()
    setData((list) => (list ?? []).map((x) => (x.id === m.id ? { ...x, read_at } : x)))
    await db().from('support_messages').update({ read_at }).eq('id', m.id)
  }

  return (
    <section className="mb-6 space-y-3 rounded-2xl border-2 border-navy-800 p-4">
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-navy-900">
        <IconBadge icon={Inbox} tone="blue" size="sm" /> Mensajes
        {unread > 0 && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-sm text-white">{unread} nuevos</span>}
      </h2>
      {data?.length === 0 && <p className="text-base text-slate-500">Todavía no hay mensajes. Los mecánicos escriben desde Más → Contactar al desarrollador.</p>}
      {data?.map((m) => {
        const phone = m.phone || (m.contact && /\d{7}/.test(m.contact.replace(/\D/g, '')) ? m.contact : null)
        const email = m.email || (m.contact?.includes('@') ? m.contact : null)
        return (
          <article key={m.id} className={`rounded-xl p-3 ${m.read_at ? 'bg-slate-50' : 'bg-blue-50 ring-2 ring-blue-200'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-base font-bold text-slate-900">{m.business || m.name || 'Sin cuenta'}</div>
                <div className="truncate text-sm text-slate-600">{[m.name !== m.business && m.name, m.contact && !m.email && m.contact].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="shrink-0 text-right text-xs text-slate-500">{formatDate(m.created_at)}<br />{formatTime(m.created_at)}</div>
            </div>
            <p className="mt-2 whitespace-pre-line text-base text-slate-800">{m.message}</p>
            {m.page && <p className="mt-1 text-xs text-slate-400">Pantalla: {m.page} · versión {m.app_version}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {phone && (
                <a href={whatsappLink(phone)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-1 rounded-xl bg-[#25D366] px-3 text-sm font-bold text-white">
                  <WhatsAppIcon size={18} /> WhatsApp
                </a>
              )}
              {phone && <a href={telLink(phone)} className="flex min-h-11 items-center gap-1 rounded-xl border-2 border-navy-800 px-3 text-sm font-bold text-navy-800"><Phone size={16} /> Llamar</a>}
              {email && <a href={mailLink(email)} className="flex min-h-11 items-center gap-1 rounded-xl border-2 border-navy-800 px-3 text-sm font-bold text-navy-800"><Mail size={16} /> Email</a>}
              {!m.read_at && (
                <button onClick={() => markRead(m)} className="ml-auto flex min-h-11 items-center gap-1 rounded-xl bg-navy-800 px-3 text-sm font-bold text-white">
                  <Check size={16} /> Leído
                </button>
              )}
            </div>
          </article>
        )
      })}
    </section>
  )
}
