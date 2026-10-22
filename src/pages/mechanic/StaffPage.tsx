import { useMemo, useState } from 'react'
import { Pencil, Plus, Users } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { Sheet } from '../../components/Sheet'
import { BackTitle, Button, CARD, EmptyState, Field, Input, Loading } from '../../components/ui'
import { db } from '../../lib/db'
import { addDays, formatMoney, todayPR, weekStart } from '../../lib/format'
import { STAFF_COLORS, type Staff } from '../../lib/salon'
import { num, useLoad } from '../../lib/useLoad'

type Period = 'week' | 'month' | 'last'
const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
  { value: 'last', label: 'Mes pasado' },
]

/** [desde, hasta) en días de PR */
function range(p: Period): [string, string] {
  const today = todayPR()
  if (p === 'week') return [weekStart(today), addDays(weekStart(today), 7)]
  const first = today.slice(0, 8) + '01'
  if (p === 'month') return [first, addDays(first, 32).slice(0, 8) + '01']
  const prev = addDays(first, -1).slice(0, 8) + '01'
  return [prev, first]
}

interface Row {
  staff_id: string
  invoices: { labor_subtotal: number; parts_subtotal: number; paid_at: string | null }[] | { labor_subtotal: number; parts_subtotal: number; paid_at: string | null } | null
  payments: { tip: number; paid_at: string }[] | null
}

