import { useState } from 'react'
import { Link } from 'react-router'
import { BellRing, CalendarPlus, MessageCircle, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { db } from '../lib/db'
import { addDays, daysUntil, formatDate, todayPR } from '../lib/format'
import { whatsappLink } from '../lib/links'
import { useLoad } from '../lib/useLoad'

interface Due {
  key: string
  scheduleId: string | null // null = marbete
  boatId: string
  boatName: string
  clientName: string
  phone: string | null
  what: string
  due: string
}

const SHOW = 4

function whenText(due: string) {
  const d = daysUntil(due)
  if (d < 0) return { text: `Se pasó hace ${-d} ${d === -1 ? 'día' : 'días'}`, late: true }
  if (d === 0) return { text: 'Hoy', late: true }
  return { text: `En ${d} ${d === 1 ? 'día' : 'días'} · ${formatDate(due)}`, late: false }
}

/** "Le toca servicio": recordatorios que vencen en 30 días (o ya se pasaron) y marbetes por vencer. */
export default function DueServices() {
  const { profile } = useAuth()
  const [all, setAll] = useState(false)
  const limit = addDays(todayPR(), 30)
  const { data, setData } = useLoad(async () => {
    const [sched, marbetes] = await Promise.all([
      db().from('maintenance_schedules').select('id, service_type, due_date, boats(id, name, clients(full_name, phone))').in('status', ['pending', 'notified']).lte('due_date', limit).order('due_date'),
      db().from('boats').select('id, name, marbete_expires, clients(full_name, phone)').not('marbete_expires', 'is', null).lte('marbete_expires', limit).gte('marbete_expires', addDays(todayPR(), -60)),
    ])
    type S = { id: string; service_type: string; due_date: string; boats: { id: string; name: string; clients: { full_name: string; phone: string | null } } }
    type M = { id: string; name: string; marbete_expires: string; clients: { full_name: string; phone: string | null } }
    const list: Due[] = [
      ...((sched.data ?? []) as unknown as S[]).map((s) => ({ key: s.id, scheduleId: s.id, boatId: s.boats.id, boatName: s.boats.name, clientName: s.boats.clients.full_name, phone: s.boats.clients.phone, what: s.service_type, due: s.due_date })),
      ...((marbetes.data ?? []) as unknown as M[]).map((b) => ({ key: `marbete-${b.id}`, scheduleId: null, boatId: b.id, boatName: b.name, clientName: b.clients.full_name, phone: b.clients.phone, what: 'Renovar el marbete', due: b.marbete_expires })),
    ]
    return list.sort((a, b) => a.due.localeCompare(b.due))
  }, [])

  if (!data || data.length === 0) return null

  async function markNotified(d: Due) {
    if (d.scheduleId) await db().from('maintenance_schedules').update({ status: 'notified', last_notified_at: new Date().toISOString() }).eq('id', d.scheduleId)
  }

  async function dismiss(d: Due) {
    setData((list) => (list ?? []).filter((x) => x.key !== d.key))
    if (d.scheduleId) await db().from('maintenance_schedules').update({ status: 'skipped' }).eq('id', d.scheduleId)
  }

  const shown = all ? data : data.slice(0, SHOW)

  return (
    <section className="mb-5 rounded-2xl border-2 border-sun-500 bg-sun-400/10 p-3">
      <h2 className="mb-2 flex items-center gap-2 px-1 text-lg font-extrabold text-navy-900">
        <BellRing size={22} /> Le toca servicio ({data.length})
      </h2>
      <div className="space-y-2">
        {shown.map((d) => {
          const w = whenText(d.due)
          const first = d.clientName.split(' ')[0]
          const msg = d.scheduleId
            ? `Hola ${first}, a tu bote ${d.boatName} le toca: ${d.what}. ¿Te separo un día para hacerlo? ${profile?.full_name ?? ''}`.trim()
            : `Hola ${first}, el marbete de tu bote ${d.boatName} vence el ${formatDate(d.due)}. Si quieres, aprovechamos y le damos servicio antes. ${profile?.full_name ?? ''}`.trim()
          return (
            <div key={d.key} className="rounded-xl bg-white p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-extrabold text-slate-900">{d.boatName} <span className="font-semibold text-slate-600">· {d.clientName}</span></div>
                  <div className="text-base text-slate-800">{d.what}</div>
                  <div className={`text-sm font-bold ${w.late ? 'text-red-700' : 'text-slate-600'}`}>{w.text}</div>
                </div>
                {d.scheduleId && (
                  <button onClick={() => dismiss(d)} aria-label={`Quitar ${d.what} de ${d.boatName}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100">
                    <X size={20} />
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {d.phone ? (
                  <a href={whatsappLink(d.phone, msg)} target="_blank" rel="noreferrer" onClick={() => markNotified(d)} className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-emerald-700 text-base font-bold text-white active:bg-emerald-800">
                    <MessageCircle size={20} /> Avisarle
                  </a>
                ) : (
                  <span className="flex min-h-12 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">Sin teléfono</span>
                )}
                <Link to={`/citas/nueva?bote=${d.boatId}&problema=${encodeURIComponent(d.what)}`} className="flex min-h-12 items-center justify-center gap-1 rounded-xl border-2 border-navy-800 text-base font-bold text-navy-800 active:bg-navy-50">
                  <CalendarPlus size={20} /> Hacer cita
                </Link>
              </div>
            </div>
          )
        })}
      </div>
      {data.length > SHOW && (
        <button onClick={() => setAll((v) => !v)} className="mt-2 w-full text-base font-bold text-navy-700 underline underline-offset-4">
          {all ? 'Ver menos' : `Ver todos (${data.length})`}
        </button>
      )}
    </section>
  )
}
