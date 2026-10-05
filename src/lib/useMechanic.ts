import { useAuth } from '../auth/AuthProvider'
import { db } from './db'
import type { Mechanic } from './types'
import { must, useLoad } from './useLoad'

/** Datos del negocio del mecánico que está usando la app. */
export function useMechanic() {
  const { session } = useAuth()
  const uid = session?.user.id
  return useLoad(async () => must(await db().from('mechanics').select('*').eq('profile_id', uid!).single()) as Mechanic, [uid])
}
