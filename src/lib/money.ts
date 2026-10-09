import { db } from './db'
import { formatMoney } from './format'
import type { Invoice, WorkOrder } from './types'

/** Un trabajo con su bote, su cliente y su factura (si tiene): lo que hace falta para saber quién debe. */
export interface MoneyRow {
  id: string
  status: WorkOrder['status']
  created_at: string
  completed_at: string | null
  boats: { name: string; clients: { id: string; full_name: string; phone: string | null } }
  invoice: Pick<Invoice, 'id' | 'number' | 'total' | 'paid_at' | 'payment_method' | 'public_token' | 'created_at'> | null
}

const SELECT = 'id, status, created_at, completed_at, boats(name, clients(id, full_name, phone)), invoices(id, number, total, paid_at, payment_method, public_token, created_at)'

type Raw = Omit<MoneyRow, 'invoice'> & { invoices: MoneyRow['invoice'][] | MoneyRow['invoice'] }

/** Trabajos terminados, facturados o pagados (lo que tiene que ver con dinero). */
export async function loadMoney(): Promise<MoneyRow[]> {
  const { data, error } = await db().from('work_orders').select(SELECT).in('status', ['done', 'invoiced', 'paid']).order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return ((data ?? []) as unknown as Raw[]).map(({ invoices, ...w }) => ({ ...w, invoice: (Array.isArray(invoices) ? invoices[0] : invoices) ?? null }))
}

/** Facturas sin pagar (la más vieja primero). */
export const owed = (rows: MoneyRow[]) =>
  rows.filter((r) => r.invoice && !r.invoice.paid_at).sort((a, b) => a.invoice!.created_at.localeCompare(b.invoice!.created_at))

/** Trabajos terminados que todavía no tienen factura. */
export const toInvoice = (rows: MoneyRow[]) => rows.filter((r) => r.status === 'done' && !r.invoice)

export const sum = (rows: MoneyRow[]) => Math.round(rows.reduce((t, r) => t + Number(r.invoice?.total ?? 0), 0) * 100) / 100

/** Marca la factura como pagada (y su trabajo). */
export async function payInvoice(invoiceId: string, workOrderId: string, method: NonNullable<Invoice['payment_method']>) {
  const now = new Date().toISOString()
  const a = await db().from('invoices').update({ paid_at: now, payment_method: method }).eq('id', invoiceId)
  if (a.error) throw a.error
  await db().from('work_orders').update({ status: 'paid' }).eq('id', workOrderId)
}

/** Mensaje amable para recordarle al cliente que pague, con el link de la factura. */
export function reminderMessage(r: MoneyRow, ath: string | null, signature: string) {
  const first = r.boats.clients.full_name.split(' ')[0]
  const way = ath ? 'any' : 'cash'
  const link = `${window.location.origin}/d/${r.invoice!.public_token}?pago=${way}`
  const pay = ath ? ` Puedes pagar por ATH Móvil al ${ath}, o en efectivo.` : ''
  return `Hola ${first}, te recuerdo la factura #${r.invoice!.number} del bote ${r.boats.name} por ${formatMoney(Number(r.invoice!.total))}: ${link} .${pay} ¡Gracias! ${signature}`.trim()
}
