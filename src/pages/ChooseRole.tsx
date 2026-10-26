import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Wrench } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { PR_TOWNS } from '../lib/towns'
import { Button, Field, Input, Select } from '../components/ui'
import TradePicker from '../components/TradePicker'
import type { Trade } from '../lib/trade'

/** Primera vez que entra. Fase 1: todos son mecánicos (la app del cliente llega en la Fase 2). */
export default function ChooseRole() {
  const { refreshProfile, signOut, profile, session } = useAuth()
  const meta = (session?.user.user_metadata ?? {}) as { signup?: boolean; full_name?: string; business_name?: string; phone?: string; town?: string; business_type?: Trade }
  const [fullName, setFullName] = useState(meta.full_name ?? profile?.full_name ?? '')
  const [businessName, setBusinessName] = useState(meta.business_name ?? '')
  const [phone, setPhone] = useState(meta.phone ?? '')
  const [town, setTown] = useState(meta.town ?? '')
  const [trade, setTrade] = useState<Trade>(meta.business_type ?? 'general')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [askStart, setAskStart] = useState(false)

  // Se registró con "Crear mi cuenta": ya llenó todo, no se lo volvemos a pedir
  const auto = useRef(false)
  useEffect(() => {
    if (!meta.signup || !meta.full_name || auto.current) return
    auto.current = true
    save()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Una sola vez: si ya se está guardando (por ejemplo, solo al entrar), otro toque no hace nada
  const running = useRef(false)

  async function save(e?: FormEvent) {
    e?.preventDefault()
    if (!supabase || running.current) return
    running.current = true
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('set_my_role', {
      p_role: 'mechanic',
      p_full_name: fullName.trim(),
      p_phone: phone.trim() || null,
      p_town: town || null,
      p_business_name: businessName.trim() || null,
    })
    if (!error) {
      // A qué se dedica: cambia las palabras del app (bote, carro, equipo, propiedad…)
      await supabase.from('mechanics').update({ business_type: trade, business_type_set: true, use_estimates: trade !== 'beauty' && trade !== 'storage' }).eq('profile_id', session!.user.id)
      if (trade === 'beauty') await supabase.rpc('seed_beauty_services', { p_mech: session!.user.id })
      try { localStorage.setItem('tipo-de-negocio', trade) } catch { /* sin memoria: no pasa nada */ }
    }
    running.current = false
    setBusy(false)
    // Si ya quedó guardado antes (otro toque), no es un error: entra
    if (error && !/ya fue escogido/.test(error.message)) return setError('No se pudo guardar. Intenta otra vez.')
    // Antes de entrar: ¿empieza con lo suyo o con ejemplos? (la guardería empieza vacía; su Inicio la lleva paso a paso)
    if (!error && trade !== 'storage') return setAskStart(true)
    await refreshProfile()
  }

  async function start(withExamples: boolean) {
    setBusy(true)
    if (withExamples) await supabase?.rpc('load_examples')
    await refreshProfile()
  }

  // Último paso: empezar vacío (lo recomendado) o ver cómo funciona con ejemplos
  if (askStart) {
    return (
      <div className="safe-top safe-bottom mx-auto max-w-md px-6 py-10">
        <h1 className="text-3xl font-extrabold text-navy-900">¡Tu cuenta está lista!</h1>
        <p className="mt-2 text-lg text-slate-700">¿Cómo quieres empezar?</p>
        <div className="mt-6 space-y-3">
          <button type="button" disabled={busy} onClick={() => start(false)} className="w-full rounded-2xl bg-navy-800 p-5 text-left text-white shadow-lg active:scale-[0.99]">
            <span className="block text-xl font-extrabold">Empezar con lo mío</span>
            <span className="block text-base text-navy-100">Sin nada de ejemplo, lista para tus clientes de verdad.</span>
          </button>
          <button type="button" disabled={busy} onClick={() => start(true)} className="w-full rounded-2xl bg-white p-5 text-left text-navy-900 ring-2 ring-navy-200 active:scale-[0.99]">
            <span className="block text-xl font-extrabold">Ver cómo funciona con ejemplos</span>
            <span className="block text-base text-slate-600">Con clientes y cobros de ejemplo. Los borras con un botón cuando quieras.</span>
          </button>
        </div>
        {busy && <p className="mt-4 text-center text-base font-bold text-navy-900">Preparando…</p>}
      </div>
    )
  }

  // Se registró con todo lleno: mientras se guarda, no se enseña el formulario (para que no lo toquen dos veces)
  if (meta.signup && meta.full_name && busy) {
    return (
      <div className="safe-top flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy-100 border-t-navy-800" />
        <p className="text-lg font-bold text-navy-900">Preparando tu cuenta…</p>
      </div>
    )
  }

  return (
    <div className="safe-top safe-bottom mx-auto max-w-md px-6 py-8">
      <Wrench size={44} className="text-navy-800" />
      <h1 className="mt-3 text-2xl font-extrabold text-navy-900">¡Bienvenido a FacturaFácil PR!</h1>
      <p className="mt-1 text-base text-slate-600">Antes de empezar, el nombre de tu compañía. El logo lo subes después en Más → Mi negocio.</p>

      <form onSubmit={save} className="mt-6 space-y-4">
        <Field label="Tu nombre completo *">
          <Input required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Nombre de tu compañía" hint="Sale arriba en el app y en tus facturas">
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Rivera Service" />
        </Field>
        <Field label="Teléfono">
          <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="787-555-0123" />
        </Field>
        <Field label="¿A qué te dedicas?">
          <TradePicker value={trade} onChange={setTrade} />
        </Field>
        <Field label="Pueblo">
          <Select value={town} onChange={(e) => setTown(e.target.value)}>
            <option value="">Escoge tu pueblo</option>
            {PR_TOWNS.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Button type="submit" disabled={busy || !fullName.trim()}>{busy ? 'Guardando…' : 'Empezar'}</Button>
        {error && <p className="rounded-xl bg-red-100 p-4 text-base font-semibold text-red-800">{error}</p>}
        <Button type="button" variant="ghost" onClick={signOut}>Salir</Button>
      </form>
    </div>
  )
}
