import { db } from './db'
import type { Mechanic } from './types'

const inFlight = new Map<string, Promise<string>>()

/**
 * Cada cita tiene su trabajo (la cita y el trabajo son la misma visita).
 * Devuelve el trabajo de la cita, y si no tiene, lo crea con los datos del negocio.
 */
export function ensureWorkOrder(appointmentId: string, mechanicId: string): Promise<string> {
  // No crear dos trabajos si la pantalla lo pide dos veces seguidas
  const pending = inFlight.get(appointmentId)
  if (pending) return pending
  const p = (async () => {
    const { data: existing } = await db().from('work_orders').select('id').eq('appointment_id', appointmentId).order('created_at').limit(1)
    if (existing && existing.length > 0) return existing[0].id as string

    const [{ data: ap }, { data: m }] = await Promise.all([
      db().from('appointments').select('boat_id, title, service_requests(description)').eq('id', appointmentId).single(),
      db().from('mechanics').select('labor_rate_hour, ivu_on_labor, ivu_on_parts').eq('profile_id', mechanicId).single(),
    ])
    const a = ap as unknown as { boat_id: string; title: string | null; service_requests: { description: string } | null }
    const mech = m as Pick<Mechanic, 'labor_rate_hour' | 'ivu_on_labor' | 'ivu_on_parts'> | null
    const { data, error } = await db()
      .from('work_orders')
      .insert({
        boat_id: a.boat_id,
        appointment_id: appointmentId,
        complaint: a.service_requests?.description ?? a.title ?? null,
        labor_rate: mech?.labor_rate_hour ?? 0,
        charge_ivu_labor: mech?.ivu_on_labor ?? true,
        charge_ivu_parts: mech?.ivu_on_parts ?? true,
      })
      .select('id')
      .single()
    if (error) throw error
    return (data as { id: string }).id
  })()
  inFlight.set(appointmentId, p)
  p.finally(() => setTimeout(() => inFlight.delete(appointmentId), 5000))
  return p
}
