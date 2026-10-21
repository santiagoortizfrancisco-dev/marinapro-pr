import { db } from './db'
import { formatMoney } from './format'
import type { Invoice, Payment, WorkOrder } from './types'

/** Un trabajo con su bote, su cliente, su factura (si tiene) y lo que ya le han pagado: lo que hace falta para saber quién debe. */
export interface MoneyRow {
  id: string
  status: WorkOrder['status']
  created_at: string
  completed_at: string | null
  boats: { name: string; clients: { id: string; full_name: string; phone: string | null } }
  invoice: Pick<Invoice, 'id' | 'number' | 'total' | 'paid_at' | 'payment_method' | 'public_token' | 'created_at'> | null
  payments: Pick<Payment, 'id' | 'amount' | 'method' | 'paid_at'>[]
}

const SELECT = 'id, status, created_at, completed_at, boats(name, clients(id, full_name, phone)), invoices(id, number, total, paid_at, payment_method, public_token, created_at), payments(id, amount, method, paid_at)'

type Raw = Omit<MoneyRow, 'invoice' | 'payments'> & { invoices: MoneyRow['invoice'][] | MoneyRow['invoice']; payments: MoneyRow['payments'] | null }

const r2 = (n: number) => Math.round(n * 100) / 100

/** Todos los trabajos con lo que tiene que ver con dinero (facturas y depósitos). */
export async function loadMoney(): Promise<MoneyRow[]> {
  const { data, error } = await db().from('work_orders').select(SELECT).order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return ((data ?? []) as unknown as Raw[]).map(({ invoices, payments, ...w }) => ({ ...w, invoice: (Array.isArray(invoices) ? invoices[0] : invoices) ?? null, payments: payments ?? [] }))
}

/** Lo que ya le han pagado (depósitos y abonos). */
export const paidSoFar = (payments: { amount: number }[]) => r2(payments.reduce((t, p) => t + Number(p.amount), 0))

/** Lo que falta de la factura. */
export const balanceOf = (r: MoneyRow) => (r.invoice && !r.invoice.paid_at ? Math.max(0, r2(Number(r.invoice.total) - paidSoFar(r.payments))) : 0)

/** Facturas sin pagar del todo (la más nueva primero). */
export const owed = (rows: MoneyRow[]) =>
  rows.filter((r) => balanceOf(r) > 0.004).sort((a, b) => b.invoice!.created_at.localeCompare(a.invoice!.created_at))

/** Trabajos terminados que todavía no tienen factura. */
export const toInvoice = (rows: MoneyRow[]) => rows.filter((r) => r.status === 'done' && !r.invoice)

/** Cuánto falta en total. */
export const sumOwed = (rows: MoneyRow[]) => r2(rows.reduce((t, r) => t + balanceOf(r), 0))

/** Cada pago recibido (el más nuevo primero). Las facturas viejas pagadas sin pagos guardados cuentan como un pago. */
export function received(rows: MoneyRow[]) {
  const out: { key: string; row: MoneyRow; amount: number; date: string; deposit: boolean }[] = []
  for (const r of rows) {
    if (r.payments.length) {
      for (const p of r.payments) out.push({ key: p.id, row: r, amount: Number(p.amount), date: p.paid_at, deposit: !r.invoice || p.paid_at < r.invoice.created_at })
    } else if (r.invoice?.paid_at) {
      out.push({ key: r.invoice.id, row: r, amount: Number(r.invoice.total), date: r.invoice.paid_at, deposit: false })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

/** Guarda un pago (depósito o abono). Si con eso se completa la factura, queda Pagada sola. */
export async function addPayment(workOrderId: string, amount: number, method: NonNullable<Invoice['payment_method']>) {
  const { error } = await db().from('payments').insert({ work_order_id: workOrderId, amount: r2(amount), method })
  if (error) throw error
}

/** Mensaje amable para recordarle al cliente que pague, con el link de la factura. */
export function reminderMessage(r: MoneyRow, ath: string | null, signature: string, delItem = 'del bote') {
  const first = r.boats.clients.full_name.split(' ')[0]
  const way = ath ? 'any' : 'cash'
  const link = `${window.location.origin}/d/${r.invoice!.public_token}?pago=${way}`
  const pay = ath ? ` Puedes pagar por ATH Móvil al ${ath}, o en efectivo.` : ''
  const paid = paidSoFar(r.payments)
  const amount = paid > 0
    ? `de ${formatMoney(Number(r.invoice!.total))}; ya pagaste ${formatMoney(paid)} y queda un balance de ${formatMoney(balanceOf(r))}`
    : `por ${formatMoney(Number(r.invoice!.total))}`
  return `Hola ${first}, te recuerdo la factura #${r.invoice!.number} ${delItem} ${r.boats.name} ${amount}: ${link} .${pay} ¡Gracias! ${signature}`.trim()
}
