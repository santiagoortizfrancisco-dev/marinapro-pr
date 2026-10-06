import { Building2, ShieldCheck } from 'lucide-react'
import { db } from '../../lib/db'
import { formatDate, formatMoney } from '../../lib/format'
import { must, useLoad } from '../../lib/useLoad'
import { BackTitle, ErrorBox, Loading } from '../../components/ui'
import AdminDirectory from '../../components/AdminDirectory'

interface Row {
  id: string
  email: string | null
  full_name: string | null
  business_name: string | null
  created_at: string
  last_sign_in_at: string | null
  clients: number
  boats: number
  appointments: number
  work_orders: number
  invoices: number
  paid_total: number
  last_activity: string | null
}

const DAY = 86400000

/** "hoy", "ayer", "hace 5 días" o la fecha. */
function ago(iso: string | null): string {
  if (!iso) return 'nunca'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return formatDate(iso)
}

/** Admin sencillo: quién usa el app y cuánto. Solo números; no se ven los clientes de los mecánicos. */
export default function Admin() {
  const { data, loading, error, reload } = useLoad(async () => must(await db().rpc('admin_overview')) as Row[], [])

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se pudo cargar.'} onRetry={reload} />

  const active7 = data.filter((r) => r.last_activity && Date.now() - new Date(r.last_activity).getTime() < 7 * DAY).length
  const sum = (k: keyof Row) => data.reduce((t, r) => t + Number(r[k] ?? 0), 0)

  return (
    <>
      <BackTitle to="/mas" subtitle="Solo tú ves esto. No se ven los clientes de los mecánicos.">Admin</BackTitle>

      <div className="mb-5 grid grid-cols-2 gap-2">
        {[
          ['Mecánicos', String(data.length)],
          ['Activos (7 días)', String(active7)],
          ['Citas', String(sum('appointments'))],
          ['Cobrado', formatMoney(sum('paid_total'))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-slate-100 p-4">
            <div className="text-sm font-semibold text-slate-600">{label}</div>
            <div className="text-2xl font-extrabold text-navy-900">{value}</div>
          </div>
        ))}
      </div>

      <AdminDirectory />

      <div className="space-y-3">
        {data.map((r) => {
          const unused = r.clients === 0 && r.appointments === 0
          return (
            <section key={r.id} className="rounded-2xl border-2 border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <Building2 size={24} className="mt-0.5 shrink-0 text-navy-700" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-extrabold text-navy-900">{r.business_name || r.full_name || 'Sin nombre todavía'}</div>
                  <div className="truncate text-sm text-slate-600">{[r.full_name !== r.business_name && r.full_name, r.email].filter(Boolean).join(' · ')}</div>
                </div>
                {unused ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">{r.last_sign_in_at ? 'Sin usar' : 'No ha entrado'}</span>
                ) : (
                  <ShieldCheck size={22} className="shrink-0 text-emerald-700" aria-label="Lo está usando" />
                )}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1 text-center">
                {[
                  ['Clientes', r.clients],
                  ['Citas', r.appointments],
                  ['Trabajos', r.work_orders],
                  ['Facturas', r.invoices],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-xl bg-slate-50 py-2">
                    <div className="text-xl font-extrabold text-slate-900">{n}</div>
                    <div className="text-xs text-slate-600">{label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap justify-between gap-x-3 text-sm text-slate-600">
                <span>Entró: <b className="text-slate-800">{ago(r.last_sign_in_at)}</b></span>
                <span>Último uso: <b className="text-slate-800">{ago(r.last_activity)}</b></span>
                <span>Cobrado: <b className="text-slate-800">{formatMoney(Number(r.paid_total))}</b></span>
              </div>
              <div className="mt-1 text-xs text-slate-400">Cuenta creada el {formatDate(r.created_at)}</div>
            </section>
          )
        })}
      </div>
    </>
  )
}
