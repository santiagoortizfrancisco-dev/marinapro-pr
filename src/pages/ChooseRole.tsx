import { useState, type FormEvent } from 'react'
import { Wrench } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { PR_TOWNS } from '../lib/towns'
import { Button, Field, Input, Select } from '../components/ui'

/** Primera vez que entra. Fase 1: todos son mecánicos (la app del cliente llega en la Fase 2). */
export default function ChooseRole() {
  const { refreshProfile, signOut, profile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [town, setTown] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('set_my_role', {
      p_role: 'mechanic',
      p_full_name: fullName.trim(),
      p_phone: phone.trim() || null,
      p_town: town || null,
      p_business_name: businessName.trim() || null,
    })
    setBusy(false)
    if (error) setError('No se pudo guardar. Intenta otra vez.')
    else await refreshProfile()
  }

  return (
    <div className="safe-top safe-bottom mx-auto max-w-md px-6 py-8">
      <Wrench size={44} className="text-navy-800" />
      <h1 className="mt-3 text-2xl font-extrabold text-navy-900">¡Bienvenido a Salt Boat!</h1>
      <p className="mt-1 text-base text-slate-600">Antes de empezar, el nombre de tu compañía. El logo lo subes después en Más → Mi negocio.</p>

      <form onSubmit={save} className="mt-6 space-y-4">
        <Field label="Tu nombre completo *">
          <Input required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Nombre de tu compañía" hint="Sale arriba en el app y en tus facturas">
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Rivera Marine Service" />
        </Field>
        <Field label="Teléfono">
          <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="787-555-0123" />
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
