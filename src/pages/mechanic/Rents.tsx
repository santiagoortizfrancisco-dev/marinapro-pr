import { useRef, useState } from 'react'
import { Check, FileDown, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { Sheet, Toast } from '../../components/Sheet'
import { BackTitle, Button, CARD, EmptyState, Field, Input, Loading, Textarea } from '../../components/ui'
import { logoUrl } from '../../lib/brand'
import { db } from '../../lib/db'
import { addDays, formatDate, formatMoney, todayPR, weekStart } from '../../lib/format'
import { shareAsPdf } from '../../lib/pdf'
import type { Staff } from '../../lib/salon'
import { must, num, useLoad } from '../../lib/useLoad'
import { useMechanic } from '../../lib/useMechanic'

interface Entry { id: string; week_start: string; paid_on: string; staff_id: string | null; tenant: string; concept: string | null; amount: number }
interface Week { responsible: string | null; deposits: number | null; receipts: boolean; notes: string | null; done_by: string | null; reviewed_by: string | null }
const EMPTY_WEEK: Week = { responsible: null, deposits: null, receipts: false, notes: null, done_by: null, reviewed_by: null }
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Registro semanal de rentas (como el papel del salón): quién pagó la renta de su espacio esta semana,
 * otras rentas, el total, los depósitos al banco y el balance. Sale en PDF para imprimir o enviar.
 */
export default function Rents() {
  const { session } = useAuth()
  const me = session!.user.id
  const { data: mech } = useMechanic()
  const [week, setWeek] = useState(weekStart(todayPR()))
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const paper = useRef<HTMLDivElement>(null)
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500) }
  const weekEnd = addDays(week, 6)

  const { data, loading, reload } = useLoad(async () => {
    const [s, e, w] = await Promise.all([
      db().from('staff').select('*').eq('active', true).eq('pay_type', 'rent').order('name'),
      db().from('rent_entries').select('*').eq('week_start', week).order('paid_on').order('created_at'),
      db().from('rent_weeks').select('*').eq('week_start', week).maybeSingle(),
    ])
    return { renters: (s.data ?? []) as Staff[], entries: (e.data ?? []) as Entry[], week: (w.data as Week | null) ?? null }
  }, [week])

  // Lo de abajo del papel se guarda al salir de cada campo (si no existe la semana, se crea)
  async function saveWeek(patch: Partial<Week>) {
    if (data?.week) must(await db().from('rent_weeks').update({ ...patch, updated_at: new Date().toISOString() }).eq('week_start', week).eq('mechanic_id', me))
    else must(await db().from('rent_weeks').insert({ mechanic_id: me, week_start: week, ...patch }))
    reload()
  }

  // La fecha del pago: hoy si es de esta semana; si no, el lunes de esa semana
  const payDay = () => (todayPR() >= week && todayPR() <= weekEnd ? todayPR() : week)

  async function paid(s: Staff) {
    must(await db().from('rent_entries').insert({ mechanic_id: me, week_start: week, paid_on: payDay(), staff_id: s.id, tenant: s.name, concept: s.rent_space || 'Renta de espacio', amount: Number(s.rent_amount ?? 0) }))
    flash(`${s.name} pagó ${formatMoney(Number(s.rent_amount ?? 0))}`)
    reload()
  }

  async function remove(x: Entry) {
    if (!window.confirm(`¿Quitar la renta de ${x.tenant} (${formatMoney(Number(x.amount))})?`)) return
    must(await db().from('rent_entries').delete().eq('id', x.id))
    reload()
  }

  async function pdf() {
    if (!paper.current) return
    setPdfBusy(true)
    try { await shareAsPdf(paper.current, `Rentas ${formatDate(week).replace(/\//g, '-')}.pdf`) } finally { setPdfBusy(false) }
  }

  if (loading && !data) return <Loading />
  if (!data) return null
  const w = data.week ?? EMPTY_WEEK
  const total = data.entries.reduce((t, x) => t + Number(x.amount), 0)
  const deposits = Number(w.deposits ?? 0)
  const balance = Math.round((total - deposits) * 100) / 100
  const paidIds = new Set(data.entries.map((x) => x.staff_id).filter(Boolean))
  const pending = data.renters.filter((s) => !paidIds.has(s.id))
  const logo = logoUrl(mech?.logo_path)
  const weekLabel = `del ${formatDate(week)} al ${formatDate(weekEnd)}`

  return (
    <>
      <BackTitle to="/mas" subtitle="Control de espacios rentados">Registro de rentas</BackTitle>

      <div className="flex items-center gap-2" role="group" aria-label="Semana">
        <button type="button" aria-label="Semana anterior" onClick={() => setWeek(addDays(week, -7))} className="min-h-12 rounded-full bg-white px-4 text-lg font-bold text-slate-700 ring-1 ring-slate-300">‹</button>
        <p className="flex-1 text-center text-base font-extrabold text-navy-900">Semana {weekLabel}</p>
        <button type="button" aria-label="Semana siguiente" onClick={() => setWeek(addDays(week, 7))} className="min-h-12 rounded-full bg-white px-4 text-lg font-bold text-slate-700 ring-1 ring-slate-300">›</button>
      </div>

      {pending.length > 0 && (
        <section className="mt-4" aria-label="Por cobrar">
          <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wider text-slate-500">Por cobrar esta semana</h2>
          <div className="space-y-2">
            {pending.map((s) => (
              <div key={s.id} className={`${CARD} flex min-h-16 items-center gap-3 px-3 py-2`}>
                <span className="h-9 w-9 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-navy-900">{s.name}</span>
                  <span className="block truncate text-sm text-slate-600">{s.rent_space || 'Renta de espacio'} · {formatMoney(Number(s.rent_amount ?? 0))} por {s.rent_period === 'month' ? 'mes' : 'semana'}</span>
                </span>
                <button type="button" onClick={() => paid(s)} className="flex min-h-12 shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-4 text-base font-bold text-white active:bg-emerald-700"><Check size={18} /> Pagó</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5" aria-label="Rentas cobradas">
        <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wider text-slate-500">Cobradas</h2>
        {data.entries.length === 0 && data.renters.length === 0 && (
          <EmptyState icon={FileDown} title="No hay rentas todavía" text="En Empleadas, escoge “Renta” en las que te alquilan su espacio. Aquí te salen cada semana para marcar quién pagó." />
        )}
        {data.entries.length === 0 && data.renters.length > 0 && <p className="px-1 text-base text-slate-600">Nadie ha pagado esta semana todavía.</p>}
        {data.entries.length > 0 && (
          <div className={`${CARD} divide-y divide-slate-100 overflow-hidden`}>
            {data.entries.map((x, i) => (
              <div key={x.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
                <span className="w-6 shrink-0 text-sm font-bold text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-navy-900">{x.tenant}</span>
                  <span className="block truncate text-sm text-slate-600">{formatDate(x.paid_on)} · {x.concept || '—'}</span>
                </span>
                <span className="shrink-0 text-base font-extrabold text-slate-900">{formatMoney(Number(x.amount))}</span>
                <button type="button" aria-label={`Quitar renta de ${x.tenant}`} onClick={() => remove(x)} className="flex h-11 w-11 shrink-0 items-center justify-center text-red-600"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2"><Button variant="secondary" onClick={() => setAdding(true)}><Plus /> Añadir otra renta</Button></div>
      </section>

      <section className={`${CARD} mt-5 space-y-2 p-4`} aria-label="Totales">
        <div className="flex items-center justify-between text-lg"><span className="font-bold text-slate-700">Total de rentas</span><span className="font-extrabold text-navy-900">{formatMoney(total)}</span></div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="rent-deposits" className="text-lg font-bold text-slate-700">Depósitos</label>
          <Input id="rent-deposits" key={`dep-${week}-${w.deposits}`} inputMode="decimal" defaultValue={w.deposits != null ? String(w.deposits) : ''} placeholder="$0.00" className="w-36! text-right"
            onBlur={(e) => { const v = num(e.target.value); if (v !== (w.deposits ?? null)) saveWeek({ deposits: v }) }} />
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-xl"><span className="font-extrabold text-navy-900">Balance semanal</span><span className="font-extrabold text-navy-900">{formatMoney(balance)}</span></div>
      </section>

      <section className="mt-5 space-y-4" aria-label="Datos de la semana">
        <Field label="Responsable"><Input id="rent-responsible" key={`r-${week}-${w.responsible}`} defaultValue={w.responsible ?? ''} onBlur={(e) => e.target.value !== (w.responsible ?? '') && saveWeek({ responsible: e.target.value.trim() || null })} /></Field>
        <label className="flex min-h-12 items-center gap-3 text-base">
          <input type="checkbox" className="h-6 w-6" checked={w.receipts} onChange={(e) => saveWeek({ receipts: e.target.checked })} />
          Recibos / comprobantes adjuntos
        </label>
        <Field label="Observaciones"><Textarea id="rent-notes" key={`n-${week}-${w.notes}`} rows={3} defaultValue={w.notes ?? ''} onBlur={(e) => e.target.value !== (w.notes ?? '') && saveWeek({ notes: e.target.value.trim() || null })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Realizado por"><Input id="rent-done" key={`d-${week}-${w.done_by}`} defaultValue={w.done_by ?? ''} onBlur={(e) => e.target.value !== (w.done_by ?? '') && saveWeek({ done_by: e.target.value.trim() || null })} /></Field>
          <Field label="Revisado por"><Input id="rent-reviewed" key={`v-${week}-${w.reviewed_by}`} defaultValue={w.reviewed_by ?? ''} onBlur={(e) => e.target.value !== (w.reviewed_by ?? '') && saveWeek({ reviewed_by: e.target.value.trim() || null })} /></Field>
        </div>
      </section>

      <div className="mt-5"><Button disabled={pdfBusy} onClick={pdf}><FileDown /> {pdfBusy ? 'Preparando…' : 'Sacar en PDF'}</Button></div>

      {/* El PDF: como el papel del salón (fuera de la pantalla) */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -10000, top: 0 }}>
        <div ref={paper} style={{ width: 760, padding: 32, background: '#fffaf6', color: '#3b2418', fontFamily: 'Georgia, serif', border: '2px solid #c9a99a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {logo && <img src={logo} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} crossOrigin="anonymous" />}
              <div style={{ fontSize: 30, letterSpacing: 2 }}>{mech?.business_name ?? ''}</div>
            </div>
            <div style={{ background: '#f1e1d8', borderRadius: 8, padding: '6px 12px', fontFamily: 'Arial, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>SISTEMA ADMINISTRATIVO</div>
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 16 }}>REGISTRO SEMANAL DE RENTAS</div>
          <div style={{ display: 'inline-block', background: '#ecd2d6', borderRadius: 999, padding: '4px 16px', fontFamily: 'Arial, sans-serif', fontSize: 12, letterSpacing: 2, marginTop: 6 }}>CONTROL DE ESPACIOS RENTADOS</div>
          <table style={{ width: '100%', marginTop: 16, fontFamily: 'Arial, sans-serif', fontSize: 13 }}><tbody>
            <tr><td style={{ fontWeight: 700 }}>RESPONSABLE: <span style={{ fontWeight: 400 }}>{w.responsible ?? ''}</span></td><td style={{ fontWeight: 700, textAlign: 'right' }}>FECHA: <span style={{ fontWeight: 400 }}>{formatDate(todayPR())}</span></td></tr>
            <tr><td style={{ fontWeight: 700, paddingTop: 6 }}>MES: <span style={{ fontWeight: 400 }}>{MONTHS[Number(week.slice(5, 7)) - 1]} {week.slice(0, 4)}</span></td><td style={{ fontWeight: 700, textAlign: 'right', paddingTop: 6 }}>SEMANA: <span style={{ fontWeight: 400 }}>{weekLabel}</span></td></tr>
          </tbody></table>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontFamily: 'Arial, sans-serif', fontSize: 13 }}>
            <thead><tr style={{ background: '#7a5244', color: '#fff' }}>
              {['#', 'FECHA', 'INQUILINO / SERVICIO', 'CONCEPTO / ESPACIO RENTADO', 'MONTO'].map((h) => <th key={h} style={{ padding: '8px 6px', textAlign: h === 'MONTO' ? 'right' : 'left', border: '1px solid #5c3b30' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {Array.from({ length: Math.max(12, data.entries.length) }, (_, i) => data.entries[i]).map((x, i) => (
                <tr key={i}>
                  <td style={{ border: '1px solid #3b2418', padding: '5px 6px', width: 28 }}>{i + 1}</td>
                  <td style={{ border: '1px solid #3b2418', padding: '5px 6px', width: 90 }}>{x ? formatDate(x.paid_on) : ''}</td>
                  <td style={{ border: '1px solid #3b2418', padding: '5px 6px' }}>{x?.tenant ?? ''}</td>
                  <td style={{ border: '1px solid #3b2418', padding: '5px 6px' }}>{x?.concept ?? ''}</td>
                  <td style={{ border: '1px solid #3b2418', padding: '5px 6px', textAlign: 'right', width: 90 }}>{x ? formatMoney(Number(x.amount)) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 24, marginTop: 18, fontFamily: 'Arial, sans-serif', fontSize: 13 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>SOPORTE</div>
              <div style={{ marginTop: 4 }}>{w.receipts ? '☑' : '☐'} Recibos / Comprobantes adjuntos (si aplica)</div>
              <div style={{ fontWeight: 700, marginTop: 12 }}>OBSERVACIONES</div>
              <div style={{ marginTop: 4, whiteSpace: 'pre-line', minHeight: 48, borderBottom: '1px solid #3b2418' }}>{w.notes ?? ''}</div>
            </div>
            <div style={{ flex: 1, background: '#f6e6de', borderRadius: 12, padding: 14, fontWeight: 700, lineHeight: 2 }}>
              <div>TOTAL DE RENTAS {formatMoney(total)}</div>
              <div>DEPÓSITOS {formatMoney(deposits)}</div>
              <div>BALANCE SEMANAL {formatMoney(balance)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, fontFamily: 'Arial, sans-serif', fontSize: 13, fontWeight: 700 }}>
            <div>REALIZADO POR: <span style={{ fontWeight: 400 }}>{w.done_by ?? ''}</span></div>
            <div>REVISADO POR: <span style={{ fontWeight: 400 }}>{w.reviewed_by ?? ''}</span></div>
          </div>
        </div>
      </div>

      <AddRent open={adding} onClose={() => setAdding(false)} onSave={async (row) => {
        must(await db().from('rent_entries').insert({ mechanic_id: me, week_start: week, staff_id: null, ...row }))
        setAdding(false)
        flash('Añadida')
        reload()
      }} defaultDay={payDay()} />
      <Toast message={toast} />
    </>
  )
}

/** Otra renta a mano (alguien que no es empleada, o un espacio aparte). */
function AddRent({ open, onClose, onSave, defaultDay }: { open: boolean; onClose: () => void; onSave: (row: { tenant: string; concept: string | null; amount: number; paid_on: string }) => Promise<void>; defaultDay: string }) {
  const [tenant, setTenant] = useState('')
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState(defaultDay)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Sheet open={open} title="Añadir renta" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Inquilino / servicio *"><Input aria-label="Inquilino" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="Nombre" /></Field>
        <Field label="Concepto / espacio rentado"><Input aria-label="Concepto" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Estación 3" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto *"><Input aria-label="Monto" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$" /></Field>
          <Field label="Fecha"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <Button disabled={busy} onClick={async () => {
          const a = num(amount)
          if (!tenant.trim()) return setError('Escribe quién pagó.')
          if (a == null || a < 0) return setError('Escribe el monto.')
          setBusy(true)
          try { await onSave({ tenant: tenant.trim(), concept: concept.trim() || null, amount: a, paid_on: day || defaultDay }); setTenant(''); setConcept(''); setAmount(''); setError('') } catch { setError('No se pudo guardar. Intenta otra vez.') } finally { setBusy(false) }
        }}>{busy ? 'Guardando…' : 'Guardar'}</Button>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
    </Sheet>
  )
}
