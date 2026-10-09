import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Lock, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { onlyPin } from '../lib/pin'
import { Button, Input } from './ui'

const KEY_MIN = 'bloqueo-minutos'
const KEY_LAST = 'ultima-actividad'
export const LOCK_OPTIONS = [
  { value: 0, label: 'Apagado' },
  { value: 5, label: '5 minutos' },
  { value: 15, label: '15 minutos' },
  { value: 60, label: '1 hora' },
] as const

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin memoria del teléfono: no pasa nada */
  }
}

/** Minutos sin tocar el app antes de pedir el PIN (por defecto apagado: cada mecánico lo prende en Más → Mi contraseña o PIN). */
export function lockMinutes(): number {
  const v = read(KEY_MIN)
  return v === null ? 0 : Number(v) || 0
}
export function setLockMinutes(m: number) {
  write(KEY_MIN, String(m))
}

const touch = () => write(KEY_LAST, String(Date.now()))
const idleTooLong = () => {
  const m = lockMinutes()
  const last = Number(read(KEY_LAST) ?? 0)
  return m > 0 && last > 0 && Date.now() - last > m * 60_000
}

/**
 * Bloqueo con PIN: si el app estuvo sin tocar (o cerrada) más del tiempo escogido, pide el PIN
 * antes de enseñar clientes y facturas. Mientras se usa, no bloquea.
 */
export default function AppLock({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth()
  const [locked, setLocked] = useState(idleTooLong)
  const [pin, setPin] = useState('')
  // Lo mismo que usa para entrar: PIN (teclado de números) o contraseña
  const [usePin, setUsePin] = useState(() => read('entrar-con-pin') === '1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const check = useCallback(() => {
    if (idleTooLong()) setLocked(true)
  }, [])

  useEffect(() => {
    if (!locked) touch()
    const onActivity = () => { if (!idleTooLong()) touch() }
    const onVisible = () => (document.visibilityState === 'visible' ? check() : undefined)
    const events = ['pointerdown', 'keydown', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(check, 30_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [check, locked])

  async function unlock(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !session?.user.email) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email: session.user.email, password: pin })
    setBusy(false)
    if (err) {
      setPin('')
      return setError(err.status === 429 ? 'Muchos intentos seguidos. Espera unos minutos.' : usePin ? 'PIN incorrecto.' : 'Contraseña incorrecta.')
    }
    touch()
    setPin('')
    setLocked(false)
  }

  if (!locked || !session) return <>{children}</>

  return (
    <div className="flex min-h-full flex-col bg-navy-900">
      <div className="safe-top px-6 pb-8 pt-12 text-center text-white">
        <img src="/logo.svg" alt="" className="mx-auto h-20 w-20 rounded-2xl" />
        <h1 className="mt-4 text-[1.7rem] font-extrabold leading-tight">Salt Marine Repair</h1>
        <p className="text-xs text-white/60">Powered by Francisco Santiago (Joy)</p>
      </div>
      <div className="safe-bottom flex-1 rounded-t-3xl bg-white px-6 py-8">
        <form onSubmit={unlock} className="mx-auto max-w-md space-y-5">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-navy-900"><Lock /> El app está bloqueada</h2>
          <p className="text-base text-slate-600">Para proteger tus clientes y facturas, escribe tu {usePin ? 'PIN' : 'contraseña'}.</p>
          <Input
            aria-label={usePin ? 'PIN' : 'Contraseña'}
            type="password"
            autoComplete="current-password"
            autoFocus
            value={pin}
            onChange={(e) => setPin(usePin ? onlyPin(e.target.value) : e.target.value)}
            inputMode={usePin ? 'numeric' : undefined}
            pattern={usePin ? '[0-9]*' : undefined}
            className={usePin ? 'text-center text-3xl tracking-[0.5em]' : ''}
          />
          {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-base font-semibold text-red-800">{error}</p>}
          <Button type="submit" disabled={busy || !pin}>{busy ? 'Revisando…' : 'Desbloquear'}</Button>
          <button type="button" onClick={() => { setUsePin(!usePin); setPin(''); setError('') }} className="mx-auto block text-base font-bold text-navy-700 underline underline-offset-4">
            {usePin ? 'Usar contraseña' : 'Usar PIN'}
          </button>
          <Button type="button" variant="ghost" onClick={signOut}><LogOut size={20} /> ¿Se te olvidó? Salir y entrar de nuevo</Button>
        </form>
      </div>
    </div>
  )
}
