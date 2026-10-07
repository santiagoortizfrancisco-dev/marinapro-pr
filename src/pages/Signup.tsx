import { useState, type FormEvent } from 'react'
import { Building2, Grid3x3, KeyRound, Mail, MapPin, Phone, User, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { PR_TOWNS } from '../lib/towns'
import { onlyPin, weakPin } from '../lib/pin'
import { Button, Choice, Field, Input, Select } from '../components/ui'

/**
 * El mecánico se registra solo desde el link. Su cuenta queda "por aprobar":
 * no puede usar el app hasta que el admin lo aprueba.
 * Los datos van en la cuenta (user_metadata) y al entrar por primera vez se completan solos.
 */
export default function Signup({ onBack, onWaitEmail }: { onBack: () => void; onWaitEmail: (email: string) => void }) {
  const [f, setF] = useState({ full_name: '', business_name: '', phone: '', town: '', email: '' })
  const [kind, setKind] = useState<'pin' | 'password'>('pin')
  const [secret, setSecret] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const isPin = kind === 'pin'
  const clean = (v: string) => (isPin ? onlyPin(v) : v)
  const numeric = isPin ? { inputMode: 'numeric' as const, pattern: '[0-9]*', className: 'text-center text-3xl tracking-[0.5em]' } : {}

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (f.full_name.trim().length < 2) return setError('Escribe tu nombre.')
    if (f.phone.replace(/\D/g, '').length < 7) return setError('Escribe tu teléfono.')
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setError('Escribe un email correcto.')
    if (isPin) {
      if (!/^\d{6}$/.test(secret)) return setError('El PIN tiene que ser de 6 números.')
      if (weakPin(secret)) return setError('Ese PIN es muy fácil de adivinar. Escoge otro.')
    } else if (secret.length < 8) return setError('La contraseña tiene que tener por lo menos 8 letras o números.')
    if (secret !== repeat) return setError(isPin ? 'Los dos PIN no son iguales.' : 'Las dos contraseñas no son iguales.')
    if (!supabase) return
    setBusy(true)
    const email = f.email.trim().toLowerCase()
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password: secret,
      options: {
        emailRedirectTo: window.location.origin,
        data: { signup: true, full_name: f.full_name.trim(), business_name: f.business_name.trim(), phone: f.phone.trim(), town: f.town },
      },
    })
    setBusy(false)
    if (err) {
      if (err.code === 'user_already_exists' || /already/i.test(err.message)) return setError('Ese email ya tiene cuenta. Vuelve atrás y entra con tu PIN o contraseña.')
      if (err.code === 'signup_disabled') return setError('El registro está cerrado por ahora. Escríbenos con “¿Problemas para entrar?”.')
      if (err.status === 429) return setError('Muchos intentos seguidos. Espera unos minutos.')
      return setError('No se pudo crear la cuenta. Revisa la señal e intenta otra vez.')
    }
    try {
      localStorage.setItem('entrar-con-pin', isPin ? '1' : '0')
    } catch {
      /* sin memoria del teléfono: no pasa nada */
    }
    // Sin confirmación por email entra enseguida (y el app completa sus datos); con confirmación, tiene que abrir el email
    if (!data.session) onWaitEmail(email)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="flex items-center gap-2 text-2xl font-bold text-navy-900"><UserPlus /> Crear mi cuenta</h2>
      <p className="text-base text-slate-600">Para mecánicos de bote. Cuando la apruebemos, te avisamos y ya puedes usar el app.</p>
      <Field label="Tu nombre completo *" icon={User}>
        <Input autoComplete="name" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} />
      </Field>
      <Field label="Nombre de tu compañía" icon={Building2} tone="teal" hint="Sale arriba en el app y en tus facturas">
        <Input value={f.business_name} onChange={(e) => set('business_name', e.target.value)} placeholder="Rivera Marine Service" />
      </Field>
      <Field label="Teléfono / WhatsApp *" icon={Phone} tone="green">
        <Input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="787-555-0123" />
      </Field>
      <Field label="Pueblo" icon={MapPin} tone="orange">
        <Select value={f.town} onChange={(e) => set('town', e.target.value)}>
          <option value="">Escoge tu pueblo</option>
          {PR_TOWNS.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Tu email *" icon={Mail} tone="blue">
        <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="nombre@gmail.com" />
      </Field>
      <Field label="¿Cómo quieres entrar?">
        <Choice
          value={kind}
          onChange={(v) => { setKind(v); setSecret(''); setRepeat(''); setError('') }}
          options={[
            { value: 'pin', label: 'PIN de 6 números', hint: 'Más rápido', icon: Grid3x3, tone: 'navy' },
            { value: 'password', label: 'Contraseña', hint: 'Más segura', icon: KeyRound, tone: 'slate' },
          ]}
        />
      </Field>
      <Field label={isPin ? 'Tu PIN' : 'Tu contraseña'}>
        <Input type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(clean(e.target.value))} {...numeric} />
      </Field>
      <Field label={isPin ? 'Repite el PIN' : 'Repite la contraseña'}>
        <Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(clean(e.target.value))} {...numeric} />
      </Field>
      {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-base font-semibold text-red-800">{error}</p>}
      <Button type="submit" disabled={busy}><UserPlus /> {busy ? 'Creando…' : 'Crear mi cuenta'}</Button>
      <Button type="button" variant="ghost" onClick={onBack}>Ya tengo cuenta: entrar</Button>
    </form>
  )
}
