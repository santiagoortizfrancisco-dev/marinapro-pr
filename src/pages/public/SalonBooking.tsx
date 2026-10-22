import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { CalendarHeart, Check, CheckCircle2, Clock, MapPin } from 'lucide-react'
import { WhatsAppIcon } from '../../components/BrandIcons'
import { Input } from '../../components/ui'
import { logoUrl } from '../../lib/brand'
import { addDays, formatMoney, formatTime, prToISO, todayPR } from '../../lib/format'
import { whatsappLink } from '../../lib/links'
import { minutesLabel } from '../../lib/salon'
import { supabase } from '../../lib/supabase'

interface Page {
  name: string; town: string | null; phone: string | null; logo_path: string | null; brand_color: string | null
  hours: Record<string, [string, string] | null>
  services: { id: string; name: string; category: string | null; duration_min: number | null; price: number | null }[]
  staff: { id: string; name: string; color: string }[]
}
interface Busy { starts_at: string; duration_min: number; staff_id: string | null }

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/** Día de la semana de "aaaa-mm-dd" (0 = domingo) */
const dow = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay()

/**
 * El link del salón para que la clienta pida cita sola (sin bajar nada ni crear cuenta):
 * escoge el servicio, con quién, el día y una hora libre, y pone su nombre y teléfono.
 * La cita le llega al salón como "pedida" y el salón la confirma.
 */
