import { useState, type FormEvent } from 'react'
import { Mail, Ship, Wrench } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { Button, Field, Input } from '../components/ui'

export default function Login() {
  const { enterDemo } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
    <div className="flex min-h-full flex-col bg-navy-800">
      <div className="safe-top px-6 pb-8 pt-12 text-center text-white">
        <img src="/logo.svg" alt="" className="mx-auto h-20 w-20 rounded-2xl" />
        <h1 className="mt-4 text-3xl font-extrabold">MarinaPro PR</h1>
        <p className="mt-1 text-lg text-navy-100">Tu bote y tu mecánico, en un solo sitio</p>
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
      </div>
    </div>
  )
}
