import type { Part, WorkOrder } from './types'

const r2 = (n: number) => Math.round(n * 100) / 100

/** Igual que wo_totals() en la base de datos: las piezas del cliente no se cobran. */
export function computeTotals(wo: Pick<WorkOrder, 'labor_hours' | 'labor_rate' | 'charge_ivu_labor' | 'charge_ivu_parts'>, parts: Pick<Part, 'qty' | 'unit_cost' | 'supplied_by'>[], ivuRate: number) {
  const labor = r2(Number(wo.labor_hours) * Number(wo.labor_rate))
  const partsTotal = r2(parts.filter((p) => p.supplied_by === 'mechanic').reduce((s, p) => s + Number(p.qty) * Number(p.unit_cost), 0))
  const ivu = r2(((wo.charge_ivu_labor ? labor : 0) + (wo.charge_ivu_parts ? partsTotal : 0)) * Number(ivuRate))
  return { labor, parts: partsTotal, ivu, total: r2(labor + partsTotal + ivu) }
}

/** 0.115 -> "11.5%" */
export function percent(rate: number): string {
  return `${Math.round(Number(rate) * 1000) / 10}%`
}
