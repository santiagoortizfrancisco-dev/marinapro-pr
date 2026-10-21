import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { APP_LOGO, APP_NAME, type Trade } from '../lib/trade'
import TradePicker from '../components/TradePicker'
import { Button } from '../components/ui'

/**
 * Link de prueba (/demo): primero pregunta a qué se dedica, y entra enseguida, sin registro,
 * a un negocio de ejemplo de ese oficio (usuario anónimo con datos de mentira que se borran a los 7 días).
 */
export default function StartTrial() {
  const { session, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Ya tiene su cuenta de verdad abierta en este teléfono: no se toca, entra a lo suyo
  if (session && !session.user.is_anonymous) return <Navigate to="/inicio" replace />

  async function start(trade: Trade) {
    setBusy(true)
    setError('')
    try {
      if (!supabase) throw new Error('sin Supabase')
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }
      const { error } = await supabase.rpc('start_trial', { p_type: trade })
      if (error) throw error
      try { localStorage.setItem('tipo-de-negocio', trade) } catch { /* sin memoria: no pasa nada */ }
      // Dos veces por si el aviso de "entró" leyó el perfil antes de que el negocio estuviera listo
      await refreshProfile()
      await new Promise((r) => setTimeout(r, 400))
      await refreshProfile()
      navigate('/inicio', { replace: true })
    } catch (e) {
      console.error(e)
      setBusy(false)
      setError('No se pudo abrir la prueba ahora mismo. Intenta otra vez en un ratito.')
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 bg-navy-900 px-6 py-10 text-center text-white">
      <img src={APP_LOGO} alt="" className={`h-24 w-24 rounded-2xl ${busy ? 'animate-pulse' : ''}`} />
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-white/80">{APP_NAME}</p>
        <p className="mt-2 text-2xl font-extrabold">{busy ? 'Preparando tu negocio de prueba…' : 'Pruébalo gratis, sin registrarte'}</p>
        <p className="mt-2 text-base text-white/80">{busy ? 'Con clientes, citas y facturas de ejemplo para que veas cómo funciona.' : '¿A qué te dedicas?'}</p>
      </div>
      {!busy && (
        <div className="w-full max-w-sm">
          <TradePicker value={null} onChange={start} dark />
        </div>
      )}
      {error && (
        <div className="w-full max-w-xs space-y-3">
          <p className="rounded-xl bg-red-100 p-3 text-base font-semibold text-red-800">{error}</p>
          <Button variant="ghost" onClick={() => navigate('/', { replace: true })} className="text-white!">Ir a entrar</Button>
        </div>
      )}
    </div>
  )
}
