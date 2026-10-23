/** Guardería / marina: la lista de precios y cómo se calcula el precio de un bote. */
import { formatMoney } from './format'

export type Basis = 'per_foot' | 'flat' | 'bands'
export interface Band { max_ft: number; price: number; per_foot?: boolean }
export interface Rate { id: string; kind: 'space' | 'extra'; name: string; basis: Basis; price: number | null; bands: Band[] | null; unit: string; active: boolean; sort: number }

/** Precio de un espacio o cobro para un bote de ese largo. */
export function priceFor(r: Pick<Rate, 'basis' | 'price' | 'bands'>, ft: number | null): number {
  if (r.basis === 'per_foot') return Math.round(Number(r.price ?? 0) * Number(ft ?? 0) * 100) / 100
  if (r.basis === 'bands') {
    const bands = [...(r.bands ?? [])].sort((a, b) => a.max_ft - b.max_ft)
    const b = bands.find((x) => Number(ft ?? 0) <= x.max_ft)
    // Más grande que el último tamaño: no tiene precio (se cotiza aparte)
    if (!b) return 0
    return b.per_foot ? Math.round(Number(b.price) * Number(ft ?? 0) * 100) / 100 : Number(b.price)
  }
  return Number(r.price ?? 0)
}

export const basisText = (r: Rate) => r.basis === 'per_foot' ? `${formatMoney(Number(r.price ?? 0))} por pie / ${r.unit}`
  : r.basis === 'bands' ? `Por tamaño: ${(r.bands ?? []).map((b) => `hasta ${b.max_ft}' ${formatMoney(b.price)}${b.per_foot ? ' por pie' : ''}`).join(' · ')}`
  : `${formatMoney(Number(r.price ?? 0))} / ${r.unit}`
