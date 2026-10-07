import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertTriangle, Banknote, Boxes, Calculator, Camera, CheckCircle2, Clock, CreditCard, ExternalLink, FileText, HandCoins, ListChecks, MessageCircle, Package, Plus, Receipt, Ship, Smartphone, ThumbsUp, Waves, Wrench, CalendarClock, ScrollText, type LucideIcon } from 'lucide-react'
import { PAYMENT_METHODS, SEA_TRIAL_METHODS, WORK_ORDER_STATUS, WORK_STEPS, labelOf } from '../lib/catalog'
import { db } from '../lib/db'
import { formatDate, formatMoney, formatTime } from '../lib/format'
import { whatsappLink } from '../lib/links'
import { computeTotals, percent } from '../lib/totals'
import type { Client, Invoice, Mechanic, Part, Photo, WorkOrder } from '../lib/types'
import { must, num, useLoad } from '../lib/useLoad'
import { useAuth } from '../auth/AuthProvider'
import ConfirmDelete from './ConfirmDelete'
import NextService from './NextService'
import PartSheet from './PartSheet'
import { WhatsAppIcon } from './BrandIcons'
import { PackagePicker, SavePackageSheet } from './PackageSheets'
import { PACKAGES_ENABLED, itemsFromJob } from '../lib/packages'
import PhotoSection from './PhotoSection'
import { Sheet } from './Sheet'
import { BackTitle, Button, Choice, ErrorBox, Field, IconBadge, Input, LinkButton, Loading, Pill, Textarea, Toggle, type Tone } from './ui'

type Boat = { id: string; name: string; clients: Pick<Client, 'id' | 'full_name' | 'phone'> }

/** Cómo paga el cliente: cada forma con su ícono y color para reconocerla rápido. */
const PAY_ICONS: Record<string, { icon: LucideIcon; tone: Tone }> = {
  ath_movil: { icon: Smartphone, tone: 'orange' },
  cash: { icon: Banknote, tone: 'green' },
  check: { icon: ScrollText, tone: 'blue' },
  other: { icon: CreditCard, tone: 'violet' },
}

