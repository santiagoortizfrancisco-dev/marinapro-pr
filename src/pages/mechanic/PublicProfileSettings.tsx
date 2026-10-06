import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ExternalLink, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { db } from '../../lib/db'
import { LOCATION_TYPES, WORK_AREAS } from '../../lib/catalog'
import { DIRECTORY_BRANDS, slugify } from '../../lib/directory'
import { PR_TOWNS } from '../../lib/towns'
import { blank } from '../../lib/useLoad'
import { useMechanic } from '../../lib/useMechanic'
import { BackTitle, ErrorBox, Field, FormActions, Input, Loading, MultiChoice, Textarea, Toggle } from '../../components/ui'

/** Lo que sale de ti en el directorio público (nunca tus clientes, precios ni facturas). */
export default function PublicProfileSettings() {
  const navigate = useNavigate()
  const { profile, session } = useAuth()
  const { data: m, loading, error } = useMechanic()
  const [listed, setListed] = useState(false)
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [towns, setTowns] = useState<string[]>([])
  const [services, setServices] = useState<string[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!m) return
    setListed(Boolean(m.listed))
    setSlug(m.slug || slugify(m.business_name || profile?.full_name || ''))
    setDescription(m.public_description ?? '')
    setTowns(m.public_towns?.length ? m.public_towns : profile?.town ? [profile.town] : [])
    setServices(m.public_services ?? [])
    setBrands(m.public_brands ?? [])
    setLocations(m.public_locations ?? [])
  }, [m, profile])

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaveError('')
    const s = slugify(slug)
    if (listed && s.length < 3) return setSaveError('Escribe la dirección de tu página (mínimo 3 letras).')
    if (listed && towns.length === 0) return setSaveError('Escoge por lo menos un pueblo donde trabajas.')
    setBusy(true)
    const { error: err } = await db().from('mechanics').update({
      listed,
      slug: s || null,
      public_description: blank(description),
      public_towns: towns,
      public_services: services,
      public_brands: brands,
      public_locations: locations,
    }).eq('profile_id', session!.user.id)
    setBusy(false)
    if (err) {
      setSaveError(err.code === '23505' ? 'Esa dirección ya la tiene otro mecánico. Prueba con otra.' : 'No se pudo guardar. Intenta otra vez.')
      return
    }
    navigate('/mas')
  }

  if (loading) return <Loading />
  if (error || !m) return <ErrorBox message={error || 'No se encontraron los datos del negocio.'} />

  const s = slugify(slug)
  const status = !listed
    ? { text: 'No sales en el directorio.', style: 'bg-slate-100 text-slate-700' }
    : m.approved
      ? { text: '✓ Apareces en el directorio.', style: 'bg-emerald-100 text-emerald-900' }
      : { text: 'Esperando aprobación. Te avisamos cuando salgas.', style: 'bg-amber-100 text-amber-900' }

  return (
    <>
      <BackTitle to="/mas" subtitle="Los dueños de bote te encuentran y te piden cita">Mi perfil público</BackTitle>
      <form onSubmit={save} className="space-y-5">
        <p className={`rounded-xl p-3 text-base font-semibold ${status.style}`}>{status.text}</p>

        <Toggle checked={listed} onChange={setListed} label="Quiero salir en el directorio" hint="Solo se ve tu negocio, logo, teléfono y lo que marques aquí. Nunca tus clientes ni precios." />

        <Field label="Dirección de tu página" hint={s ? `marinapro-pr.onrender.com/mecanicos/${s}` : undefined}>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} onBlur={() => setSlug(slugify(slug))} autoCapitalize="none" />
        </Field>

        <Field label="Sobre tu negocio" hint="2 o 3 líneas: experiencia, qué te distingue, si vas a domicilio…">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={500} placeholder="Mecánico certificado Yamaha con 15 años de experiencia. Voy a la marina o a tu casa." />
        </Field>

        <Field label="Pueblos donde trabajas">
          <div className="mb-2 flex flex-wrap gap-2">
            {towns.map((t) => (
              <button key={t} type="button" onClick={() => setTowns(towns.filter((x) => x !== t))} aria-label={`Quitar ${t}`}
                className="flex min-h-12 items-center gap-1 rounded-full border-2 border-navy-800 bg-navy-800 px-4 text-base font-semibold text-white">
                {t} <X size={16} />
              </button>
            ))}
          </div>
          <select aria-label="Añadir pueblo" value="" onChange={(e) => e.target.value && setTowns([...towns, e.target.value])}
            className="block min-h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-lg">
            <option value="">+ Añadir pueblo</option>
            {PR_TOWNS.filter((t) => !towns.includes(t)).map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="Servicios que das">
          <MultiChoice value={services} onChange={setServices} options={WORK_AREAS} />
        </Field>

        <Field label="Marcas que trabajas">
          <MultiChoice value={brands} onChange={setBrands} options={DIRECTORY_BRANDS.map((b) => ({ value: b, label: b }))} />
        </Field>

        <Field label="Dónde trabajas el bote">
          <MultiChoice value={locations} onChange={setLocations} options={LOCATION_TYPES} />
        </Field>

        {s && (
          <a href={`/mecanicos/${s}`} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-navy-800 text-base font-bold text-navy-800">
            <ExternalLink size={20} /> Ver cómo se ve mi página
          </a>
        )}
        <p className="text-sm text-slate-500">Para ver los cambios en tu página, primero dale Guardar.</p>

        <FormActions busy={busy} error={saveError} onCancel={() => navigate('/mas')} />
      </form>
    </>
  )
}
