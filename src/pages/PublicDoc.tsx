import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { CheckCircle2, MessageCircle, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { PAYMENT_METHODS, SEA_TRIAL_METHODS, labelOf } from '../lib/catalog'
import { formatDate, formatMoney, formatTime } from '../lib/format'
import { whatsappLink } from '../lib/links'
import { percent } from '../lib/totals'
import { DEFAULT_BRAND, logoUrl } from '../lib/brand'

interface Doc {
  kind: 'invoice' | 'estimate'
  number: string | null
  date: string
  paid_at: string | null
  payment_method: string | null
  business: { name: string; owner: string | null; phone: string | null; email: string | null; town: string | null; ath_movil: string | null; logo_path: string | null; brand_color: string | null }
  client: { name: string }
  boat: { name: string; make: string | null; model: string | null; year: number | null; marina: string | null; slip: string | null; town: string | null }
  work: {
    complaint: string | null; diagnosis: string | null; work_done: string | null; status: string; approved_at: string | null
    sea_trial_required: boolean; sea_trial_done: boolean; sea_trial_method: string | null; sea_trial_notes: string | null
  }
  parts: { description: string; part_number: string | null; qty: number; unit_cost: number; supplied_by: 'client' | 'mechanic' }[]
  totals: { labor_hours: number; labor_rate: number; labor: number; parts: number; ivu: number; ivu_rate: number; ivu_on_labor: boolean; ivu_on_parts: boolean; total: number }
  warranty_days: number
  policies: string
}

/** Pagar por ATH Móvil: el cliente copia el número y el total y los pega en su app. */
function AthBox({ number, total }: { number: string; total: number }) {
  const [copied, setCopied] = useState('')
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(''), 2500)
    } catch {
      setCopied('')
    }
  }
  return (
    <div className="mt-4 rounded-xl bg-orange-50 p-4 text-center">
      <p className="text-lg">Paga por <b>ATH Móvil</b> al</p>
      <p className="text-3xl font-extrabold tracking-wide">{number}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 print:hidden">
        <button onClick={() => copy(number.replace(/D/g, ''), 'número')} className="min-h-14 rounded-xl bg-orange-500 px-3 text-base font-bold text-white active:bg-orange-600">Copiar número</button>
        <button onClick={() => copy(total.toFixed(2), 'total')} className="min-h-14 rounded-xl border-2 border-orange-500 bg-white px-3 text-base font-bold text-orange-700">Copiar total</button>
      </div>
      <p className="mt-2 min-h-6 text-sm text-slate-600 print:hidden">{copied ? `✓ Se copió el ${copied}. Ábrelo en tu app de ATH Móvil y pégalo.` : 'Copia el número, abre tu ATH Móvil y pégalo.'}</p>
    </div>
  )
}