function Section({ title, icon, tone = 'navy', children, right }: { title: string; icon?: LucideIcon; tone?: Tone; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-navy-900">{icon && <IconBadge icon={icon} tone={tone} size="sm" />}{title}</h2>
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
  const [partKind, setPartKind] = useState<Part['kind']>('part')
  const [skipNext, setSkipNext] = useState(false)
  const [pkgOpen, setPkgOpen] = useState(false)
  const [savePkgOpen, setSavePkgOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payMethod, setPayMethod] = useState<NonNullable<Invoice['payment_method']>>('ath_movil')
  const [saved, setSaved] = useState('')
  const [payWay, setPayWay] = useState<'any' | 'ath' | 'cash' | null>(null)
  const [busy, setBusy] = useState(false)
  const [laborHours, setLaborHours] = useState('')
  const [laborRate, setLaborRate] = useState('')

  const { data, loading, error, reload, setData } = useLoad(async () => {
    const wo = must(await db().from('work_orders').select('*, boats(id, name, clients(id, full_name, phone))').eq('id', id!).single()) as WorkOrder & { boats: Boat }
    const [parts, photos, invoice, mech, next] = await Promise.all([
      db().from('work_order_parts').select('*').eq('work_order_id', id!).order('created_at'),
      db().from('photos').select('*').eq('work_order_id', id!).order('taken_at'),
      db().from('invoices').select('*').eq('work_order_id', id!).maybeSingle(),
      db().from('mechanics').select('*').eq('profile_id', session!.user.id).single(),
      db().from('maintenance_schedules').select('service_type, due_date').eq('work_order_id', id).limit(1),
    ])
    return { wo, parts: must(parts) as Part[], photos: must(photos) as Photo[], invoice: (invoice.data as Invoice | null) ?? null, mech: must(mech) as Mechanic, next: ((next.data ?? [])[0] as { service_type: string; due_date: string } | undefined) ?? null }
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

  function flash(msg: string) {
    setSaved(msg)
    setTimeout(() => setSaved(''), 2500)
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
    setBusy(true)
    let invoiceId = invoice?.id
    if (!invoiceId) {
      // "Ya me pagó" sin haber hecho factura: se hace sola para que quede el récord
      const { data: newId, error } = await db().rpc('create_invoice', { p_wo: wo.id })
      if (error) {
        setBusy(false)
        setSaved('No se pudo guardar el pago')
        return
      }
      invoiceId = newId as string
    }
    await db().from('invoices').update(paid ? { paid_at: new Date().toISOString(), payment_method: payMethod } : { paid_at: null, payment_method: null }).eq('id', invoiceId)
    await db().from('work_orders').update({ status: paid ? 'paid' : 'invoiced' }).eq('id', wo.id)
    setBusy(false)
    setPayOpen(false)
    reload()
  }

  // Avisos (no bloquean)
  const warnings: string[] = []
  const boughtParts = parts.some((p) => p.kind !== 'service')
  if (boughtParts && !photos.some((p) => p.kind === 'old_part')) warnings.push('Falta foto de la pieza vieja.')
  if (boughtParts && !photos.some((p) => p.kind === 'new_part')) warnings.push('Falta foto de la pieza nueva.')
  if (wo.sea_trial_required && wo.sea_trial_method !== 'not_allowed' && !wo.sea_trial_done) warnings.push('Falta la prueba en el agua.')
  if (wo.sea_trial_method === 'not_allowed') warnings.push('Sin prueba en el agua: la garantía queda anulada (sale en la factura).')
  if (parts.some((p) => p.kind !== 'service' && !p.received_at)) warnings.push('Hay piezas que todavía no han llegado.')

  const estimateMsg = `Hola ${firstName}, te envío el estimado para el bote ${boat.name}: total ${formatMoney(totals.total)}. Lo puedes ver aquí: ${link(wo.public_token)} . Si estás de acuerdo, contéstame "aprobado". ${profile?.full_name ?? ''}`.trim()
  const way = payWay ?? (mech.ath_movil_number ? 'any' : 'cash')
  const payText =
    way === 'ath' && mech.ath_movil_number ? ` Puedes pagar por ATH Móvil al ${mech.ath_movil_number}.`
    : way === 'any' && mech.ath_movil_number ? ` Puedes pagar por ATH Móvil al ${mech.ath_movil_number}, o en efectivo o cheque.`
    : ' El pago es en efectivo o cheque.'
  const invoiceMsg = invoice
    ? `Hola ${firstName}, aquí está la factura #${invoice.number} del bote ${boat.name} por ${formatMoney(Number(invoice.total))}: ${link(invoice.public_token)}?pago=${way} .` + payText + ` ¡Gracias! ${profile?.full_name ?? ''}`
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

      {/* Al terminar: ¿cuándo le toca el próximo servicio? (se puede saltar) */}
      {['done', 'invoiced', 'paid'].includes(wo.status) && (
        data.next ? (
          <p className="mb-3 flex items-center gap-2 rounded-xl bg-sun-400/15 p-3 text-base font-semibold text-navy-900">
            <CalendarClock size={20} className="shrink-0" /> Próximo servicio: {data.next.service_type} · {formatDate(data.next.due_date)}
          </p>
        ) : !skipNext && (
          <div className="mb-3">
            <NextService
              boatId={boat.id}
              workOrderId={wo.id}
              defaultService={parts.find((p) => p.kind === 'service')?.description ?? 'Mantenimiento'}
              onSaved={reload}
              onSkip={() => setSkipNext(true)}
            />
          </div>
        )
      )}

      {warnings.length > 0 && (
        <div className="mb-2 rounded-xl bg-amber-50 p-3 text-base text-amber-900">
          {warnings.map((w) => <div key={w} className="flex gap-2"><AlertTriangle size={20} className="mt-0.5 shrink-0" /> {w}</div>)}
        </div>
      )}

      {!locked && wo.status !== 'invoiced' && (
        <Section title="¿En qué va?" icon={ListChecks} tone="navy">
          <Choice value={wo.status} onChange={setStatus} options={WORK_STEPS} />
        </Section>
      )}

      <Section title="El problema" icon={Wrench} tone="amber">
        <div className="space-y-4">
          <AutoText label="Lo que dice el cliente" value={wo.complaint} onSave={(v) => patch({ complaint: v })} />
          <AutoText label="Diagnóstico (lo que encontraste)" value={wo.diagnosis} onSave={(v) => patch({ diagnosis: v })} rows={4} />
          <AutoText label="Lo que se hizo" hint="Sale en la factura para el cliente" value={wo.work_done} onSave={(v) => patch({ work_done: v })} rows={4} />
        </div>
      </Section>

      <Section title="Mano de obra" icon={Clock} tone="blue">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Horas">
            <Input inputMode="decimal" value={laborHours} onChange={(e) => setLaborHours(e.target.value)} onBlur={() => patch({ labor_hours: num(laborHours) ?? 0 })} />
          </Field>
          <Field label="Tarifa por hora ($)">
            <Input inputMode="decimal" value={laborRate} onChange={(e) => setLaborRate(e.target.value)} onBlur={() => patch({ labor_rate: num(laborRate) ?? 0 })} />
          </Field>
        </div>
        <p className="mt-2 text-right text-lg font-bold text-navy-900">{formatMoney(totals.hours)}</p>
        <p className="text-right text-sm text-slate-500">Si cobras por trabajo y no por hora, déjalo en 0 y usa “+ Servicio”.</p>
      </Section>

      <Section title="Servicios y piezas" icon={Package} tone="teal">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button onClick={() => { setEditPart(null); setPartKind('service'); setPartOpen(true) }} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-navy-800 text-lg font-bold text-white active:bg-navy-900">
            <Plus size={22} /> Servicio
          </button>
          <button onClick={() => { setEditPart(null); setPartKind('part'); setPartOpen(true) }} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-navy-800 text-lg font-bold text-navy-800 active:bg-navy-50">
            <Plus size={22} /> Pieza
          </button>
          {PACKAGES_ENABLED && <button onClick={() => setPkgOpen(true)} className="col-span-2 flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy-800 text-lg font-bold text-navy-800 active:bg-navy-50">
            <Boxes size={22} /> Paquete (todo de un toque)
          </button>}
        </div>
        {parts.length === 0 && <p className="text-base text-slate-600">Todavía no hay servicios ni piezas.</p>}
        <div className="space-y-2">
          {[...parts].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'service' ? -1 : 1)).map((p) => (
            <button key={p.id} onClick={() => { setEditPart(p); setPartKind(p.kind); setPartOpen(true) }} className="flex w-full items-start gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3 text-left active:bg-slate-50">
              {p.kind === 'service' ? <Wrench size={22} className="mt-0.5 shrink-0 text-navy-700" /> : <Package size={22} className="mt-0.5 shrink-0 text-navy-700" />}
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-slate-900">{p.description}</div>
                <div className="text-sm text-slate-600">
                  {p.kind === 'service'
                    ? ['Servicio', Number(p.qty) !== 1 && `${Number(p.qty)} × ${formatMoney(Number(p.unit_cost))}`].filter(Boolean).join(' · ')
                    : [p.part_number, `${Number(p.qty)} × ${p.supplied_by === 'client' ? 'del cliente' : formatMoney(Number(p.unit_cost))}`, !p.received_at && (p.eta ? `llega ${formatDate(p.eta)}` : 'falta que llegue')].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="text-right text-base font-bold text-slate-900">{p.supplied_by === 'client' ? <span className="text-sm text-slate-500">No se cobra</span> : formatMoney(Number(p.qty) * Number(p.unit_cost))}</div>
            </button>
          ))}
        </div>
        {PACKAGES_ENABLED && itemsFromJob(parts).length >= 2 && (
          <button onClick={() => setSavePkgOpen(true)} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 text-base font-bold text-navy-700 underline underline-offset-4">
            <Boxes size={18} /> Guardar como paquete
          </button>
        )}
      </Section>

      <Section title="Fotos" icon={Camera} tone="violet">
        <PhotoSection workOrderId={wo.id} photos={photos} onChange={reload} />
      </Section>

      <Section title="Prueba en el agua" icon={Waves} tone="blue">
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

      <Section title="Total" icon={Calculator} tone="navy">
        <div className="space-y-2">
          <Toggle checked={wo.charge_ivu_labor} onChange={(v) => patch({ charge_ivu_labor: v })} label="Cobrar IVU en mano de obra" />
          <Toggle checked={wo.charge_ivu_parts} onChange={(v) => patch({ charge_ivu_parts: v })} label="Cobrar IVU en piezas" />
        </div>
        <dl className="mt-3 rounded-2xl border-2 border-slate-200 bg-white px-4 text-lg">
          <div className="flex justify-between border-b border-slate-200 py-2"><dt>Mano de obra y servicios</dt><dd>{formatMoney(totals.labor)}</dd></div>
          <div className="flex justify-between border-b border-slate-200 py-2"><dt>Piezas</dt><dd>{formatMoney(totals.parts)}</dd></div>
          <div className="flex justify-between border-b border-slate-200 py-2"><dt>IVU {percent(mech.ivu_rate)}</dt><dd>{formatMoney(totals.ivu)}</dd></div>
          <div className="flex justify-between py-3 text-2xl font-extrabold text-navy-900"><dt>TOTAL</dt><dd>{formatMoney(totals.total)}</dd></div>
        </dl>
      </Section>

      <Section title="Estimado" icon={FileText} tone="amber">
        {wo.estimate_approved_at ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-base font-semibold text-emerald-900">
            <CheckCircle2 />
            {wo.estimate_approved_by === 'client'
              ? `El cliente lo aprobó desde el link el ${formatDate(wo.estimate_approved_at)} a las ${formatTime(wo.estimate_approved_at)}`
              : `Aprobado el ${formatDate(wo.estimate_approved_at)} (marcado por ti)`}
          </p>
        ) : (
          <div className="space-y-3">
            {client.phone && (
              <LinkButton href={whatsappLink(client.phone, estimateMsg)} external variant="whatsapp">
                <WhatsAppIcon size={24} /> Enviar estimado por WhatsApp
              </LinkButton>
            )}
            <LinkButton href={`/d/${wo.public_token}`}><FileText size={20} /> Ver el estimado</LinkButton>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => patch({ estimate_approved_at: new Date().toISOString(), estimate_approved_by: 'mechanic', approval_seen_at: new Date().toISOString(), policies_accepted_version: mech.policies_version, status: wo.status === 'estimate' ? 'approved' : wo.status })}
            >
              <ThumbsUp /> El cliente me dijo que sí
            </Button>
            {<p className="text-sm text-slate-500">El cliente puede aprobarlo él mismo con el botón verde del link. Si te dice que sí por teléfono, toca “El cliente me dijo que sí”.</p>}
          </div>
        )}
      </Section>

      <Section title="Cobrar" icon={HandCoins} tone="green">
        <div className="space-y-3">
          {invoice && (
            <div className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xl font-extrabold text-violet-950">Factura #{invoice.number}</span>
                <span className="text-xl font-extrabold text-violet-950">{formatMoney(Number(invoice.total))}</span>
              </div>
              <div className="mt-1 text-base text-violet-900">
                {invoice.paid_at ? (
                  <span className="flex items-center gap-2">
                    {invoice.payment_method && <IconBadge icon={PAY_ICONS[invoice.payment_method].icon} tone={PAY_ICONS[invoice.payment_method].tone} size="sm" />}
                    Pagada el {formatDate(invoice.paid_at)} · {labelOf(PAYMENT_METHODS, invoice.payment_method)}
                  </span>
                ) : 'Falta cobrar'}
              </div>
            </div>
          )}

          {!invoice?.paid_at && (
            <>
              <Field label="¿Cómo te va a pagar?" hint="Es lo que dice la factura que le envías">
                {mech.ath_movil_number ? (
                  <Choice
                    columns={1}
                    value={way}
                    onChange={setPayWay}
                    options={[
                      { value: 'any', label: 'ATH Móvil o efectivo', icon: HandCoins, tone: 'teal' },
                      { value: 'ath', label: 'Solo ATH Móvil', icon: Smartphone, tone: 'orange' },
                      { value: 'cash', label: 'Efectivo o cheque', icon: Banknote, tone: 'green' },
                    ]}
                  />
                ) : (
                  <Link to="/mas/negocio" className="block rounded-xl bg-slate-100 p-3 text-base text-slate-700">
                    La factura dice <b>efectivo o cheque</b>. Si también quieres cobrar por ATH Móvil, pon tu número en <b className="text-navy-700 underline">Más → Mi negocio</b>.
                  </Link>
                )}
              </Field>

              {!invoice ? (
                <Button disabled={busy} onClick={makeInvoice}><Receipt /> {busy ? 'Haciendo factura…' : 'Hacer factura'}</Button>
              ) : (
                <>
                  {invoiceOutdated && (
                    <Button variant="secondary" disabled={busy} onClick={makeInvoice}>Actualizar factura con el total nuevo ({formatMoney(totals.total)})</Button>
                  )}
                  {client.phone && (
                    <LinkButton href={whatsappLink(client.phone, invoiceMsg)} external variant="whatsapp"><WhatsAppIcon size={24} /> Enviar factura por WhatsApp</LinkButton>
                  )}
                  <LinkButton href={`/d/${invoice.public_token}?pago=${way}`}><ExternalLink size={20} /> Ver / imprimir factura</LinkButton>
                </>
              )}

              <Button disabled={busy} onClick={() => setPayOpen(true)} className="bg-emerald-700! active:bg-emerald-800!"><CheckCircle2 /> Ya me pagó</Button>
              {!invoice && <p className="text-sm text-slate-500">Si ya te pagaron, toca “Ya me pagó”: la factura se hace sola para que quede el récord.</p>}
            </>
          )}

          {invoice?.paid_at && (
            <>
              <LinkButton href={`/d/${invoice.public_token}`}><ExternalLink size={20} /> Ver / imprimir factura</LinkButton>
              <Button variant="ghost" disabled={busy} onClick={() => markPaid(false)}>Desmarcar pagada</Button>
            </>
          )}
        </div>
      </Section>

      <Sheet open={payOpen} title="¿Cómo te pagó?" onClose={() => setPayOpen(false)}>
        <div className="space-y-3">
          <Choice value={payMethod} onChange={setPayMethod} options={PAYMENT_METHODS.map((m) => ({ ...m, ...PAY_ICONS[m.value] }))} />
          <Button disabled={busy} onClick={() => markPaid(true)} className="bg-emerald-700! active:bg-emerald-800!"><CheckCircle2 /> Guardar pago</Button>
          <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancelar</Button>
        </div>
      </Sheet>

      <PackagePicker open={pkgOpen} workOrderId={wo.id} onClose={() => setPkgOpen(false)} onAdded={(n) => { reload(); flash(`Añadido: ${n} ✓`) }} />
      <SavePackageSheet open={savePkgOpen} items={itemsFromJob(parts)} onClose={() => setSavePkgOpen(false)} onSaved={(n) => flash(`Paquete guardado: ${n} ✓`)} />
      <PartSheet open={partOpen} kind={partKind} workOrderId={wo.id} part={editPart} onClose={() => setPartOpen(false)} onSaved={reload} />

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
