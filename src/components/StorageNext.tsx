import { Link } from 'react-router'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { db } from '../lib/db'
import { addDays, daysUntil, formatMoney, todayPR } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { CARD } from './ui'

/** Se marca al abrir Guardería → Precios (para el paso 2 de los primeros pasos). */
export const PRICES_SEEN = 'guarderia-precios-vistos'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

interface Todo { to: string; title: string; sub?: string }

/**
 * Guardería en Inicio: al comenzar, los primeros pasos (con ✓); después, lo próximo que toca
 * (facturar el mes, contratos o seguros por vencer, quién debe).
 */
export default function StorageNext({ me, debt }: { me: string; debt: number | null }) {
  const month = todayPR().slice(0, 8) + '01'
  const { data } = useLoad(async () => {
    const [m, boats, contracts, bills] = await Promise.all([
      db().from('mechanics').select('ath_movil_number').eq('profile_id', me).maybeSingle(),
      db().from('boats').select('id').limit(1),
      db().from('storage_contracts').select('id, start_date, end_date, insurance_expires').eq('status', 'active'),
      db().from('storage_bills').select('contract_id').eq('month', month),
    ])
    let seen = false
    try { seen = localStorage.getItem(PRICES_SEEN) === '1' } catch { /* sin memoria: se queda sin ✓ */ }
    return {
      ath: Boolean((m.data as { ath_movil_number: string | null } | null)?.ath_movil_number),
      prices: seen,
      boats: (boats.data ?? []).length > 0,
      contracts: (contracts.data ?? []) as { id: string; start_date: string; end_date: string | null; insurance_expires: string | null }[],
      billed: new Set(((bills.data ?? []) as { contract_id: string }[]).map((b) => b.contract_id)),
    }
  }, [me, month])
  if (!data) return null

  const steps = [
    { done: data.ath, to: '/mas/negocio', title: 'Tu guardería', sub: 'Nombre, ATH Móvil, IVU y reglas' },
    { done: data.prices, to: '/guarderia?tab=rates', title: 'Tus precios', sub: 'Espacios y cobros sueltos' },
    { done: data.boats, to: '/clientes/nuevo', title: 'Tu primer cliente y su bote', sub: 'Con el largo del bote en pies' },
    { done: data.contracts.length > 0, to: '/guarderia', title: 'Meter el bote en su espacio', sub: 'Rack, muelle o patio, con su precio del mes' },
  ]
  const next = steps.findIndex((s) => !s.done)

  if (next >= 0) {
    return (
      <section className={`${CARD} mt-4 p-4`} aria-label="Primeros pasos">
        <h2 className="text-xl font-extrabold text-navy-900">Primeros pasos</h2>
        <p className="mb-3 text-sm text-slate-600">{steps.filter((s) => s.done).length} de {steps.length} listos. Sigue el que está en azul.</p>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Link to={s.to} className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 ${i === next ? 'bg-navy-800 text-white' : 'bg-slate-50 text-slate-800'}`}>
                {s.done ? <CheckCircle2 size={26} className="shrink-0 text-emerald-600" /> : (
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${i === next ? 'bg-white text-navy-800' : 'bg-slate-200 text-slate-600'}`}>{i + 1}</span>
                )}
                <span className="flex-1">
                  <span className={`block text-base font-bold ${s.done ? 'line-through decoration-2 opacity-70' : ''}`}>{s.title}</span>
                  <span className={`block text-sm ${i === next ? 'text-navy-100' : 'text-slate-500'}`}>{s.sub}</span>
                </span>
                {!s.done && <ChevronRight size={20} />}
              </Link>
            </li>
          ))}
        </ol>
      </section>
    )
  }

  // Lo próximo que toca
  const next30 = addDays(month, 32).slice(0, 8) + '01'
  const toBill = data.contracts.filter((c) => c.start_date < next30 && (!c.end_date || c.end_date >= month) && !data.billed.has(c.id)).length
  const soon = data.contracts.filter((c) => (c.end_date && daysUntil(c.end_date) <= 30) || (c.insurance_expires && daysUntil(c.insurance_expires) <= 15)).length
  const todos: Todo[] = []
  if (toBill > 0) todos.push({ to: '/guarderia?tab=bill', title: `Facturar ${MONTHS[Number(month.slice(5, 7)) - 1]}`, sub: `${toBill} ${toBill === 1 ? 'bote' : 'botes'} sin facturar` })
  if (soon > 0) todos.push({ to: '/guarderia', title: `${soon} ${soon === 1 ? 'contrato o seguro' : 'contratos o seguros'} por vencer`, sub: 'Llámalo o renueva' })
  if (debt && debt > 0) todos.push({ to: '/trabajos', title: `Te deben ${formatMoney(debt)}`, sub: 'Envíales un recordatorio' })

  return (
    <section className={`${CARD} mt-4 p-4`} aria-label="Lo próximo que toca">
      <h2 className="mb-2 text-xl font-extrabold text-navy-900">Lo próximo que toca</h2>
      {todos.length === 0 && <p className="flex items-center gap-2 text-base font-bold text-emerald-700"><CheckCircle2 size={22} /> Todo al día</p>}
      <div className="space-y-2">
        {todos.map((t, i) => (
          <Link key={t.title} to={t.to} className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 ${i === 0 ? 'bg-navy-800 text-white' : 'bg-slate-50 text-slate-800'}`}>
            <span className="flex-1">
              <span className="block text-base font-bold">{t.title}</span>
              {t.sub && <span className={`block text-sm ${i === 0 ? 'text-navy-100' : 'text-slate-500'}`}>{t.sub}</span>}
            </span>
            <ChevronRight size={20} />
          </Link>
        ))}
      </div>
    </section>
  )
}
