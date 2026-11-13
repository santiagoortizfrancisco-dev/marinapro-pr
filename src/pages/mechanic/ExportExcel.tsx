import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { BackTitle, Button, CARD } from '../../components/ui'
import { db } from '../../lib/db'
import { addDays, formatDate, formatTime, prToISO, todayPR } from '../../lib/format'
import { shareFile } from '../../lib/pdf'
import { useWords } from '../../lib/trade'
import { useMechanic } from '../../lib/useMechanic'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const firstOf = (day: string) => day.slice(0, 8) + '01'
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const METHOD: Record<string, string> = { ath_movil: 'ATH Móvil', cash: 'Efectivo', check: 'Cheque', card: 'Tarjeta', other: 'Otro' }
const STATUS: Record<string, string> = { requested: 'Pedida', confirmed: 'Confirmada', done: 'Hecha', cancelled: 'Cancelada' }

type One<T> = T | T[] | null
const first = <T,>(x: One<T>): T | null => (Array.isArray(x) ? x[0] ?? null : x)
const header = (cells: string[]) => cells.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#E8EEF8' }))

/** Exportar el mes a Excel (ventas, facturas, citas y rentas) para analizarlo en Excel o en ChatGPT. */
export default function ExportExcel() {
  const w = useWords()
  const { data: mech } = useMechanic()
  const [month, setMonth] = useState(firstOf(todayPR()))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function exportMonth() {
    setBusy(true)
    setMsg('')
    try {
      const next = firstOf(addDays(month, 32))
      const from = prToISO(month, '00:00')
      const to = prToISO(next, '00:00')
      const [pays, invs, appts, rents] = await Promise.all([
        db().from('payments').select('amount, tip, method, paid_at, work_orders(complaint, boats(name, clients(full_name)), invoices(number))').gte('paid_at', from).lt('paid_at', to).order('paid_at'),
        db().from('invoices').select('number, created_at, labor_subtotal, parts_subtotal, ivu_amount, total, paid_at, work_orders(boats(name, clients(full_name)), payments(amount))').gte('created_at', from).lt('created_at', to).order('created_at'),
        db().from('appointments').select('starts_at, duration_min, status, title, deposit_asked, staff(name), boats(name, clients(full_name))').gte('starts_at', from).lt('starts_at', to).order('starts_at'),
        db().from('rent_entries').select('paid_on, tenant, concept, amount').gte('paid_on', month).lt('paid_on', next).order('paid_on'),
      ])
      type Client = { full_name: string } | null
      type Boat = { name: string; clients: One<Client> } | null
      const who = (b: One<Boat>) => {
        const boat = first(b)
        const c = first(boat?.clients ?? null)
        return w.salon ? c?.full_name ?? '' : [c?.full_name, boat?.name].filter(Boolean).join(' · ')
      }

      const payRows = ((pays.data ?? []) as unknown as { amount: number; tip: number | null; method: string; paid_at: string; work_orders: One<{ complaint: string | null; boats: One<Boat>; invoices: One<{ number: string }> }> }[]).map((p) => {
        const wo = first(p.work_orders)
        return [formatDate(p.paid_at), formatTime(p.paid_at), who(wo?.boats ?? null), wo?.complaint ?? '', first(wo?.invoices ?? null)?.number ?? '', METHOD[p.method] ?? p.method, Number(p.amount), Number(p.tip ?? 0)]
      })
      const invRows = ((invs.data ?? []) as unknown as { number: string; created_at: string; labor_subtotal: number; parts_subtotal: number; ivu_amount: number; total: number; paid_at: string | null; work_orders: One<{ boats: One<Boat>; payments: { amount: number }[] }> }[]).map((i) => {
        const wo = first(i.work_orders)
        const paid = (wo?.payments ?? []).reduce((t, p) => t + Number(p.amount), 0)
        const balance = i.paid_at ? 0 : Math.max(0, Math.round((Number(i.total) - paid) * 100) / 100)
        return [i.number, formatDate(i.created_at), who(wo?.boats ?? null), Number(i.labor_subtotal) + Number(i.parts_subtotal), Number(i.ivu_amount), Number(i.total), Math.round((Number(i.total) - balance) * 100) / 100, balance]
      })
      const apptRows = ((appts.data ?? []) as unknown as { starts_at: string; duration_min: number; status: string; title: string | null; deposit_asked: number | null; staff: One<{ name: string }>; boats: One<Boat> }[]).map((a) =>
        [formatDate(a.starts_at), formatTime(a.starts_at), who(a.boats), a.title ?? '', first(a.staff)?.name ?? '', STATUS[a.status] ?? a.status, Number(a.duration_min), Number(a.deposit_asked ?? 0)])
      const rentRows = ((rents.data ?? []) as { paid_on: string; tenant: string; concept: string | null; amount: number }[]).map((r) => [formatDate(r.paid_on), r.tenant, r.concept ?? '', Number(r.amount)])

      const sum = (rows: (string | number)[][], col: number) => Math.round(rows.reduce((t, r) => t + Number(r[col] || 0), 0) * 100) / 100
      const money = { type: Number, format: '$#,##0.00' }
      const fmt = (rows: (string | number)[][], moneyCols: number[]) => rows.map((r) => r.map((v, i) => (moneyCols.includes(i) ? { ...money, value: Number(v) } : v)))
      const summary = [
        header(['Mes', monthLabel(month)]),
        ['Negocio', mech?.business_name ?? ''],
        ['Cobrado (pagos)', { ...money, value: sum(payRows, 6) }],
        ['Propinas', { ...money, value: sum(payRows, 7) }],
        ['Facturado', { ...money, value: sum(invRows, 5) }],
        ['IVU facturado', { ...money, value: sum(invRows, 4) }],
        ['Me deben (de estas facturas)', { ...money, value: sum(invRows, 7) }],
        ['Citas', apptRows.length],
        ['Citas hechas', apptRows.filter((r) => r[5] === 'Hecha').length],
        ['Citas canceladas', apptRows.filter((r) => r[5] === 'Cancelada').length],
        ['Rentas cobradas', { ...money, value: sum(rentRows, 3) }],
      ]

      const { default: writeXlsxFile } = await import('write-excel-file/browser')
      const blob = await writeXlsxFile([
        { sheet: 'Resumen', data: summary, columns: [{ width: 30 }, { width: 18 }] },
        { sheet: 'Ventas y pagos', data: [header(['Fecha', 'Hora', w.Client, 'Servicio', 'Factura #', 'Método', 'Monto', 'Propina']), ...fmt(payRows, [6, 7])], columns: [{ width: 12 }, { width: 10 }, { width: 26 }, { width: 30 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 10 }] },
        { sheet: 'Facturas', data: [header(['Factura #', 'Fecha', w.Client, 'Subtotal', 'IVU', 'Total', 'Pagado', 'Debe']), ...fmt(invRows, [3, 4, 5, 6, 7])], columns: [{ width: 10 }, { width: 12 }, { width: 26 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 12 }] },
        { sheet: 'Citas', data: [header(['Fecha', 'Hora', w.Client, 'Servicios', 'Con', 'Estado', 'Minutos', 'Depósito']), ...fmt(apptRows, [7])], columns: [{ width: 12 }, { width: 10 }, { width: 26 }, { width: 34 }, { width: 14 }, { width: 12 }, { width: 9 }, { width: 11 }] },
        { sheet: 'Rentas', data: [header(['Fecha', 'Inquilino', 'Concepto / espacio', 'Monto']), ...fmt(rentRows, [3])], columns: [{ width: 12 }, { width: 26 }, { width: 28 }, { width: 12 }] },
      ]).toBlob()
      const name = `${(mech?.business_name ?? 'FacturaFacil').replace(/[^\p{L}\p{N} ]/gu, '').trim()} ${monthLabel(month)}.xlsx`
      const r = await shareFile(new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      if (r !== 'cancelled') setMsg(`Listo: ${name}`)
    } catch {
      setMsg('No se pudo hacer el archivo. Intenta otra vez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <BackTitle to="/mas" subtitle="Ventas, facturas, citas y rentas del mes">Exportar a Excel</BackTitle>
      <div className="flex items-center gap-2" role="group" aria-label="Mes">
        <button type="button" aria-label="Mes anterior" onClick={() => setMonth(firstOf(addDays(month, -1)))} className="min-h-12 rounded-full bg-white px-4 text-lg font-bold text-slate-700 ring-1 ring-slate-300">‹</button>
        <p className="flex-1 text-center text-xl font-extrabold capitalize text-navy-900">{monthLabel(month)}</p>
        <button type="button" aria-label="Mes siguiente" onClick={() => setMonth(firstOf(addDays(month, 32)))} className="min-h-12 rounded-full bg-white px-4 text-lg font-bold text-slate-700 ring-1 ring-slate-300">›</button>
      </div>
      <section className={`${CARD} mt-4 space-y-2 p-4 text-base text-slate-700`}>
        <p className="font-bold text-navy-900">El archivo trae una hoja para cada cosa:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Resumen</b> del mes</li>
          <li><b>Ventas y pagos</b> (con propinas)</li>
          <li><b>Facturas</b> (pagadas y lo que deben)</li>
          <li><b>Citas</b></li>
          <li><b>Rentas</b></li>
        </ul>
        <p className="text-sm text-slate-500">Lo puedes abrir en Excel, o subirlo a ChatGPT y pedirle tus reportes o el cierre del mes.</p>
      </section>
      <div className="mt-4"><Button disabled={busy} onClick={exportMonth}><FileSpreadsheet /> {busy ? 'Preparando…' : `Exportar ${monthLabel(month)}`}</Button></div>
      {msg && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-center text-base font-bold text-emerald-900">{msg}</p>}
    </>
  )
}