export default function SalonBooking() {
  const { slug } = useParams()
  const [page, setPage] = useState<Page | null | undefined>(undefined)
  const [picked, setPicked] = useState<string[]>([])
  const [staffId, setStaffId] = useState<string | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.rpc('booking_page', { p_slug: slug }).then(({ data }) => setPage((data as Page | null) ?? null))
  }, [slug])

  const color = page?.brand_color && page.brand_color !== '#0b1220' ? page.brand_color : '#db2777'
  const days = useMemo(() => {
    if (!page) return []
    const today = todayPR()
    return Array.from({ length: 21 }, (_, i) => addDays(today, i)).filter((d) => page.hours[String(dow(d))])
  }, [page])

  useEffect(() => {
    if (!day || !supabase) return
    setTime(null)
    supabase.rpc('booking_busy', { p_slug: slug, p_day: day }).then(({ data }) => setBusy((data as Busy[] | null) ?? []))
  }, [day, slug])

  const minutes = useMemo(() => {
    const sel = (page?.services ?? []).filter((s) => picked.includes(s.id))
    return sel.reduce((t, s) => t + (s.duration_min ?? 30), 0) || 60
  }, [page, picked])

  // Las horas libres de ese día (cada 30 min), según el horario, lo que dura y lo que ya está cogido
  const slots = useMemo(() => {
    if (!page || !day) return []
    const h = page.hours[String(dow(day))]
    if (!h) return []
    const open = toMin(h[0]), close = toMin(h[1])
    const soon = Date.now() + 30 * 60000
    const staffCount = Math.max(1, page.staff.length)
    const out: string[] = []
    for (let m = open; m + minutes <= close; m += 30) {
      const t = toTime(m)
      const start = new Date(prToISO(day, t)).getTime()
      if (start < soon) continue
      const end = start + minutes * 60000
      const overlapping = busy.filter((b) => {
        const bs = new Date(b.starts_at).getTime()
        return bs < end && bs + b.duration_min * 60000 > start && (!staffId || !b.staff_id || b.staff_id === staffId)
      }).length
      if (staffId ? overlapping === 0 : overlapping < staffCount) out.push(t)
    }
    return out
  }, [page, day, busy, minutes, staffId])

  async function send() {
    if (!supabase || !day || !time) return
    if (name.trim().length < 2) return setError('Escribe tu nombre.')
    if (phone.replace(/\D/g, '').length < 7) return setError('Escribe tu teléfono.')
    setSending(true)
    setError('')
    const { error } = await supabase.rpc('booking_request', {
      p_slug: slug, p_name: name.trim(), p_phone: phone.trim(), p_services: picked, p_staff: staffId, p_starts_at: prToISO(day, time), p_note: note.trim() || null,
    })
    setSending(false)
    if (error) {
      setError(error.message || 'No se pudo pedir la cita. Intenta otra vez.')
      supabase.rpc('booking_busy', { p_slug: slug, p_day: day }).then(({ data }) => setBusy((data as Busy[] | null) ?? []))
      return
    }
    setDone(true)
  }

  if (page === undefined) return <div className="flex min-h-dvh items-center justify-center bg-pink-50"><div className="h-10 w-10 animate-spin rounded-full border-4 border-pink-100 border-t-pink-600" /></div>
  if (page === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-pink-50 px-6 text-center">
        <CalendarHeart size={48} className="text-pink-400" />
        <h1 className="text-2xl font-extrabold text-slate-900">Este link no está activo</h1>
        <p className="text-base text-slate-600">El salón todavía no recibe citas por internet. Llámalo o escríbele por WhatsApp.</p>
      </div>
    )
  }

  const logo = logoUrl(page.logo_path)
  const categories = [...new Set(page.services.map((s) => s.category ?? 'Otros'))]
  const whenText = day && time ? `${DAY_NAMES[dow(day)]} ${day.slice(8)}/${day.slice(5, 7)} a las ${formatTime(new Date(prToISO(day, time)))}` : ''

  return (
    <div className="min-h-dvh bg-pink-50 pb-12" data-trade="beauty">
      <header className="safe-top px-5 pb-6 pt-5 text-white" style={{ backgroundColor: color }}>
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {logo && <img src={logo} alt="" className="h-14 w-14 rounded-2xl bg-white object-contain" />}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold">{page.name}</h1>
            {page.town && <p className="flex items-center gap-1 text-sm text-white/85"><MapPin size={14} /> {page.town}, PR</p>}
          </div>
        </div>
        <p className="mx-auto mt-3 max-w-xl text-lg font-bold">Pide tu cita 💅</p>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 pt-4">
        {done ? (
          <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-pink-100">
            <CheckCircle2 size={56} className="mx-auto text-emerald-600" />
            <h2 className="mt-2 text-2xl font-extrabold text-slate-900">¡Cita pedida!</h2>
            <p className="mt-1 text-lg text-slate-700">{whenText}</p>
            <p className="mt-3 text-base text-slate-600">{page.name} te va a confirmar por WhatsApp o llamada.</p>
            {page.phone && (
              <a href={whatsappLink(page.phone, `Hola, acabo de pedir cita por el link para el ${whenText}. Soy ${name.trim()}.`)} target="_blank" rel="noreferrer"
                className="mt-5 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-lg font-bold text-white"><WhatsAppIcon size={24} /> Escribirle al salón</a>
            )}
          </section>
        ) : (
          <>
            {/* 1. Servicios */}
            <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
              <h2 className="mb-2 text-lg font-extrabold text-slate-900">1. ¿Qué te vas a hacer?</h2>
              {categories.map((cat) => (
                <div key={cat} className="mb-2">
                  <div className="px-1 pb-1 pt-2 text-xs font-extrabold uppercase tracking-wider text-pink-700">{cat}</div>
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-slate-50">
                    {page.services.filter((s) => (s.category ?? 'Otros') === cat).map((s) => {
                      const on = picked.includes(s.id)
                      return (
                        <button key={s.id} type="button" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                          className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left ${on ? 'bg-pink-50' : ''}`}>
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-pink-600 bg-pink-600 text-white' : 'border-slate-300 bg-white'}`}>{on && <Check size={16} strokeWidth={3} />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-bold text-slate-900">{s.name}</span>
                            {s.duration_min ? <span className="block text-sm text-slate-500">{minutesLabel(s.duration_min)}</span> : null}
                          </span>
                          {s.price != null && <span className="shrink-0 text-base font-bold text-slate-700">{formatMoney(Number(s.price))}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>

            {/* 2. Con quién */}
            {page.staff.length > 0 && (
              <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
                <h2 className="mb-2 text-lg font-extrabold text-slate-900">2. ¿Con quién?</h2>
                <div className="flex flex-wrap gap-2">
                  {[{ id: null as string | null, name: 'Cualquiera', color }, ...page.staff].map((s) => {
                    const on = staffId === s.id
                    return (
                      <button key={s.id ?? 'any'} type="button" aria-pressed={on} onClick={() => setStaffId(s.id)}
                        className="min-h-12 rounded-full px-4 text-base font-bold" style={on ? { backgroundColor: s.color, color: '#fff' } : { backgroundColor: `${s.color}1f`, color: s.color }}>
                        {s.name}
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {/* 3. Día y hora */}
            <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
              <h2 className="mb-2 text-lg font-extrabold text-slate-900">{page.staff.length > 0 ? 3 : 2}. ¿Qué día y a qué hora?</h2>
              <p className="mb-2 flex items-center gap-1 text-sm text-slate-500"><Clock size={14} /> Tu cita dura más o menos {minutesLabel(minutes)}</p>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="group" aria-label="Día">
                {days.map((d) => {
                  const on = day === d
                  return (
                    <button key={d} type="button" aria-pressed={on} onClick={() => setDay(d)}
                      className={`flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-2xl font-bold ${on ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                      <span className="text-xs">{DAY_NAMES[dow(d)]}</span><span className="text-xl">{Number(d.slice(8))}</span>
                    </button>
                  )
                })}
              </div>
              {day && (slots.length === 0 ? (
                <p className="mt-2 rounded-2xl bg-slate-50 p-3 text-base text-slate-600">No quedan horas libres ese día. Escoge otro.</p>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Hora">
                  {slots.map((t) => (
                    <button key={t} type="button" aria-pressed={time === t} onClick={() => setTime(t)}
                      className={`min-h-12 rounded-xl text-base font-bold ${time === t ? 'bg-pink-600 text-white' : 'bg-pink-50 text-pink-800'}`}>
                      {formatTime(new Date(prToISO(day, t)))}
                    </button>
                  ))}
                </div>
              ))}
            </section>

            {/* 4. Quién eres */}
            {day && time && (
              <section className="space-y-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
                <h2 className="text-lg font-extrabold text-slate-900">Tus datos</h2>
                <Input aria-label="Tu nombre" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
                <Input aria-label="Tu teléfono" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu teléfono / WhatsApp" />
                <Input aria-label="Nota" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional): color, largo, diseño…" />
                {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
                <button type="button" disabled={sending} onClick={send}
                  className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl text-xl font-extrabold text-white disabled:opacity-60" style={{ backgroundColor: color }}>
                  <CalendarHeart /> {sending ? 'Enviando…' : `Pedir cita · ${whenText}`}
                </button>
              </section>
            )}
          </>
        )}
        <p className="pt-4 text-center text-xs text-slate-400">Hecho con FacturaFácil PR</p>
      </main>
    </div>
  )
}
