import { CalendarPlus, CheckCircle2, FileText, HandCoins, Wrench, type LucideIcon } from 'lucide-react'
import { WORK_ORDER_STATUS } from '../../lib/catalog'
import { db } from '../../lib/db'
import { formatDate, formatMoney } from '../../lib/format'
import type { WorkOrder } from '../../lib/types'
import { must, useLoad } from '../../lib/useLoad'
import { CARD, EmptyState, ErrorBox, Fab, IconBadge, Loading, PageTitle, Pill, RowLink, type Tone } from '../../components/ui'

type Row = Pick<WorkOrder, 'id' | 'status' | 'complaint' | 'diagnosis' | 'created_at' | 'estimate_approved_by'> & {
  boats: { name: string; clients: { full_name: string } }
  invoices: { number: string; total: number; paid_at: string | null }[] | { number: string; total: number; paid_at: string | null } | null
}

const GROUPS: { title: string; statuses: WorkOrder['status'][]; icon: LucideIcon; tone: Tone }[] = [
  // Los estimados que el cliente no ha aprobado no son cobros todavía: se quedan en su cita (Agenda)
  { title: 'Aprobados y trabajando', statuses: ['approved', 'waiting_parts', 'in_progress', 'sea_trial'], icon: Wrench, tone: 'blue' },
  { title: 'Terminados, falta facturar', statuses: ['done'], icon: FileText, tone: 'amber' },
  { title: 'Facturados, falta cobrar', statuses: ['invoiced'], icon: HandCoins, tone: 'orange' },
  { title: 'Pagados', statuses: ['paid'], icon: CheckCircle2, tone: 'green' },
]

function invoiceOf(r: Row) {
  return Array.isArray(r.invoices) ? r.invoices[0] : r.invoices
}

export default function Jobs() {
  const { data, loading, error, reload } = useLoad(
    async () =>
      must(
        await db()
          .from('work_orders')
          .select('id, status, complaint, diagnosis, created_at, estimate_approved_by, boats(name, clients(full_name)), invoices(number, total, paid_at)')
          .order('created_at', { ascending: false })
          .limit(200),
      ) as unknown as Row[],
    [],
  )

  const cobros = (data ?? []).filter((r) => r.status !== 'estimate')
  const porCobrar = (data ?? []).filter((r) => r.status === 'invoiced').reduce((s, r) => s + Number(invoiceOf(r)?.total ?? 0), 0)
  const facturasPorCobrar = (data ?? []).filter((r) => r.status === 'invoiced').length

  return (
    <>
      <PageTitle subtitle="Lo que estás haciendo, lo que falta facturar y lo que falta cobrar">Cobros</PageTitle>
      {porCobrar > 0 && (
        <div className={`${CARD} mb-6 flex items-center gap-4 p-4`}>
          <IconBadge icon={HandCoins} tone="orange" size="lg" />
          <div>
            <div className="text-sm font-bold uppercase tracking-wide text-slate-500">Por cobrar</div>
            <div className="text-3xl font-extrabold text-navy-900">{formatMoney(porCobrar)}</div>
            <div className="text-sm text-slate-600">{facturasPorCobrar} {facturasPorCobrar === 1 ? 'factura' : 'facturas'}</div>
          </div>
        </div>
      )}
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && cobros.length === 0 && (
        <EmptyState icon={Wrench} title="Todavía no hay cobros" text="Cuando el cliente aprueba un estimado, o empiezas a trabajar, el trabajo sale aquí hasta que te pagan." />
      )}
      {data &&
        GROUPS.map((g) => {
          const list = data.filter((r) => g.statuses.includes(r.status)).slice(0, g.title === 'Pagados' ? 15 : undefined)
          if (list.length === 0) return null
          return (
            <section key={g.title} className="mb-6">
              <h2 className="mb-2 flex items-center gap-2 text-xl font-extrabold text-navy-900"><IconBadge icon={g.icon} tone={g.tone} size="sm" /> {g.title}</h2>
              <div className="space-y-2">
                {list.map((r) => {
                  const inv = invoiceOf(r)
                  const st = WORK_ORDER_STATUS[r.status]
                  return (
                    <RowLink
                      key={r.id}
                      to={`/trabajos/${r.id}`}
                      title={r.boats.name}
                      subtitle={[r.boats.clients.full_name, r.estimate_approved_by === 'client' ? '✓ Aprobado por el cliente' : null, inv ?`Factura #${inv.number} · ${formatMoney(Number(inv.total))}` : null, r.complaint || r.diagnosis, formatDate(r.created_at)].filter(Boolean).join(' · ')}
                      right={<Pill label={st.label} style={st.style} />}
                    />
                  )
                })}
              </div>
            </section>
          )
        })}
      <Fab to="/citas/nueva" label="Hacer cita" icon={CalendarPlus} />
    </>
  )
}
