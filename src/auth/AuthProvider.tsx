import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, Role } from '../lib/types'

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  /** Modo demo: solo para ver las pantallas cuando todavía no hay Supabase. */
  demo: boolean
  refreshProfile: () => Promise<void>
  enterDemo: (role: Role) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [demo, setDemo] = useState(false)

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) console.error('No se pudo leer el perfil', error)
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        // Fuera del callback para no bloquear el cliente de Supabase
        setTimeout(() => loadProfile(newSession.user.id), 0)
      } else {
        setProfile(null)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const refreshProfile = useCallback(async () => {
    if (session) await loadProfile(session.user.id)
  }, [session, loadProfile])

  const enterDemo = useCallback((role: Role) => {
    setDemo(true)
    setProfile({
      id: 'demo',
      role,
      full_name: role === 'mechanic' ? 'Carlos Rivera' : 'Francisco (demo)',
      phone: '787-555-0123',
      email: 'demo@ejemplo.com',
      town: role === 'mechanic' ? 'Fajardo' : 'Ceiba',
    })
  }, [])

  const signOut = useCallback(async () => {
    if (demo) {
      setDemo(false)
      setProfile(null)
      return
    }
    await supabase?.auth.signOut()
  }, [demo])

  return (
    <AuthContext.Provider value={{ loading, session, profile, demo, refreshProfile, enterDemo, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
