import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CheckCircle2, X } from 'lucide-react'
import { db } from '../lib/db'
import { formatDate, formatTime } from '../lib/format'

interface Approval {
  id: string
  appointment_id: string | null
  estimate_approved_at: string
  boats: { name: string; clients: { full_name: string } }
}

/** Una vez por minuto mientras el app está abierta, y cada vez que se vuelve a ella. */
const CHECK_EVERY_MS = 60 * 1000

/**
 * Aviso verde arriba de todas las pantallas cuando un cliente aprueba un estimado desde el link.
 * Se quita al abrir la cita (o con la X).
 */
export default function ApprovalAlerts() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [items, setItems] = useState<Approval[]>([])
  const dismissed = useRef(new Set<string>()) // quitados con la X (por si una revisión llega antes de guardarse)

  const load = useCallback(async () => {
    const { data } = await db()
      .from('work_orders')
      .select('id, appointment_id, estimate_approved_at, boats(name, clients(full_name))')
      .eq('estimate_approved_by', 'client')
      .is('approval_seen_at', null)
      .order('estimate_approved_at', { ascending: false })
      .limit(5)
    setItems(((data ?? []) as unknown as Approval[]).filter((w) => !dismissed.current.has(w.id)))
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, CHECK_EVERY_MS)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // Al cambiar de pantalla se revisa otra vez (así se quita el aviso de la cita que se acaba de abrir)
  useEffect(() => {
    const t = setTimeout(load, 1500)
    return () => clearTimeout(t)
  }, [pathname, load])

  async function dismiss(id: string) {
    dismissed.current.add(id)
    setItems((list) => list.filter((w) => w.id !== id))
    await db().from('work_orders').update({ approval_seen_at: new Date().toISOString() }).eq('id', id)
  }

  if (items.length === 0) return null

  return (
    <div className="mx-auto max-w-xl space-y-2 px-4 pt-3">
      {items.map((w) => (
        <div key={w.id} role="status" className="flex items-stretch overflow-hidden rounded-2xl bg-emerald-700 text-white shadow-lg">
          <button
            onClick={() => navigate(w.appointment_id ? `/citas/${w.appointment_id}` : `/trabajos/${w.id}`)}
            className="flex min-h-16 flex-1 items-center gap-3 px-4 py-3 text-left active:bg-emerald-800"
          >
            <CheckCircle2 size={28} className="shrink-0" />
            <span className="text-base leading-snug">
              <b>{w.boats.clients.full_name.split(' ')[0]}</b> aprobó el estimado de <b>{w.boats.name}</b>
              <span className="block text-sm text-emerald-100">
                {formatDate(w.estimate_approved_at)} a las {formatTime(w.estimate_approved_at)} · toca para verlo
              </span>
            </span>
          </button>
          <button onClick={() => dismiss(w.id)} aria-label="Quitar aviso" className="flex w-14 shrink-0 items-center justify-center border-l border-emerald-600 active:bg-emerald-800">
            <X size={24} />
          </button>
        </div>
      ))}
    </div>
  )
}
