import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, MessageCircle, Package, Plus, Receipt, Ship, ThumbsUp } from 'lucide-react'
import { PAYMENT_METHODS, SEA_TRIAL_METHODS, WORK_ORDER_STATUS, WORK_STEPS, labelOf } from '../lib/catalog'
import { db } from '../lib/db'
import { formatDate, formatMoney } from '../lib/format'
import { whatsappLink } from '../lib/links'
import { computeTotals, percent } from '../lib/totals'
import type { Client, Invoice, Mechanic, Part, Photo, WorkOrder } from '../lib/types'
import { must, num, useLoad } from '../lib/useLoad'
import { useAuth } from '../auth/AuthProvider'
import ConfirmDelete from './ConfirmDelete'
import PartSheet from './PartSheet'
import PhotoSection from './PhotoSection'
import { Sheet } from './Sheet'
import { BackTitle, Button, Choice, ErrorBox, Field, Input, LinkButton, Loading, Pill, Textarea, Toggle } from './ui'

type Boat = { id: string; name: string; clients: Pick<Client, 'id' | 'full_name' | 'phone'> }

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xl font-extrabold text-navy-900">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

/** Texto que se guarda solo al salir del campo. */
function AutoText({ label, hint, value, onSave, rows = 3 }: { label: string; hint?: string; value: string | null; onSave: (v: string | null) => void; rows?: number }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  return (
    <Field label={label} hint={hint}>
      <Textarea rows={rows} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? '') && onSave(v.trim() || null)} />
    </Field>
  )
}

/**
 * Todo el trabajo de una visita: problema, diagnóstico, piezas, fotos, prueba en el agua, total, estimado y factura.
 * Se muestra dentro de la cita (embedded) o solo, para trabajos sin cita.
 */
