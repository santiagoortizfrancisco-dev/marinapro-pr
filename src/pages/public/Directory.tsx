import { Fragment, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Anchor, MapPin, Search, Wrench } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logoUrl } from '../../lib/brand'
import { WORK_AREAS, labelOf } from '../../lib/catalog'
import { DIRECTORY_BRANDS, type PublicMechanic } from '../../lib/directory'
import { PR_TOWNS } from '../../lib/towns'
import AdBanner from '../../components/AdBanner'
import { Loading } from '../../components/ui'
import PublicShell from './PublicShell'

const SELECT = 'block min-h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-lg focus:border-navy-600 focus:outline-none'

/** Directorio público: el dueño de bote busca un mecánico por pueblo, servicio y marca. No necesita cuenta. */
export default function Directory() {
  const [params, setParams] = useSearchParams()
  const town = params.get('pueblo') ?? ''
  const service = params.get('servicio') ?? ''
  const brand = params.get('marca') ?? ''
  const [open, setOpen] = useState<boolean | null>(null)
  const [results, setResults] = useState<PublicMechanic[] | null>(null)

  useEffect(() => {
    document.title = 'Mecánicos de bote en Puerto Rico · Salt Boat Repair'
    supabase?.rpc('directory_is_open').then(({ data }) => setOpen(data === true))
  }, [])

  useEffect(() => {
    if (!supabase) return
    setResults(null)
    supabase
      .rpc('directory_search', { p_town: town || null, p_service: service || null, p_brand: brand || null })
      .then(({ data }) => setResults((data ?? []) as PublicMechanic[]))
  }, [town, service, brand])

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  // Primero saber si está abierto (sin enseñar el buscador y después quitarlo)
  if (open === null || (results === null && !town && !service && !brand)) return <PublicShell><Loading /></PublicShell>

  // Cerrado y sin resultados (solo el admin ve resultados con el directorio cerrado)
  if (open === false && results !== null && results.length === 0 && !town && !service && !brand) {
    return (
      <PublicShell>
        <section className="py-16 text-center">
          <Anchor size={48} className="mx-auto text-navy-700" />
          <h1 className="mt-4 text-3xl font-extrabold text-navy-900">Muy pronto</h1>
          <p className="mx-auto mt-2 max-w-md text-lg text-slate-600">Estamos preparando el directorio de mecánicos de bote de Puerto Rico. ¡Vuelve pronto!</p>
        </section>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <section className="-mx-4 bg-navy-800 px-4 pb-8 pt-6 text-white">
        <h1 className="text-3xl font-extrabold leading-tight">Encuentra un mecánico de bote en Puerto Rico</h1>
        <p className="mt-2 text-lg text-navy-100">Motores, electrónica, electricidad y más. Pide tu cita directo con el mecánico.</p>
      </section>

      {open === false && (
        <p className="mt-4 rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-900">Vista de administrador: el directorio está cerrado al público.</p>
      )}

      {/* Buscador */}
      <section className="-mt-4 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200" aria-label="Buscar mecánico">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-sm font-bold text-slate-700"><MapPin size={16} /> ¿Dónde está tu bote?</span>
            <select className={SELECT} value={town} onChange={(e) => set('pueblo', e.target.value)}>
              <option value="">Cualquier pueblo</option>
              {PR_TOWNS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-sm font-bold text-slate-700"><Wrench size={16} /> ¿Qué necesitas?</span>
            <select className={SELECT} value={service} onChange={(e) => set('servicio', e.target.value)}>
              <option value="">Cualquier servicio</option>
              {WORK_AREAS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-sm font-bold text-slate-700"><Search size={16} /> Marca del motor</span>
            <select className={SELECT} value={brand} onChange={(e) => set('marca', e.target.value)}>
              <option value="">Cualquier marca</option>
              {DIRECTORY_BRANDS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
        </div>
      </section>

      {/* Resultados */}
      <section className="mt-6" aria-live="polite">
        {results === null && <Loading />}
        {results && (
          <h2 className="mb-3 text-lg font-extrabold text-navy-900">
            {results.length === 0 ? 'No encontramos mecánicos con esa búsqueda' : `${results.length} ${results.length === 1 ? 'mecánico' : 'mecánicos'}`}
          </h2>
        )}
        {results && results.length === 0 && (town || service || brand) && (
          <p className="text-base text-slate-600">Prueba con menos filtros, por ejemplo solo el pueblo.</p>
        )}
        <div className="space-y-3">
          {results?.map((m, i) => (
            <Fragment key={m.slug}>
              <MechanicCard m={m} />
              {i === 1 && <AdBanner index={0} />}
            </Fragment>
          ))}
        </div>
        {results && results.length < 2 && <AdBanner index={0} />}
      </section>
    </PublicShell>
  )
}

function MechanicCard({ m }: { m: PublicMechanic }) {
  const logo = logoUrl(m.logo_path) ?? '/logo.svg'
  return (
    <Link to={`/mecanicos/${m.slug}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition active:scale-[0.99]">
      <div className="flex items-center gap-4">
        <img src={logo} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-black object-contain" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-extrabold text-navy-900">{m.name}</div>
          <div className="flex items-center gap-1 truncate text-sm text-slate-600"><MapPin size={14} className="shrink-0" /> {m.towns.slice(0, 4).join(', ') || m.town}{m.towns.length > 4 ? ` y ${m.towns.length - 4} más` : ''}</div>
        </div>
      </div>
      {m.description && <p className="mt-3 line-clamp-2 text-base text-slate-700">{m.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1">
        {m.services.slice(0, 4).map((s) => <span key={s} className="rounded-full bg-navy-50 px-3 py-1 text-xs font-bold text-navy-800">{labelOf(WORK_AREAS, s)}</span>)}
        {m.brands.slice(0, 3).map((b) => <span key={b} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{b}</span>)}
      </div>
      <div className="mt-3 text-right text-base font-bold text-navy-700">Ver y pedir cita →</div>
    </Link>
  )
}
