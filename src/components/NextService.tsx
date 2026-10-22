import { JOB_IDEAS, useWords } from '../lib/trade'
import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { db } from '../lib/db'
import { addDays, addMonths, todayPR } from '../lib/format'
import { Button, Choice, Field, Input } from './ui'

const WHEN = [
  { value: '3', label: '3 meses' },
  { value: '6', label: '6 meses' },
  { value: '12', label: '1 año' },
  { value: 'date', label: 'Otra fecha' },
] as const

/** Salón: vuelve en semanas (relleno, retoque, tinte) */
const WEEKS = [
  { value: 'w2', label: '2 semanas' },
  { value: 'w3', label: '3 semanas' },
  { value: 'w4', label: '4 semanas' },
  { value: 'w6', label: '6 semanas' },
] as const

/**
 * "¿Cuándo le toca el próximo servicio?" — por meses, como se trabaja en PR.
 * Al guardar, los recordatorios viejos del mismo servicio en ese bote quedan como hechos.
 */
export default function NextService({ boatId, workOrderId, defaultService, onSaved, onSkip, title = '¿Cuándo le toca el próximo servicio?' }: {
  boatId: string
  workOrderId?: string | null
  defaultService?: string
  onSaved: () => void
  onSkip?: () => void
  title?: string
}) {
  const w = useWords()
  const [service, setService] = useState(defaultService ?? 'Mantenimiento')
  const [when, setWhen] = useState<string>(w.salon ? 'w3' : '6')
  const [date, setDate] = useState(addMonths(todayPR(), 6))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!service.trim()) return setError(w.salon ? 'Escribe qué le toca.' : 'Escribe qué servicio le toca.')
    setBusy(true)
    setError('')
    const weeks = when.startsWith('w') ? Number(when.slice(1)) : null
    const months = when === 'date' || weeks ? null : Number(when)
    const due = when === 'date' ? date : weeks ? addDays(todayPR(), weeks * 7) : addMonths(todayPR(), months!)
    // El recordatorio anterior de ese mismo servicio ya se cumplió
    await db().from('maintenance_schedules').update({ status: 'done' }).eq('boat_id', boatId).in('status', ['pending', 'notified']).ilike('service_type', service.trim())
    const { error } = await db().from('maintenance_schedules').insert({
      boat_id: boatId, service_type: service.trim(), due_date: due, interval_months: months, work_order_id: workOrderId ?? null, status: 'pending',
    })
    setBusy(false)
    if (error) return setError('No se pudo guardar. Intenta otra vez.')
    onSaved()
  }

  return (
    <section className="rounded-2xl border-2 border-sun-500 bg-sun-400/10 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-navy-900"><CalendarClock size={22} /> {w.salon && title === '¿Cuándo le toca el próximo servicio?' ? '¿Cuándo vuelve?' : title}</h3>
      <div className="space-y-3">
        <Field label="¿Qué le toca?">
          <Input value={service} onChange={(e) => setService(e.target.value)} placeholder={JOB_IDEAS[w.trade][0]} />
        </Field>
        <Choice value={when} onChange={setWhen} options={w.salon ? [...WEEKS, { value: 'date', label: 'Otra fecha' }] : [...WHEN]} />
        {when === 'date' && (
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
        {error && <p className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <Button onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar recordatorio'}</Button>
        {onSkip && <Button variant="ghost" onClick={onSkip}>No por ahora</Button>}
      </div>
    </section>
  )
}
