import { useEffect, useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import { WhatsAppIcon } from '../../components/BrandIcons'
import { useAuth } from '../../auth/AuthProvider'
import { db } from '../../lib/db'
import { whatsappLink } from '../../lib/links'
import { must, useLoad } from '../../lib/useLoad'
import { BackTitle, Button, ErrorBox, Field, Input, Loading, Toggle } from '../../components/ui'

type Hours = Record<string, [string, string] | null>
const DAYS = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']] as const

/** "Glow Studio" -> "glow-studio" (lo que va en el link) */
export function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

/**
 * Citas por internet (salón): prender el link del salón, escoger cómo se ve el link y el horario.
 * La clienta abre el link, escoge servicio, empleada, día y hora libre, y la cita llega aquí como "pedida".
 */
export default function BookingSettings() {
  const { session } = useAuth()
  const { data: m, loading, error, reload } = useLoad(async () => must(await db().from('mechanics').select('business_name, booking_on, booking_slug, booking_hours').eq('profile_id', session!.user.id).single()) as {
    business_name: string | null; booking_on: boolean; booking_slug: string | null; booking_hours: Hours
  }, [])
  const [on, setOn] = useState(false)
  const [slug, setSlug] = useState('')
  const [hours, setHours] = useState<Hours>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!m) return
    setOn(m.booking_on)
    setSlug(m.booking_slug ?? slugify(m.business_name ?? ''))
    setHours(m.booking_hours ?? {})
  }, [m])

  const link = `${window.location.origin}/reservar/${slug}`

  async function save() {
    const s = slugify(slug)
    if (s.length < 3) return setErr('El link necesita por lo menos 3 letras.')
    for (const [k, v] of Object.entries(hours)) if (v && v[0] >= v[1]) return setErr(`Revisa el horario del ${DAYS.find((d) => d[0] === k)?.[1]}: abre después de cerrar.`)
    setBusy(true)
    setErr('')
    const { error } = await db().from('mechanics').update({ booking_on: on, booking_slug: s, booking_hours: hours }).eq('profile_id', session!.user.id)
    setBusy(false)
    if (error) return setErr(/duplicate|unique/i.test(error.message) ? 'Ese link ya lo tiene otro negocio. Cámbialo un poco (ej. añade el pueblo).' : 'No se pudo guardar. Intenta otra vez.')
    setSlug(s)
    setMsg('Guardado ✓')
    setTimeout(() => setMsg(''), 2000)
    reload()
  }

  if (loading && !m) return <Loading />
  if (error || !m) return <ErrorBox message={error || 'No se pudo abrir.'} onRetry={reload} />

  const live = m.booking_on && m.booking_slug
  return (
    <>
      <BackTitle subtitle="Tus clientas piden cita solas con tu link, a cualquier hora">Citas por internet</BackTitle>
      <div className="space-y-5">
        <Toggle checked={on} onChange={setOn} label="Recibir citas por internet" hint="Las citas llegan como “pedidas”: tú las confirmas" />

        <Field label="Tu link" hint="Ponlo en tu Instagram, Facebook y WhatsApp">
          <div className="flex items-center gap-1 rounded-xl border-2 border-slate-300 bg-white pl-3">
            <span className="shrink-0 text-sm text-slate-500">/reservar/</span>
            <Input aria-label="Link del salón" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="border-0! pl-0!" />
          </div>
        </Field>

        <div>
          <div className="mb-2 text-base font-semibold text-slate-800">Horario</div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            {DAYS.map(([k, label]) => {
              const h = hours[k]
              return (
                <div key={k} className="flex min-h-14 items-center gap-2 px-3 py-2">
                  <label className="flex w-28 shrink-0 items-center gap-2 text-base font-bold text-slate-800">
                    <input type="checkbox" checked={Boolean(h)} onChange={(e) => setHours({ ...hours, [k]: e.target.checked ? ['09:00', '18:00'] : null })} className="h-5 w-5 accent-pink-600" aria-label={`Abre ${label}`} />
                    {label}
                  </label>
                  {h ? (
                    <div className="flex flex-1 items-center gap-1">
                      <Input type="time" step={1800} aria-label={`${label} abre`} value={h[0]} onChange={(e) => setHours({ ...hours, [k]: [e.target.value, h[1]] })} className="min-h-11! px-2! text-base!" />
                      <span className="text-slate-400">a</span>
                      <Input type="time" step={1800} aria-label={`${label} cierra`} value={h[1]} onChange={(e) => setHours({ ...hours, [k]: [h[0], e.target.value] })} className="min-h-11! px-2! text-base!" />
                    </div>
                  ) : <span className="text-base text-slate-400">Cerrado</span>}
                </div>
              )
            })}
          </div>
        </div>

        {err && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{err}</p>}
        <Button disabled={busy} onClick={save}>{busy ? 'Guardando…' : msg || 'Guardar'}</Button>

        {live && (
          <div className="space-y-2 rounded-3xl bg-pink-50 p-4 ring-1 ring-pink-200">
            <p className="text-base font-bold text-pink-900">Tu link está prendido:</p>
            <p className="break-all text-base text-slate-800">{`${window.location.origin}/reservar/${m.booking_slug}`}</p>
            <a href={whatsappLink('', `¡Ahora puedes pedir tu cita conmigo por aquí! 💅 ${window.location.origin}/reservar/${m.booking_slug}`)} target="_blank" rel="noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-base font-bold text-white"><WhatsAppIcon size={22} /> Compartir por WhatsApp</a>
            <button type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/reservar/${m.booking_slug}`).then(() => { setMsg('Link copiado ✓'); setTimeout(() => setMsg(''), 2000) })}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-base font-bold text-pink-700 ring-1 ring-pink-200"><Copy size={18} /> Copiar link</button>
            <a href={`/reservar/${m.booking_slug}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white text-base font-bold text-slate-700 ring-1 ring-slate-200"><ExternalLink size={18} /> Ver cómo lo ven tus clientas</a>
          </div>
        )}
        {!live && on && <p className="text-sm text-slate-500">Toca Guardar para prender tu link: {link}</p>}
      </div>
    </>
  )
}
