import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Anchor, CheckCircle2, MapPin, MessageCircle, Phone, Ship, Wrench } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DEFAULT_BRAND, logoUrl } from '../../lib/brand'
import { BOAT_MAKES, LOCATION_TYPES, WORK_AREAS, labelOf } from '../../lib/catalog'
import { WHEN_OPTIONS, type PublicMechanic } from '../../lib/directory'
import { telLink, whatsappLink } from '../../lib/links'
import AdBanner from '../../components/AdBanner'
import { Button, Field, Input, Loading, Suggestions, Textarea } from '../../components/ui'
import PublicShell from './PublicShell'

/** Perfil público de un mecánico: quién es, qué hace, dónde trabaja y "Pedir cita". */
export default function MechanicProfile() {
  const { slug = '' } = useParams()
  const [m, setM] = useState<PublicMechanic | null | undefined>(undefined)
  const [asking, setAsking] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!supabase) return setM(null)
    supabase.rpc('directory_profile', { p_slug: slug }).then(({ data }) => setM((data as PublicMechanic | null) ?? null))
  }, [slug])

  useEffect(() => {
    if (m) document.title = `${m.name} · Mecánico de bote en ${m.town ?? 'Puerto Rico'}`
  }, [m])

  if (m === undefined) return <PublicShell><Loading /></PublicShell>
  if (m === null) {
    return (
      <PublicShell>
        <section className="py-16 text-center">
          <Anchor size={48} className="mx-auto text-navy-700" />
          <h1 className="mt-4 text-2xl font-extrabold text-navy-900">No encontramos ese mecánico</h1>
          <Link to="/mecanicos" className="mt-4 inline-block text-lg font-bold text-navy-700 underline">Ver todos los mecánicos</Link>
        </section>
      </PublicShell>
    )
  }

  const color = m.brand_color || DEFAULT_BRAND
  const logo = logoUrl(m.logo_path) ?? '/logo.svg'
  const wa = m.phone ? whatsappLink(m.phone, `Hola ${m.owner ?? ''}, te encontré en Salt Boat. Necesito ayuda con mi bote.`) : null

  return (
    <PublicShell>
      {/* Portada con su color y su logo */}
      <section className="-mx-4 px-4 pb-6 pt-6 text-white" style={{ backgroundColor: color }}>
        <div className="flex items-center gap-4">
          <img src={logo} alt={`Logo de ${m.name}`} className="h-24 w-24 shrink-0 rounded-2xl bg-black object-contain ring-4 ring-white/30" />
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold leading-tight">{m.name}</h1>
            {m.owner && m.owner !== m.name && <p className="text-lg opacity-90">{m.owner}</p>}
            {m.town && <p className="mt-1 flex items-center gap-1 text-base opacity-90"><MapPin size={16} /> {m.town}</p>}
          </div>
        </div>
      </section>

      {sent ? (
        <section className="mt-6 rounded-2xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-200">
          <CheckCircle2 size={56} className="mx-auto text-emerald-600" />
          <h2 className="mt-3 text-2xl font-extrabold text-emerald-900">¡Listo! Tu solicitud llegó</h2>
          <p className="mt-2 text-lg text-emerald-900">{m.owner ?? m.name} la va a ver en su app y te llama o te escribe por WhatsApp para darte la cita.</p>
          <Link to="/mecanicos" className="mt-5 inline-block text-base font-bold text-navy-700 underline">Volver al directorio</Link>
        </section>
      ) : asking ? (
        <RequestForm m={m} onSent={() => setSent(true)} onCancel={() => setAsking(false)} />
      ) : (
        <>
          {/* Acciones */}
          <section className="mt-5 space-y-3">
            <Button onClick={() => setAsking(true)} className="min-h-16 bg-sun-400 text-xl font-extrabold text-navy-900 active:bg-sun-500">
              Pedir cita
            </Button>
            <div className="flex gap-3">
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-base font-bold text-white">
                  <MessageCircle size={20} /> WhatsApp
                </a>
              )}
              {m.phone && (
                <a href={telLink(m.phone)} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-navy-800 bg-white px-3 text-base font-bold text-navy-800">
                  <Phone size={20} /> Llamar
                </a>
              )}
            </div>
          </section>

          {m.description && (
            <section className="mt-6">
              <h2 className="text-lg font-extrabold text-navy-900">Sobre nosotros</h2>
              <p className="mt-1 whitespace-pre-line text-lg text-slate-700">{m.description}</p>
            </section>
          )}

          <InfoBlock icon={Wrench} title="Servicios" items={m.services.map((s) => labelOf(WORK_AREAS, s))} />
          <InfoBlock icon={Ship} title="Marcas que trabaja" items={m.brands} />
          <InfoBlock icon={MapPin} title="Pueblos donde trabaja" items={m.towns} />
          <InfoBlock icon={Anchor} title="Va donde está tu bote" items={m.locations.map((l) => labelOf(LOCATION_TYPES, l))} />

          <AdBanner index={1} />
        </>
      )}
    </PublicShell>
  )
}

