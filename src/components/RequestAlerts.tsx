import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CalendarPlus } from 'lucide-react'
import { db } from '../lib/db'
import { ago } from '../lib/format'

interface Req {
  id: string
  contact_name: string | null
  description: string
  created_at: string
}

const CHECK_EVERY_MS = 60 * 1000

/**
 * Aviso amarillo arriba de todas las pantallas: alguien pidió cita desde el directorio.
 * Se queda hasta que el mecánico le hace la cita o la descarta (como un papelito en la nevera).
 */
export default function RequestAlerts() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [items, setItems] = useState<Req[]>([])

  const load = useCallback(async () => {
    const { data } = await db()
      .from('service_requests')
      .select('id, contact_name, description, created_at')
      .eq('source', 'directory')
      .eq('spam', false)
      .in('status', ['new', 'seen'])
      .order('created_at', { ascending: false })
      .limit(5)
    setItems((data ?? []) as Req[])
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

  useEffect(() => {
    const t = setTimeout(load, 1500)
    return () => clearTimeout(t)
  }, [pathname, load])

  if (items.length === 0 || pathname.startsWith('/solicitudes/')) return null

  return (
    <div className="mx-auto max-w-xl space-y-2 px-4 pt-3">
      {items.map((r) => (
        <button
          key={r.id}
          role="status"
          onClick={() => navigate(`/solicitudes/${r.id}`)}
          className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-amber-400 px-4 py-3 text-left text-navy-900 shadow-lg active:bg-amber-500"
        >
          <CalendarPlus size={28} className="shrink-0" />
          <span className="min-w-0 text-base leading-snug">
            <b>{(r.contact_name ?? 'Alguien').split(' ')[0]}</b> pidió cita: <span className="line-clamp-1">{r.description}</span>
            <span className="block text-sm">{ago(r.created_at)} · toca para ver</span>
          </span>
        </button>
      ))}
    </div>
  )
}
