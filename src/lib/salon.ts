import { db } from './db'

/** Una empleada del salón (no entra al app: el negocio maneja su agenda). */
export interface Staff {
  id: string
  mechanic_id: string
  name: string
  phone: string | null
  color: string
  commission_rate: number
  active: boolean
}

/** Un servicio del menú (con su duración y precio). */
export interface SalonService {
  id: string
  name: string
  category: string | null
  last_price: number | null
  duration_min: number | null
  /** Cuántas veces se ha cobrado (los más pedidos salen primero) */
  use_count?: number | null
}

/** Colores para distinguir a cada empleada en la agenda. */
export const STAFF_COLORS = ['#db2777', '#7c3aed', '#2563eb', '#0d9488', '#ea580c', '#65a30d', '#0f172a']

export async function loadStaff(): Promise<Staff[]> {
  const { data } = await db().from('staff').select('*').eq('active', true).order('name')
  return (data ?? []) as Staff[]
}

/** El menú del salón (uñas primero). Si todavía no tiene, se le carga uno de ejemplo. */
export async function loadSalonMenu(mechanicId: string): Promise<SalonService[]> {
  const read = () => db().from('catalog_items').select('id, name, category, last_price, duration_min, use_count').eq('mechanic_id', mechanicId).eq('kind', 'service')
  let { data } = await read()
  if (!data || data.length === 0) {
    await db().rpc('seed_beauty_services', { p_mech: mechanicId })
    data = (await read()).data
  }
  const order = ['Uñas', 'Pelo', 'Spa']
  return ((data ?? []) as SalonService[]).sort((a, b) => {
    const ca = order.indexOf(a.category ?? ''), cb = order.indexOf(b.category ?? '')
    return (ca < 0 ? 9 : ca) - (cb < 0 ? 9 : cb) || a.name.localeCompare(b.name)
  })
}

/**
 * En el salón la clienta es la persona: el app le guarda por dentro un "registro" con su nombre
 * (la base de datos pide uno para las citas), sin que nadie lo vea.
 */
export async function clientRecordId(clientId: string, name: string): Promise<string> {
  const { data } = await db().from('boats').select('id').eq('client_id', clientId).order('created_at').limit(1)
  if (data && data.length) return data[0].id as string
  const r = await db().from('boats').insert({ client_id: clientId, name, location_type: 'home' }).select('id').single()
  if (r.error) throw r.error
  return (r.data as { id: string }).id
}

/** "1 h 30 min" */
export function minutesLabel(m: number) {
  const h = Math.floor(m / 60), r = m % 60
  return [h ? `${h} h` : '', r ? `${r} min` : ''].filter(Boolean).join(' ') || '0 min'
}