/** El cliente aprueba el estimado él mismo (o pregunta por WhatsApp). */
function ApproveBox({ token, doc, color, onApproved }: { token: string; doc: Doc; color: string; onApproved: (at: string) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function approve() {
    if (!supabase) return
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('approve_estimate', { p_token: token })
    setBusy(false)
    if (error || !data) return setError('No se pudo aprobar. Revisa la señal e intenta otra vez.')
    onApproved((data as { approved_at: string }).approved_at)
  }

  const question = `Hola, tengo una pregunta sobre el estimado del bote ${doc.boat.name} (${formatMoney(Number(doc.totals.total))}).`
  return (
    <div className="mt-5 space-y-3 rounded-2xl border-2 p-4 print:hidden" style={{ borderColor: color }}>
      {!confirming ? (
        <>
          <p className="text-center text-lg font-bold">¿Estás de acuerdo con este estimado?</p>
          <button onClick={() => setConfirming(true)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-lg font-bold text-white active:bg-emerald-800">
            <CheckCircle2 /> Aprobar estimado
          </button>
        </>
      ) : (
        <>
          <p className="text-base">Al aprobar, aceptas el total de <b>{formatMoney(Number(doc.totals.total))}</b> y las políticas de garantía de <b>{doc.business.name}</b> que salen abajo.</p>
          <button onClick={approve} disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-lg font-bold text-white active:bg-emerald-800 disabled:bg-slate-400">
            <CheckCircle2 /> {busy ? 'Aprobando…' : 'Sí, apruebo'}
          </button>
          <button onClick={() => setConfirming(false)} className="min-h-12 w-full text-base font-bold text-slate-600 underline underline-offset-4">Todavía no</button>
        </>
      )}
      {doc.business.phone && (
        <a href={whatsappLink(doc.business.phone, question)} target="_blank" rel="noreferrer" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-300 text-lg font-bold text-slate-800">
          <MessageCircle /> Tengo una pregunta
        </a>
      )}
      {error && <p className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
    </div>
  )
}

/** Estimado o factura que ve el cliente desde el link de WhatsApp (no necesita cuenta). */
export default function PublicDoc() {
  const { token } = useParams()
  const pago = useSearchParams()[0].get('pago')
  const [doc, setDoc] = useState<Doc | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')

  useEffect(() => {
    if (!supabase || !token) return setState('missing')
    supabase.rpc('get_public_document', { p_token: token }).then(({ data, error }) => {
      if (error || !data) return setState('missing')
      setDoc(data as Doc)
      setState('ok')
      document.title = (data as Doc).kind === 'invoice' ? `Factura ${(data as Doc).number}` : 'Estimado'
    })
  }, [token])

  if (state === 'loading') return <p className="p-8 text-center text-lg">Cargando…</p>
  if (state === 'missing' || !doc) return <p className="p-8 text-center text-lg">No se encontró este documento. Pide el link otra vez.</p>

  const t = doc.totals
  const color = doc.business.brand_color || DEFAULT_BRAND
  const logo = logoUrl(doc.business.logo_path)
  const isInvoice = doc.kind === 'invoice'
  const ivuOn = [t.ivu_on_labor && 'mano de obra', t.ivu_on_parts && 'piezas'].filter(Boolean).join(' y ')
  const boatLine = [[doc.boat.make, doc.boat.model, doc.boat.year].filter(Boolean).join(' '), [doc.boat.marina, doc.boat.slip && `muelle ${doc.boat.slip}`, doc.boat.town].filter(Boolean).join(', ')].filter(Boolean).join(' · ')

  return (
    <div className="min-h-full bg-slate-100 py-4 print:bg-white print:py-0">
      <article className="mx-auto max-w-2xl bg-white px-5 py-6 text-slate-900 shadow print:max-w-none print:shadow-none">
        {/* Encabezado */}
        <header className="flex flex-col gap-3 border-b-4 pb-4 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: color }}>
          <div className="flex items-start gap-3">
            {logo && <img src={logo} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-black object-contain" />}
            <div>
            <h1 className="text-2xl font-extrabold text-navy-900">{doc.business.name}</h1>
            <p className="text-base text-slate-600">{[doc.business.owner !== doc.business.name && doc.business.owner, doc.business.town && `${doc.business.town}, PR`].filter(Boolean).join(' · ')}</p>
            <p className="whitespace-nowrap text-base text-slate-600">{[doc.business.phone, doc.business.email].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-2xl font-extrabold" style={{ color }}>{isInvoice ? `FACTURA #${doc.number}` : 'ESTIMADO'}</div>
            <div className="text-base text-slate-600">{formatDate(doc.date)}</div>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-4 text-base">
          <div>
            <div className="text-sm font-bold uppercase text-slate-500">Cliente</div>
            <div className="font-semibold">{doc.client.name}</div>
          </div>
          <div>
            <div className="text-sm font-bold uppercase text-slate-500">Bote</div>
            <div className="font-semibold">{doc.boat.name}</div>
            {boatLine && <div className="text-slate-600">{boatLine}</div>}
          </div>
        </section>

        {[['Problema reportado', doc.work.complaint], ['Diagnóstico', doc.work.diagnosis], ['Trabajo realizado', doc.work.work_done]].map(([label, text]) =>
          text ? (
            <section key={label} className="mt-4">
              <div className="text-sm font-bold uppercase text-slate-500">{label}</div>
              <p className="whitespace-pre-line text-base">{text}</p>
            </section>
          ) : null,
        )}

        {/* Detalle */}
        <table className="mt-5 w-full text-sm sm:text-base">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-sm uppercase text-slate-500">
              <th className="py-2">Descripción</th>
              <th className="py-2 pl-2 text-right">Cant.</th>
              <th className="py-2 pl-3 text-right">Precio</th>
              <th className="py-2 pl-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {Number(t.labor_hours) > 0 && (
              <tr className="border-b border-slate-200">
                <td className="py-2">Mano de obra</td>
                <td className="whitespace-nowrap py-2 pl-3 text-right">{Number(t.labor_hours)} h</td>
                <td className="whitespace-nowrap py-2 pl-3 text-right">{formatMoney(Number(t.labor_rate))}</td>
                <td className="whitespace-nowrap py-2 pl-3 text-right">{formatMoney(Number(t.labor))}</td>
              </tr>
            )}
            {doc.parts.map((p, i) => (
              <tr key={i} className="border-b border-slate-200 align-top">
                <td className="py-2">
                  {p.description}
                  {p.part_number && <span className="block text-sm text-slate-500"># {p.part_number}</span>}
                  {p.supplied_by === 'client' && <span className="block text-sm text-slate-500">Pieza suplida por el cliente: solo se garantiza la instalación.</span>}
                </td>
                <td className="whitespace-nowrap py-2 pl-3 text-right">{Number(p.qty)}</td>
                <td className="whitespace-nowrap py-2 pl-3 text-right">{p.supplied_by === 'client' ? '—' : formatMoney(Number(p.unit_cost))}</td>
                <td className="whitespace-nowrap py-2 pl-3 text-right">{p.supplied_by === 'client' ? 'No se cobra' : formatMoney(Number(p.qty) * Number(p.unit_cost))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 max-w-xs text-base">
          <div className="flex justify-between py-1"><dt>Mano de obra</dt><dd>{formatMoney(Number(t.labor))}</dd></div>
          <div className="flex justify-between py-1"><dt>Piezas</dt><dd>{formatMoney(Number(t.parts))}</dd></div>
          <div className="flex justify-between py-1"><dt>IVU {percent(t.ivu_rate)}{ivuOn ? ` (${ivuOn})` : ''}</dt><dd>{formatMoney(Number(t.ivu))}</dd></div>
          <div className="mt-1 flex justify-between border-t-2 py-2 text-2xl font-extrabold" style={{ borderColor: color, color }}><dt>TOTAL</dt><dd>{formatMoney(Number(t.total))}</dd></div>
        </dl>

        {/* Pago */}
        {isInvoice && (
          doc.paid_at ? (
            <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-center text-xl font-extrabold text-emerald-800">
              PAGADA el {formatDate(doc.paid_at)}{doc.payment_method ? ` · ${labelOf(PAYMENT_METHODS, doc.payment_method)}` : ''}
            </p>
          ) : (
            <>
              {/* ?pago=ath | cash | any (lo escoge el mecánico al enviar la factura) */}
              {pago !== 'cash' && doc.business.ath_movil && <AthBox number={doc.business.ath_movil} total={Number(t.total)} />}
              {(pago === 'cash' || !doc.business.ath_movil) && (
                <p className="mt-4 rounded-xl bg-slate-100 p-4 text-center text-lg">Pago en <b>efectivo o cheque</b> a {doc.business.name}.</p>
              )}
              {pago !== 'cash' && pago !== 'ath' && doc.business.ath_movil && (
                <p className="mt-2 text-center text-base text-slate-600">También puedes pagar en efectivo o cheque.</p>
              )}
            </>
          )
        )}
        {!isInvoice && doc.work.approved_at && (
          <p className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 p-4 text-center text-lg font-bold text-emerald-800">
            <CheckCircle2 /> Aprobado el {formatDate(doc.work.approved_at)} a las {formatTime(doc.work.approved_at)}
          </p>
        )}
        {!isInvoice && !doc.work.approved_at && token && (
          <ApproveBox token={token} doc={doc} color={color} onApproved={(at) => setDoc({ ...doc, work: { ...doc.work, approved_at: at } })} />
        )}

        {/* Prueba en el agua y garantía */}
        {doc.work.sea_trial_required && (
          <section className="mt-5 text-base">
            <div className="text-sm font-bold uppercase text-slate-500">Prueba en el agua</div>
            {doc.work.sea_trial_method === 'not_allowed' ? (
              <p className="font-bold text-red-700">El cliente no permitió la prueba en el agua. La garantía queda anulada.</p>
            ) : doc.work.sea_trial_done ? (
              <p>Hecha ({labelOf(SEA_TRIAL_METHODS, doc.work.sea_trial_method).toLowerCase()}). {doc.work.sea_trial_notes}</p>
            ) : (
              <p>Pendiente.</p>
            )}
          </section>
        )}
        {doc.policies && (
          <section className="mt-5 border-t border-slate-200 pt-3">
            <div className="text-sm font-bold uppercase text-slate-500">Garantía y políticas</div>
            <p className="whitespace-pre-line text-sm text-slate-700">{doc.policies}</p>
          </section>
        )}

        <button onClick={() => window.print()} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl text-lg font-bold text-white print:hidden" style={{ backgroundColor: color }}>
          <Printer /> Guardar PDF / Imprimir
        </button>
        <p className="mt-3 text-center text-xs text-slate-400 print:hidden">Hecho con MarinaPro PR</p>
      </article>
    </div>
  )
}
