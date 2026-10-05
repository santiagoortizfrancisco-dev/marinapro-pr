import { useState, type FormEvent } from 'react'
import { Ship, Wrench } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { PR_TOWNS } from '../lib/towns'
import type { Role } from '../lib/types'
import { Button, Field, Input, Select } from '../components/ui'

/** Primera vez que entra: escoge si es mecánico o dueño de bote. No se puede cambiar después. */
export default function ChooseRole() {
  const { refreshProfile, signOut, profile } = useAuth()
  const [role, setRole] = useState<Role | null>(null)
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState('')
  const [town, setTown] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !role) return
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('set_my_role', {
      p_role: role,
      p_full_name: fullName.trim(),
      p_phone: phone.trim() || null,
      p_town: town || null,
      p_business_name: role === 'mechanic' ? businessName.trim() || null : null,
    })
    setBusy(false)
    if (error) setError('No se pudo guardar. Intenta otra vez.')
    else await refreshProfile()
  }

  const choice = (r: Role, Icon: typeof Wrench, title: string, text: string) => (
    <button
      type="button"
      onClick={() => setRole(r)}
      className={`flex w-full items-center gap-4 rounded-2xl border-2 p-5 text-left ${
        role === r ? 'border-navy-800 bg-navy-50' : 'border-slate-300 bg-white'
      }`}
    >
      <Icon size={36} className="shrink-0 text-navy-800" />
      <span>
        <span className="block text-xl font-bold text-navy-900">{title}</span>
        <span className="block text-base text-slate-600">{text}</span>
      </span>
    </button>
  )

  return (
    <div className="safe-top safe-bottom mx-auto max-w-md px-6 py-8">
      <h1 className="text-2xl font-extrabold text-navy-900">¡Bienvenido!</h1>
      <p className="mt-1 text-base text-slate-600">¿Cómo vas a usar MarinaPro?</p>

      <form onSubmit={save} className="mt-6 space-y-4">
        {choice('mechanic', Wrench, 'Soy mecánico', 'Agenda, clientes, trabajos y facturas')}
        {choice('client', Ship, 'Tengo un bote', 'Reporta problemas, pide citas y ve el historial')}

        {role && (
          <div className="space-y-4 pt-2">
            <Field label="Nombre completo">
              <Input required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            {role === 'mechanic' && (
              <Field label="Nombre del negocio (opcional)">
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Rivera Marine Service" />
              </Field>
            )}
            <Field label="Teléfono">
              <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="787-555-0123" />
            </Field>
            <Field label="Pueblo">
              <Select value={town} onChange={(e) => setTown(e.target.value)}>
                <option value="">Escoge tu pueblo</option>
                {PR_TOWNS.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Button type="submit" disabled={busy || !fullName.trim()}>{busy ? 'Guardando…' : 'Continuar'}</Button>
          </div>
        )}

        {error && <p className="rounded-xl bg-red-100 p-4 text-base font-semibold text-red-800">{error}</p>}
        <Button type="button" variant="ghost" onClick={signOut}>Salir</Button>
      </form>
    </div>
  )
}