/** Empleadas (cada una con su agenda y su comisión) y cuánto le toca a cada una. */
export default function StaffPage() {
  const { session } = useAuth()
  const [period, setPeriod] = useState<Period>('week')
  const [edit, setEdit] = useState<Partial<Staff> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { data, loading, reload } = useLoad(async () => {
    const [s, w] = await Promise.all([
      db().from('staff').select('*').order('active', { ascending: false }).order('name'),
      db().from('work_orders').select('staff_id, invoices(labor_subtotal, parts_subtotal, paid_at), payments(tip, paid_at)').not('staff_id', 'is', null),
    ])
    return { staff: (s.data ?? []) as Staff[], rows: (w.data ?? []) as unknown as Row[] }
  }, [])

  // Comisión = % de los servicios cobrados en el período; la propina va completa a la empleada
  const report = useMemo(() => {
    const [from, to] = range(period)
    const inRange = (iso: string | null) => Boolean(iso) && iso!.slice(0, 10) >= from && iso!.slice(0, 10) < to
    const out = new Map<string, { visits: number; services: number; tips: number }>()
    for (const r of data?.rows ?? []) {
      const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices
      const cur = out.get(r.staff_id) ?? { visits: 0, services: 0, tips: 0 }
      if (inv && inRange(inv.paid_at)) {
        cur.visits += 1
        cur.services += Number(inv.labor_subtotal)
      }
      for (const p of r.payments ?? []) if (inRange(p.paid_at)) cur.tips += Number(p.tip)
      out.set(r.staff_id, cur)
    }
    return out
  }, [data, period])

  async function save() {
    if (!edit?.name?.trim()) return setError('Escribe el nombre.')
    setBusy(true)
    setError('')
    const row = {
      name: edit.name.trim(),
      phone: edit.phone?.trim() || null,
      color: edit.color ?? STAFF_COLORS[(data?.staff.length ?? 0) % STAFF_COLORS.length],
      commission_rate: Math.min(100, Math.max(0, num(String(edit.commission_rate ?? 0)) ?? 0)) / 100,
      active: edit.active ?? true,
    }
    const res = edit.id
      ? await db().from('staff').update(row).eq('id', edit.id)
      : await db().from('staff').insert({ ...row, mechanic_id: session!.user.id })
    setBusy(false)
    if (res.error) return setError('No se pudo guardar. Intenta otra vez.')
    setEdit(null)
    reload()
  }

  if (loading && !data) return <Loading />
  const staff = data?.staff ?? []
  const totals = [...report.values()].reduce((t, r) => ({ services: t.services + r.services, tips: t.tips + r.tips }), { services: 0, tips: 0 })

  return (
    <>
      <BackTitle to="/mas" subtitle="Cada una con su agenda y su comisión">Empleadas y comisiones</BackTitle>

      <Button onClick={() => { setError(''); setEdit({ commission_rate: 40 as unknown as number, active: true }) }}><Plus /> Añadir empleada</Button>

      {staff.length === 0 && <div className="mt-4"><EmptyState icon={Users} title="Todavía no hay empleadas" text="Añade a las que trabajan contigo. En cada cita escoges con quién es, y aquí ves cuánto le toca a cada una." /></div>}

      {staff.length > 0 && (
        <>
          <div className="mt-5 flex gap-2" role="group" aria-label="Período">
            {PERIODS.map((p) => (
              <button key={p.value} type="button" onClick={() => setPeriod(p.value)} aria-pressed={period === p.value}
                className={`min-h-11 flex-1 rounded-full text-sm font-bold ${period === p.value ? 'bg-navy-800 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}>{p.label}</button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {staff.map((s) => {
              const r = report.get(s.id) ?? { visits: 0, services: 0, tips: 0 }
              const commission = Math.round(r.services * Number(s.commission_rate) * 100) / 100
              return (
                <article key={s.id} className={`${CARD} p-3 ${s.active ? '' : 'opacity-60'}`} aria-label={`Comisión de ${s.name}`}>
                  <div className="flex items-center gap-3">
                    <span className="h-10 w-10 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-extrabold text-navy-900">{s.name}{s.active ? '' : ' (ya no trabaja)'}</span>
                      <span className="block text-sm text-slate-600">Comisión {Math.round(Number(s.commission_rate) * 100)}% · {r.visits} {r.visits === 1 ? 'clienta' : 'clientas'}</span>
                    </span>
                    <button type="button" onClick={() => { setError(''); setEdit({ ...s, commission_rate: Math.round(Number(s.commission_rate) * 100) as unknown as number }) }} aria-label={`Cambiar a ${s.name}`}
                      className="flex h-12 w-12 items-center justify-center text-slate-500"><Pencil size={20} /></button>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-slate-50 p-2"><dt className="text-xs font-bold text-slate-500">Servicios</dt><dd className="text-base font-extrabold text-slate-900">{formatMoney(r.services)}</dd></div>
                    <div className="rounded-xl bg-pink-50 p-2"><dt className="text-xs font-bold text-pink-700">Comisión</dt><dd className="text-base font-extrabold text-pink-900">{formatMoney(commission)}</dd></div>
                    <div className="rounded-xl bg-emerald-50 p-2"><dt className="text-xs font-bold text-emerald-700">Propinas</dt><dd className="text-base font-extrabold text-emerald-900">{formatMoney(r.tips)}</dd></div>
                  </dl>
                  <p className="mt-2 text-right text-base font-bold text-navy-900">Le toca: {formatMoney(commission + r.tips)}</p>
                </article>
              )
            })}
          </div>
          <p className="mt-3 text-center text-sm text-slate-500">
            Servicios cobrados: {formatMoney(totals.services)} · Propinas: {formatMoney(totals.tips)}. La comisión es sobre los servicios ya cobrados (sin IVU); la propina va completa a la empleada.
          </p>
        </>
      )}

      <Sheet open={!!edit} title={edit?.id ? 'Cambiar empleada' : 'Empleada nueva'} onClose={() => setEdit(null)}>
        {edit && (
          <div className="space-y-4">
            <Field label="Nombre *">
              <Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Yari" />
            </Field>
            <Field label="Teléfono (opcional)">
              <Input type="tel" inputMode="tel" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </Field>
            <Field label="Comisión (%)" hint="Lo que le toca de cada servicio que hace. Ej.: 40">
              <Input inputMode="decimal" value={String(edit.commission_rate ?? '')} onChange={(e) => setEdit({ ...edit, commission_rate: e.target.value as unknown as number })} />
            </Field>
            <Field label="Su color en la agenda">
              <div className="flex flex-wrap gap-2">
                {STAFF_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setEdit({ ...edit, color: c })} aria-label={`Color ${c}`} aria-pressed={edit.color === c}
                    className={`h-11 w-11 rounded-full ${edit.color === c ? 'ring-4 ring-offset-2 ring-navy-800' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </Field>
            {edit.id && (
              <label className="flex min-h-12 items-center gap-3 text-base">
                <input type="checkbox" className="h-6 w-6" checked={edit.active === false} onChange={(e) => setEdit({ ...edit, active: !e.target.checked })} />
                Ya no trabaja aquí (no sale en las citas nuevas)
              </label>
            )}
            {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
            <Button disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        )}
      </Sheet>
    </>
  )
}