export default function JobPanel({ woId: id, embedded = false }: { woId: string; embedded?: boolean }) {
  const navigate = useNavigate()
  const { session, profile } = useAuth()
  const [partOpen, setPartOpen] = useState(false)
  const [editPart, setEditPart] = useState<Part | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [payMethod, setPayMethod] = useState<NonNullable<Invoice['payment_method']>>('ath_movil')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [laborHours, setLaborHours] = useState('')
  const [laborRate, setLaborRate] = useState('')

  const { data, loading, error, reload, setData } = useLoad(async () => {
    const wo = must(await db().from('work_orders').select('*, boats(id, name, clients(id, full_name, phone))').eq('id', id!).single()) as WorkOrder & { boats: Boat }
    const [parts, photos, invoice, mech] = await Promise.all([
      db().from('work_order_parts').select('*').eq('work_order_id', id!).order('created_at'),
      db().from('photos').select('*').eq('work_order_id', id!).order('taken_at'),
      db().from('invoices').select('*').eq('work_order_id', id!).maybeSingle(),
      db().from('mechanics').select('*').eq('profile_id', session!.user.id).single(),
    ])
    return { wo, parts: must(parts) as Part[], photos: must(photos) as Photo[], invoice: (invoice.data as Invoice | null) ?? null, mech: must(mech) as Mechanic }
  }, [id])

  useEffect(() => {
    if (!data) return
    setLaborHours(String(data.wo.labor_hours ?? 0))
    setLaborRate(String(data.wo.labor_rate ?? 0))
  }, [data?.wo.labor_hours, data?.wo.labor_rate]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se encontró el trabajo.'} onRetry={reload} />
  const { wo, parts, photos, invoice, mech } = data
  const boat = wo.boats
  const client = boat.clients
  const totals = computeTotals(wo, parts, mech.ivu_rate)
  const firstName = client.full_name.split(' ')[0]
  const link = (token: string) => `${window.location.origin}/d/${token}`
  const locked = wo.status === 'paid'

  async function patch(fields: Partial<WorkOrder>) {
    const { error } = await db().from('work_orders').update(fields).eq('id', wo.id)
    if (error) {
      setSaved('No se pudo guardar')
      return
    }
    setData({ ...data!, wo: { ...wo, ...fields } })
    setSaved('Guardado ✓')
    setTimeout(() => setSaved(''), 2000)
  }

  function setStatus(status: WorkOrder['status']) {
    patch({ status, completed_at: status === 'done' ? wo.completed_at ?? new Date().toISOString() : wo.completed_at })
    // La cita sigue al trabajo: terminado = cita hecha
    if (wo.appointment_id) {
      db().from('appointments').update({ status: status === 'done' ? 'done' : 'confirmed' }).eq('id', wo.appointment_id).neq('status', 'cancelled')
    }
  }

  async function makeInvoice() {
    setBusy(true)
    const { error } = await db().rpc('create_invoice', { p_wo: wo.id })
    setBusy(false)
    if (error) {
      setSaved('No se pudo hacer la factura')
      return
    }
    reload()
  }

  async function markPaid(paid: boolean) {
    if (!invoice) return
    setBusy(true)
    await db().from('invoices').update(paid ? { paid_at: new Date().toISOString(), payment_method: payMethod } : { paid_at: null, payment_method: null }).eq('id', invoice.id)
    await db().from('work_orders').update({ status: paid ? 'paid' : 'invoiced' }).eq('id', wo.id)
    setBusy(false)
    setPayOpen(false)
    reload()
  }

  // Avisos (no bloquean)
  const warnings: string[] = []
  const boughtParts = parts.length > 0
  if (boughtParts && !photos.some((p) => p.kind === 'old_part')) warnings.push('Falta foto de la pieza vieja.')
  if (boughtParts && !photos.some((p) => p.kind === 'new_part')) warnings.push('Falta foto de la pieza nueva.')
  if (wo.sea_trial_required && wo.sea_trial_method !== 'not_allowed' && !wo.sea_trial_done) warnings.push('Falta la prueba en el agua.')
  if (wo.sea_trial_method === 'not_allowed') warnings.push('Sin prueba en el agua: la garantía queda anulada (sale en la factura).')
  if (parts.some((p) => !p.received_at)) warnings.push('Hay piezas que todavía no han llegado.')

  const estimateMsg = `Hola ${firstName}, te envío el estimado para el bote ${boat.name}: total ${formatMoney(totals.total)}. Lo puedes ver aquí: ${link(wo.public_token)} . Si estás de acuerdo, contéstame "aprobado". ${profile?.full_name ?? ''}`.trim()
  const invoiceMsg = invoice
    ? `Hola ${firstName}, aquí está la factura #${invoice.number} del bote ${boat.name} por ${formatMoney(Number(invoice.total))}: ${link(invoice.public_token)} .` +
      (mech.ath_movil_number ? ` Puedes pagar por ATH Móvil al ${mech.ath_movil_number}.` : '') +
      ` ¡Gracias! ${profile?.full_name ?? ''}`
    : ''
  const invoiceOutdated = invoice && !invoice.paid_at && Math.abs(Number(invoice.total) - totals.total) > 0.004

  const st = WORK_ORDER_STATUS[wo.status]

  return (
    <>
      {embedded ? (
        <div className="mb-3 mt-8 flex items-center justify-between gap-2 border-t-4 border-navy-800 pt-4">
          <h2 className="text-2xl font-extrabold text-navy-900">El trabajo</h2>
          <Pill label={st.label} style={st.style} />
        </div>
      ) : (
        <>
          <BackTitle to="/trabajos" subtitle={`Abierto el ${formatDate(wo.created_at)}`}>Trabajo · {boat.name}</BackTitle>
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link to={`/botes/${boat.id}`} className="flex min-h-12 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-4 text-base font-semibold text-slate-800">
              <Ship size={20} /> {boat.name} · {client.full_name}
            </Link>
            <Pill label={st.label} style={st.style} />
          </div>
        </>
      )}
      {saved && <div className="fixed left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white">{saved}</div>}

      {warnings.length > 0 && (
        <div className="mb-2 rounded-xl bg-amber-50 p-3 text-base text-amber-900">
          {warnings.map((w) => <div key={w} className="flex gap-2"><AlertTriangle size={20} className="mt-0.5 shrink-0" /> {w}</div>)}
        </div>
      )}

      {!locked && wo.status !== 'invoiced' && (
        <Section title="¿En qué va?">
          <Choice value={wo.status} onChange={setStatus} options={WORK_STEPS} />
        </Section>
      )}

      <Section title="El problema">
        <div className="space-y-4">
          <AutoText label="Lo que dice el cliente" value={wo.complaint} onSave={(v) => patch({ complaint: v })} />
          <AutoText label="Diagnóstico (lo que encontraste)" value={wo.diagnosis} onSave={(v) => patch({ diagnosis: v })} rows={4} />
          <AutoText label="Lo que se hizo" hint="Sale en la factura para el cliente" value={wo.work_done} onSave={(v) => patch({ work_done: v })} rows={4} />
        </div>
      </Section>

      <Section title="Mano de obra">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Horas">
            <Input inputMode="decimal" value={laborHours} onChange={(e) => setLaborHours(e.target.value)} onBlur={() => patch({ labor_hours: num(laborHours) ?? 0 })} />
          </Field>
          <Field label="Tarifa por hora ($)">
            <Input inputMode="decimal" value={laborRate} onChange={(e) => setLaborRate(e.target.value)} onBlur={() => patch({ labor_rate: num(laborRate) ?? 0 })} />
          </Field>
        </div>
        <p className="mt-2 text-right text-lg font-bold text-navy-900">{formatMoney(totals.labor)}</p>
      </Section>

      <Section
        title="Piezas"
        right={
          <button onClick={() => { setEditPart(null); setPartOpen(true) }} className="flex min-h-12 items-center gap-1 rounded-xl bg-navy-50 px-3 text-base font-bold text-navy-800">
            <Plus size={20} /> Pieza
          </button>
        }
      >
        {parts.length === 0 && <p className="text-base text-slate-600">Sin piezas todavía.</p>}
        <div className="space-y-2">
          {parts.map((p) => (
            <button key={p.id} onClick={() => { setEditPart(p); setPartOpen(true) }} className="flex w-full items-start gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3 text-left active:bg-slate-50">
              <Package size={22} className="mt-0.5 shrink-0 text-navy-700" />
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-slate-900">{p.description}</div>
                <div className="text-sm text-slate-600">
                  {[p.part_number, `${Number(p.qty)} × ${p.supplied_by === 'client' ? 'del cliente' : formatMoney(Number(p.unit_cost))}`, !p.received_at && (p.eta ? `llega ${formatDate(p.eta)}` : 'falta que llegue')].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="text-right text-base font-bold text-slate-900">{p.supplied_by === 'client' ? <span className="text-sm text-slate-500">No se cobra</span> : formatMoney(Number(p.qty) * Number(p.unit_cost))}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Fotos">
        <PhotoSection workOrderId={wo.id} photos={photos} onChange={reload} />
      </Section>

      <Section title="Prueba en el agua">
        <div className="space-y-3">
          <Toggle checked={wo.sea_trial_required} onChange={(v) => patch({ sea_trial_required: v })} label="Este trabajo necesita prueba en el agua" hint="Motor, propulsión o electricidad" />
          {wo.sea_trial_required && (
            <>
              <Choice columns={1} value={wo.sea_trial_method} onChange={(v) => patch({ sea_trial_method: v, sea_trial_done: v === 'not_allowed' ? false : wo.sea_trial_done })} options={SEA_TRIAL_METHODS} />
              {wo.sea_trial_method && wo.sea_trial_method !== 'not_allowed' && (
                <Toggle checked={wo.sea_trial_done} onChange={(v) => patch({ sea_trial_done: v })} label="Prueba hecha y todo bien" />
              )}
              <AutoText label="Notas de la prueba" value={wo.sea_trial_notes} onSave={(v) => patch({ sea_trial_notes: v })} rows={2} />
            </>
          )}
        </div>
      </Section>

      <Section title="Total">
        <div className="space-y-2">
          <Toggle checked={wo.charge_ivu_labor} onChange={(v) => patch({ charge_ivu_labor: v })} label="Cobrar IVU en mano de obra" />
          <Toggle checked={wo.charge_ivu_parts} onChange={(v) => patch({ charge_ivu_parts: v })} label="Cobrar IVU en piezas" />
        </div>
        <dl className="mt-3 rounded-2xl border-2 border-slate-200 bg-white px-4 text-lg">
          <div className="flex justify-between border-b border-slate-200 py-2"><dt>Mano de obra</dt><dd>{formatMoney(totals.labor)}</dd></div>
          <div className="flex justify-between border-b border-slate-200 py-2"><dt>Piezas</dt><dd>{formatMoney(totals.parts)}</dd></div>
          <div className="flex justify-between border-b border-slate-200 py-2"><dt>IVU {percent(mech.ivu_rate)}</dt><dd>{formatMoney(totals.ivu)}</dd></div>
          <div className="flex justify-between py-3 text-2xl font-extrabold text-navy-900"><dt>TOTAL</dt><dd>{formatMoney(totals.total)}</dd></div>
        </dl>
      </Section>

      <Section title="Estimado">
        {wo.estimate_approved_at ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-base font-semibold text-emerald-900">
            <CheckCircle2 /> El cliente lo aprobó el {formatDate(wo.estimate_approved_at)}
          </p>
        ) : (
          <div className="space-y-3">
            {client.phone && (
              <LinkButton href={whatsappLink(client.phone, estimateMsg)} external variant="primary">
                <MessageCircle size={22} /> Enviar estimado por WhatsApp
              </LinkButton>
            )}
            <LinkButton href={`/d/${wo.public_token}`} external><FileText size={20} /> Ver el estimado</LinkButton>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => patch({ estimate_approved_at: new Date().toISOString(), policies_accepted_version: mech.policies_version, status: wo.status === 'estimate' ? 'approved' : wo.status })}
            >
              <ThumbsUp /> El cliente aprobó
            </Button>
            {<p className="text-sm text-slate-500">Al aprobar, el cliente acepta tus políticas de garantía (versión {mech.policies_version}).</p>}
          </div>
        )}
      </Section>

      <Section title="Factura">
        {!invoice ? (
          <Button disabled={busy} onClick={makeInvoice}><Receipt /> {busy ? 'Haciendo factura…' : 'Hacer factura'}</Button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xl font-extrabold text-violet-950">Factura #{invoice.number}</span>
                <span className="text-xl font-extrabold text-violet-950">{formatMoney(Number(invoice.total))}</span>
              </div>
              <div className="mt-1 text-base text-violet-900">
                {invoice.paid_at ? `Pagada el ${formatDate(invoice.paid_at)} · ${labelOf(PAYMENT_METHODS, invoice.payment_method)}` : 'Falta cobrar'}
              </div>
            </div>
            {invoiceOutdated && (
              <Button variant="secondary" disabled={busy} onClick={makeInvoice}>Actualizar factura con el total nuevo ({formatMoney(totals.total)})</Button>
            )}
            {!mech.ath_movil_number && !invoice.paid_at && (
              <Link to="/mas/negocio" className="block rounded-xl bg-slate-100 p-3 text-base text-slate-700">
                La factura no muestra ATH Móvil. Si quieres que salga, ponlo en <b className="text-navy-700 underline">Más → Mi negocio</b>.
              </Link>
            )}
            {client.phone && (
              <LinkButton href={whatsappLink(client.phone, invoiceMsg)} external variant="primary"><MessageCircle size={22} /> Enviar factura por WhatsApp</LinkButton>
            )}
            <LinkButton href={`/d/${invoice.public_token}`} external><ExternalLink size={20} /> Ver / imprimir factura</LinkButton>
            {invoice.paid_at ? (
              <Button variant="ghost" disabled={busy} onClick={() => markPaid(false)}>Desmarcar pagada</Button>
            ) : (
              <Button disabled={busy} onClick={() => setPayOpen(true)} className="bg-emerald-700 active:bg-emerald-800"><CheckCircle2 /> Marcar pagada</Button>
            )}
          </div>
        )}
      </Section>

      <Sheet open={payOpen} title="¿Cómo te pagó?" onClose={() => setPayOpen(false)}>
        <div className="space-y-3">
          <Choice value={payMethod} onChange={setPayMethod} options={PAYMENT_METHODS} />
          <Button disabled={busy} onClick={() => markPaid(true)} className="bg-emerald-700 active:bg-emerald-800"><CheckCircle2 /> Marcar pagada</Button>
          <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancelar</Button>
        </div>
      </Sheet>

      <PartSheet open={partOpen} workOrderId={wo.id} part={editPart} onClose={() => setPartOpen(false)} onSaved={reload} />

      {!invoice && !embedded && (
        <ConfirmDelete
          label="Borrar trabajo"
          question="¿Borrar este trabajo?"
          detail="Se borran también sus piezas y fotos. Esto no se puede deshacer."
          onConfirm={async () => {
            if (photos.length) await db().storage.from('photos').remove(photos.map((p) => p.storage_path))
            must(await db().from('work_orders').delete().eq('id', wo.id))
            navigate('/trabajos', { replace: true })
          }}
        />
      )}
    </>
  )
}
