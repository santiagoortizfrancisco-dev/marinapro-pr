import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { CheckCircle2, Grid3x3, KeyRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { BackTitle, Button, Choice, Field, Input } from '../../components/ui'
import { weakPin } from '../../lib/pin'

/** Cada mecánico cambia su contraseña o pone un PIN de 6 números para entrar. */
export default function PasswordSettings() {
  const navigate = useNavigate()
  const [kind, setKind] = useState<'pin' | 'password'>('pin')
  const [value, setValue] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const isPin = kind === 'pin'

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (isPin) {
      if (!/^\d{6}$/.test(value)) return setError('El PIN tiene que ser de 6 números.')
      if (weakPin(value)) return setError('Ese PIN es muy fácil de adivinar. Escoge otro (no 123456 ni 111111).')
    } else if (value.length < 8) {
      return setError('La contraseña tiene que tener por lo menos 8 letras o números.')
    }
    if (value !== repeat) return setError(isPin ? 'Los dos PIN no son iguales.' : 'Las dos contraseñas no son iguales.')
    if (!supabase) return
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password: value })
    setBusy(false)
    if (err) {
      if (err.code === 'same_password') return setError('Es igual a la que ya tienes. Escoge otra.')
      if (err.code === 'reauthentication_needed') return setError('Por seguridad, sal del app, vuelve a entrar y cámbiala enseguida.')
      return setError('No se pudo cambiar. Revisa la señal e intenta otra vez.')
    }
    try {
      localStorage.setItem('entrar-con-pin', isPin ? '1' : '0')
    } catch {
      /* sin memoria del teléfono: no pasa nada */
    }
    setDone(true)
  }

  if (done) {
    return (
      <>
        <BackTitle to="/mas">Mi contraseña o PIN</BackTitle>
        <div className="space-y-4 rounded-3xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-200">
          <CheckCircle2 size={56} className="mx-auto text-emerald-600" />
          <p className="text-xl font-extrabold text-emerald-900">¡Listo! {isPin ? 'Tu PIN quedó guardado.' : 'Tu contraseña quedó guardada.'}</p>
          <p className="text-base text-emerald-900">La próxima vez que entres, usa tu {isPin ? 'PIN' : 'contraseña nueva'}. {isPin && 'En la pantalla de entrar toca “Entrar con PIN”.'}</p>
          <Button onClick={() => navigate('/mas')}>Volver</Button>
        </div>
      </>
    )
  }

  const numeric = isPin ? { inputMode: 'numeric' as const, pattern: '[0-9]*', className: 'text-center text-3xl tracking-[0.5em]' } : {}
  const clean = (v: string) => (isPin ? v.replace(/\D/g, '').slice(0, 6) : v)

  return (
    <>
      <BackTitle to="/mas" subtitle="Lo que pones para entrar al app">Mi contraseña o PIN</BackTitle>
      <form onSubmit={save} className="space-y-5">
        <Field label="¿Cómo quieres entrar?">
          <Choice
            value={kind}
            onChange={(v) => { setKind(v); setValue(''); setRepeat(''); setError('') }}
            options={[
              { value: 'pin', label: 'PIN de 6 números', hint: 'Más rápido', icon: Grid3x3, tone: 'navy' },
              { value: 'password', label: 'Contraseña', hint: 'Más segura', icon: KeyRound, tone: 'slate' },
            ]}
          />
        </Field>
        <Field label={isPin ? 'PIN nuevo' : 'Contraseña nueva'}>
          <Input type="password" autoComplete="new-password" value={value} onChange={(e) => setValue(clean(e.target.value))} {...numeric} />
        </Field>
        <Field label={isPin ? 'Repite el PIN' : 'Repite la contraseña'}>
          <Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(clean(e.target.value))} {...numeric} />
        </Field>
        {isPin && <p className="text-sm text-slate-500">No uses 123456, 111111 ni tu fecha de cumpleaños.</p>}
        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-base font-semibold text-red-800">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : isPin ? 'Guardar PIN' : 'Guardar contraseña'}</Button>
        <Button type="button" variant="ghost" onClick={() => navigate('/mas')}>Cancelar</Button>
      </form>
    </>
  )
}
