import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, LogIn, Mail, Ship, Wrench, UserPlus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { Button, Field, Input } from '../components/ui'
import ContactSheet from '../components/ContactSheet'
import Signup from './Signup'

/**
 * Usuario sin @ -> email interno (alias del Gmail del app). Ej.: "jqr" -> marinepropr+jqr@gmail.com
 * Las cuentas con usuario se crean en Supabase > Authentication > Users > Add user.
 */
export function userToEmail(user: string): string {
  const u = user.trim().toLowerCase()
  return u.includes('@') ? u : `marinepropr+${u.replace(/[^a-z0-9._-]/g, '')}@gmail.com`
}

export default function Login() {
  const { enterDemo } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'password' | 'email' | 'code' | 'signup' | 'wait'>('password')
  const [waitEmail, setWaitEmail] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [contactOpen, setContactOpen] = useState(false)
  // PIN de 6 números: teclado de números grande. El teléfono recuerda si este mecánico usa PIN.
  const [usePin, setUsePin] = useState(() => {
    try {
      return localStorage.getItem('entrar-con-pin') === '1'
    } catch {
      return false
    }
  })
  function changePin(v: boolean) {
    setUsePin(v)
    setPassword('')
    setError('')
    try {
      localStorage.setItem('entrar-con-pin', v ? '1' : '0')
    } catch {
      /* sin memoria del teléfono: no pasa nada */
    }
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: userToEmail(user), password })
    setBusy(false)
    if (!error) return
    if (error.status === 429) setError('Muchos intentos seguidos. Espera unos minutos.')
    else if (error.status === 400 || error.code === 'invalid_credentials') setError(usePin ? 'Usuario o PIN incorrectos.' : 'Usuario o contraseña incorrectos.')
    else setError('No se pudo entrar. Revisa la señal e intenta otra vez.')
  }

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (!error) setStep('code')
    else if (error.status === 429 || error.code?.includes('rate_limit'))
      setError('Se enviaron muchos emails seguidos. Espera unos minutos y vuelve a intentar.')
    else if (error.code === 'email_address_invalid' || error.code === 'validation_failed')
      setError('Ese email no parece correcto. Revísalo e intenta otra vez.')
    else setError('No se pudo enviar el email. Intenta otra vez en unos minutos.')
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError('El código no es correcto o ya venció. Pide uno nuevo.')
  }

  return (
    <div className="flex min-h-full flex-col bg-navy-900">
      <div className="safe-top px-6 pb-8 pt-12 text-center text-white">
        <img src="/logo.svg" alt="" className="mx-auto h-20 w-20 rounded-2xl" />
        <h1 className="mt-4 text-[1.7rem] font-extrabold leading-tight">Salt Boat Repair</h1>
        <p className="text-xs text-white/60">Powered by Francisco Santiago (Joy)</p>
        <p className="mt-1 text-lg text-navy-100">Para mecánicos marinos: botes y jet skis</p>
      </div>

      <div className="safe-bottom flex-1 rounded-t-3xl bg-white px-6 py-8">
        <div className="mx-auto max-w-md space-y-5">
          {!isSupabaseConfigured && (
            <>
              <div className="rounded-xl bg-sun-400/30 p-4 text-base text-slate-900">
                Todavía no está conectada a Supabase. Puedes ver cómo va a quedar en <b>modo demo</b>:
              </div>
              <Button onClick={() => enterDemo('mechanic')}>
                <Wrench /> Ver como mecánico
              </Button>
              <Button variant="secondary" onClick={() => enterDemo('client')}>
                <Ship /> Ver como dueño de bote
              </Button>
            </>
          )}

          {isSupabaseConfigured && step === 'password' && (
            <form onSubmit={signInWithPassword} className="space-y-5">
              <h2 className="text-2xl font-bold text-navy-900">Entrar</h2>
              <Field label="Email o usuario">
                <Input required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} placeholder="nombre@gmail.com" />
              </Field>
              <Field label={usePin ? 'PIN (6 números)' : 'Contraseña'}>
                <div className="relative">
                  <Input
                    required
                    aria-label={usePin ? 'PIN' : 'Contraseña'}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(usePin ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
                    inputMode={usePin ? 'numeric' : undefined}
                    pattern={usePin ? '[0-9]*' : undefined}
                    className={`pr-14 ${usePin ? 'text-center text-3xl tracking-[0.5em]' : ''}`}
                  />
                  <button type="button" aria-label={showPassword ? 'Esconder contraseña' : 'Ver contraseña'} onClick={() => setShowPassword((v) => !v)} className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-slate-500">
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </Field>
              <Button type="submit" disabled={busy}>
                <LogIn /> {busy ? 'Entrando…' : 'Entrar'}
              </Button>
              <button type="button" onClick={() => changePin(!usePin)} className="mx-auto block text-base font-bold text-navy-700 underline underline-offset-4">
                {usePin ? 'Entrar con contraseña' : 'Entrar con PIN'}
              </button>
              <p className="text-center text-sm text-slate-500">¿Se te olvidó? Toca “¿Problemas para entrar?” abajo.</p>
              <Button type="button" variant="ghost" onClick={() => { setStep('email'); setError('') }}>
                Entrar con código por email
              </Button>
              <div className="border-t border-slate-200 pt-5">
                <Button type="button" variant="secondary" onClick={() => { setStep('signup'); setError('') }}>
                  <UserPlus /> ¿Eres mecánico? Crea tu cuenta
                </Button>
              </div>
            </form>
          )}

          {isSupabaseConfigured && step === 'signup' && (
            <Signup onBack={() => setStep('password')} onWaitEmail={(e) => { setWaitEmail(e); setStep('wait') }} />
          )}

          {isSupabaseConfigured && step === 'wait' && (
            <div className="space-y-4 text-center">
              <Mail size={48} className="mx-auto text-navy-700" />
              <h2 className="text-2xl font-bold text-navy-900">Revisa tu email</h2>
              <p className="text-base text-slate-600">Te enviamos un enlace a <b>{waitEmail}</b>. Ábrelo para confirmar tu cuenta. Si no lo ves, busca en “Spam” o “Promociones”.</p>
              <Button type="button" variant="ghost" onClick={() => setStep('password')}>Volver a entrar</Button>
            </div>
          )}

          {isSupabaseConfigured && step === 'email' && (
            <form onSubmit={sendLink} className="space-y-5">
              <h2 className="text-2xl font-bold text-navy-900">Entrar</h2>
              <p className="text-base text-slate-600">Escribe tu email y te enviamos un código para entrar. No necesitas contraseña.</p>
              <Field label="Email">
                <Input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@gmail.com" />
              </Field>
              <Button type="submit" disabled={busy}>
                <Mail /> {busy ? 'Enviando…' : 'Enviarme el código'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setStep('password'); setError('') }}>
                Entrar con usuario y contraseña
              </Button>
            </form>
          )}

          {isSupabaseConfigured && step === 'code' && (
            <form onSubmit={verifyCode} className="space-y-5">
              <h2 className="text-2xl font-bold text-navy-900">Revisa tu email</h2>
              <p className="text-base text-slate-600">
                Te enviamos un código a <b>{email}</b>. Escríbelo aquí. (También puedes tocar el link del email.)
              </p>
              <Field label="Código">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6,10}"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-[0.4em]"
                  placeholder="123456"
                />
              </Field>
              <Button type="submit" disabled={busy}>{busy ? 'Verificando…' : 'Entrar'}</Button>
              <Button type="button" variant="ghost" onClick={() => { setStep('email'); setCode('') }}>
                Usar otro email o pedir otro código
              </Button>
            </form>
          )}

          {error && <p className="rounded-xl bg-red-100 p-4 text-base font-semibold text-red-800">{error}</p>}
        </div>
        <button type="button" onClick={() => setContactOpen(true)} className="mx-auto mt-6 block text-base font-semibold text-slate-600 underline underline-offset-4">
          ¿Problemas para entrar? Escríbenos
        </button>
        <ContactSheet open={contactOpen} onClose={() => setContactOpen(false)} needsContact />
      </div>
    </div>
  )
}
