import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * En modo demo no hay base de datos: cualquier consulta responde "sin datos"
 * para poder ver los formularios sin que la app se rompa.
 */
function demoClient(): SupabaseClient {
  const result = { data: null, error: { message: 'Modo demo: no hay base de datos' } }
  const chain: unknown = new Proxy(function () {}, {
    get: (_t, key) => (key === 'then' ? (resolve: (v: typeof result) => void) => resolve(result) : () => chain),
    apply: () => chain,
  })
  return chain as SupabaseClient
}

/** Cliente de Supabase (o uno vacío en modo demo). */
export function db(): SupabaseClient {
  return supabase ?? demoClient()
}
