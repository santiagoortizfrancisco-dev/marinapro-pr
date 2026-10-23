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

export interface StorageBoat { id: string; name: string; length_ft: number | null; clients: { full_name: string; phone: string | null } | null }
export interface Contract {
  id: string; boat_id: string; rate_id: string | null; space_label: string | null; monthly_price: number
  start_date: string; end_date: string | null; insurance_expires: string | null; status: 'active' | 'ended'; notes: string | null
  /** Su espacio (cuadro); si salió al agua, away_since y el muelle donde está mientras tanto */
  spot_id: string | null; away_since: string | null; away_spot_id: string | null
  boats: StorageBoat | null
}
export interface Zone { id: string; name: string; kind: 'land' | 'water'; sort: number }
export interface Spot { id: string; zone_id: string; label: string; status: 'ok' | 'reserved' | 'out_of_service'; note: string | null; sort: number }

export type SpotState = 'free' | 'occupied' | 'away' | 'temp' | 'reserved' | 'out'
/** Cómo está un espacio: libre, ocupado, su bote salió al agua (reservado), ocupado por un bote que salió de tierra, reservado a mano o fuera de servicio. */
export function spotState(s: Spot, contracts: Contract[]): { state: SpotState; contract: Contract | null } {
  const active = contracts.filter((c) => c.status === 'active')
  const own = active.find((c) => c.spot_id === s.id)
  if (own) return { state: own.away_since ? 'away' : 'occupied', contract: own }
  const temp = active.find((c) => c.away_spot_id === s.id && c.away_since)
  if (temp) return { state: 'temp', contract: temp }
  if (s.status === 'out_of_service') return { state: 'out', contract: null }
  if (s.status === 'reserved') return { state: 'reserved', contract: null }
  return { state: 'free', contract: null }
}

/** Texto del espacio para el contrato y la factura: "Patio A · A-12" */
export const spotName = (s: Spot, zones: Zone[]) => `${zones.find((z) => z.id === s.zone_id)?.name ?? ''} · ${s.label}`.replace(/^ · /, '')