function InfoBlock({ icon: Icon, title, items }: { icon: typeof Wrench; title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 text-lg font-extrabold text-navy-900"><Icon size={20} /> {title}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((i) => <span key={i} className="rounded-full bg-white px-4 py-2 text-base font-semibold text-slate-800 ring-1 ring-slate-200">{i}</span>)}
      </div>
    </section>
  )
}

/** "Pedir cita": pocas preguntas, sin cuenta. Le llega al mecánico como solicitud nueva. */
function RequestForm({ m, onSent, onCancel }: { m: PublicMechanic; onSent: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [boat, setBoat] = useState('')
  const [make, setMake] = useState('')
  const [location, setLocation] = useState('')
  const [problem, setProblem] = useState('')
  const [when, setWhen] = useState<string>(WHEN_OPTIONS[0].value)
  const [website, setWebsite] = useState('') // trampa para robots
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (name.trim().length < 2) return setError('Escribe tu nombre.')
    if (phone.replace(/\D/g, '').length < 7) return setError('Escribe tu teléfono para que te puedan llamar.')
    if (problem.trim().length < 3) return setError('Cuéntale qué le pasa al bote.')
    if (!supabase) return
    setSaving(true)
    const { error: err } = await supabase.rpc('submit_directory_request', {
      p_slug: m.slug, p_name: name, p_phone: phone, p_boat: boat, p_boat_make: make,
      p_location: location, p_problem: problem, p_when: when, p_website: website,
    })
    setSaving(false)
    if (err) {
      if (err.message.includes('varias')) return setError(err.message)
      if (err.message.includes('disponible')) return setError('Este mecánico todavía no está recibiendo solicitudes por aquí. Escríbele por WhatsApp.')
      return setError('No se pudo enviar. Intenta otra vez o escríbele por WhatsApp.')
    }
    onSent()
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-2xl font-extrabold text-navy-900">Pedir cita a {m.name}</h2>
      <p className="text-base text-slate-600">No necesitas cuenta. Te llaman o te escriben para confirmar el día.</p>

      <Field label="Tu nombre"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
      <Field label="Tu teléfono (WhatsApp)"><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="787-555-1234" /></Field>
      <Field label="¿Qué le pasa al bote?">
        <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Ej.: el motor de babor no prende, la bomba de achique no trabaja…" />
      </Field>
      <Field label="Nombre del bote (si tiene)"><Input value={boat} onChange={(e) => setBoat(e.target.value)} /></Field>
      <Field label="Marca del bote o del motor">
        <Input value={make} onChange={(e) => setMake(e.target.value)} list="dir-makes" placeholder="Ej.: Yamaha 250, Boston Whaler" />
      </Field>
      <Suggestions id="dir-makes" values={BOAT_MAKES} />
      <Field label="¿Dónde está el bote?">
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej.: Puerto del Rey, muelle B-12" />
      </Field>

      <div role="group" aria-label="¿Cuándo te conviene?">
        <span className="mb-1 block text-base font-semibold text-slate-800">¿Cuándo te conviene?</span>
        <div className="grid grid-cols-3 gap-2">
          {WHEN_OPTIONS.map((o) => (
            <button key={o.value} type="button" onClick={() => setWhen(o.value)} aria-pressed={when === o.value}
              className={`min-h-14 rounded-xl border-2 px-2 text-base font-bold ${when === o.value ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-300 bg-white text-slate-800'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Campo escondido: una persona no lo ve ni lo llena */}
      <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />

      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-base font-semibold text-red-800">{error}</p>}

      <Button type="submit" disabled={saving} className="min-h-16 bg-sun-400 text-xl font-extrabold text-navy-900 active:bg-sun-500">
        {saving ? 'Enviando…' : 'Enviar solicitud'}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>Volver</Button>
    </form>
  )
}
