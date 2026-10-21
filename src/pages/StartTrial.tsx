import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui'

/**
 * Link de prueba (/demo): entra enseguida, sin registro, a un taller de ejemplo propio
 * (usuario anónimo de Supabase con datos de mentira que se borran a los 7 días).
 */
export default function StartTrial() {
  const { session, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        if (!supabase) throw new Error('sin Supabase')
        // Ya tiene su cuenta de verdad abierta en este teléfono: no se toca, entra a lo suyo
        if (session && !session.user.is_anonymous) {
          navigate('/inicio', { replace: true })
          return
        }
        if (!session) {
          const { error } = await supabase.auth.signInAnonymously()
          if (error) throw error
        }
        const { error } = await supabase.rpc('start_trial')
        if (error) throw error
        // Dos veces por si el aviso de "entró" leyó el perfil antes de que el taller estuviera listo
        await refreshProfile()
        await new Promise((r) => setTimeout(r, 400))
        await refreshProfile()
        navigate('/inicio', { replace: true })
      } catch (e) {
        console.error(e)
        setError('No se pudo abrir la prueba ahora mismo. Intenta otra vez en un ratito.')
      }
    })()
  }, [session, refreshProfile, navigate])

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 bg-navy-900 px-6 text-center text-white">
      <img src="/logo.svg" alt="" className={`h-24 w-24 ${error ? '' : 'animate-pulse'}`} />
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-white/80">Salt Marine Repair</p>
        <p className="mt-2 text-2xl font-extrabold">{error ? 'Ups' : 'Preparando tu taller de prueba…'}</p>
        <p className="mt-2 text-base text-white/80">{error || 'Con clientes, botes y facturas de ejemplo para que veas cómo funciona.'}</p>
      </div>
      {error && (
        <div className="w-full max-w-xs space-y-3">
          <Button onClick={() => window.location.reload()}>Intentar otra vez</Button>
          <Button variant="ghost" onClick={() => navigate('/', { replace: true })} className="text-white!">Ir a entrar</Button>
        </div>
      )}
    </div>
  )
}
