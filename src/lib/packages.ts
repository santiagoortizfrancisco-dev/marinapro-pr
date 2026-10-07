import { db } from './db'
import type { Part } from './types'

/**
 * Paquetes de un toque: escondidos por ahora (Francisco, 2026-10-07: "muy complicado, no lo van a usar").
 * La tabla y el código se quedan; para volver a enseñarlos, cambiar a true.
 */
export const PACKAGES_ENABLED = false

/** Una línea de un paquete. price null = usar el último precio de "Mis piezas y servicios". */
export interface PackageItem {
  kind: 'service' | 'part'
  name: string
  qty: number
  price: number | null
}

/** Paquete de un toque. mechanic_id null = paquete de ejemplo de Salt Boat. */
export interface ServicePackage {
  id: string
  mechanic_id: string | null
  name: string
  items: PackageItem[]
  use_count: number
}

const key = (kind: string, name: string) => `${kind}|${name.trim().toLowerCase()}`

/** Precio de cada línea: el del paquete; si no tiene, el último que cobró el mecánico; si no, $0. */
export async function packagePrices(items: PackageItem[]): Promise<number[]> {
  const { data } = await db().from('catalog_items').select('kind, name, last_price, mechanic_id')
  const mine = new Map<string, number>()
  for (const c of (data ?? []) as { kind: string; name: string; last_price: number | null; mechanic_id: string | null }[]) {
    if (c.mechanic_id && c.last_price != null) mine.set(key(c.kind, c.name), Number(c.last_price))
  }
  return items.map((i) => (i.price != null ? Number(i.price) : mine.get(key(i.kind, i.name)) ?? 0))
}

/** Añade todas las líneas del paquete al trabajo (después se pueden cambiar o quitar una por una). */
export async function addPackageToJob(pkg: ServicePackage, workOrderId: string): Promise<void> {
  const prices = await packagePrices(pkg.items)
  const now = new Date().toISOString()
  const rows = pkg.items.map((i, n) => ({
    work_order_id: workOrderId,
    kind: i.kind,
    description: i.name,
    qty: Number(i.qty) || 1,
    unit_cost: prices[n],
    supplied_by: 'mechanic',
    // Lo de un paquete normalmente lo lleva el mecánico en el carro: ya lo tiene
    received_at: i.kind === 'part' ? now : null,
  }))
  const { error } = await db().from('work_order_parts').insert(rows)
  if (error) throw error
  if (pkg.mechanic_id) await db().from('service_packages').update({ use_count: pkg.use_count + 1 }).eq('id', pkg.id)
}

/** Las líneas del trabajo como paquete (las piezas que compró el cliente no van: no se cobran). */
export function itemsFromJob(parts: Part[]): PackageItem[] {
  return parts
    .filter((p) => p.kind === 'service' || p.supplied_by === 'mechanic')
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'service' ? -1 : 1))
    .map((p) => ({ kind: p.kind, name: p.description, qty: Number(p.qty), price: Number(p.unit_cost) }))
}
