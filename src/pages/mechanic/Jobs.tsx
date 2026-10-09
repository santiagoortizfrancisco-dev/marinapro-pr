import { useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, ChevronDown, FileText, HandCoins, Receipt, Zap } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { WhatsAppIcon } from '../../components/BrandIcons'
import PaySheet from '../../components/PaySheet'
import { db } from '../../lib/db'
import { ago, formatDate, formatMoney, todayPR } from '../../lib/format'
import { whatsappLink } from '../../lib/links'
import { loadMoney, owed, payInvoice, reminderMessage, sum, toInvoice, type MoneyRow } from '../../lib/money'
import { must, useLoad } from '../../lib/useLoad'
import { useMechanic } from '../../lib/useMechanic'
import { CARD, EmptyState, ErrorBox, Fab, IconBadge, Loading, PageTitle } from '../../components/ui'

/** Cobros: solo dinero. Quién me debe, qué falta facturar y lo cobrado este mes. */
export default function Jobs() {
  const { profile } = useAuth()
  const { data: mech } = useMechanic()
  const { data, loading, error, reload } = useLoad(loadMoney, [])
  const [paying, setPaying] = useState<MoneyRow | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showPaid, setShowPaid] = useState(false)

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se pudo cargar.'} onRetry={reload} />

  const debt = owed(data)
  const pending = toInvoice(data)
  const month = todayPR().slice(0, 7)
  const paidMonth = data.filter((r) => r.invoice?.paid_at && r.invoice.paid_at.slice(0, 7) >= month)
    .sort((a, b) => b.invoice!.paid_at!.localeCompare(a.invoice!.paid_at!))

  async function invoiceNow(r: MoneyRow) {
    setBusy(r.id)
    must(await db().rpc('create_invoice', { p_wo: r.id }))
    setBusy(null)
    reload()
  }

  return (
    <>
      <PageTitle>Cobros</PageTitle>

      {/* Lo que me deben */}
      <div className={`${CARD} mb-6 flex items-center gap-4 p-4`}>
        <IconBadge icon={HandCoins} tone="orange" size="lg" />
        <div>
          <div className="text-sm font-bold uppercase tracking-wide text-slate-500">Me deben</div>
          <div className="text-3xl font-extrabold text-navy-900">{formatMoney(sum(debt))}</div>
          <div className="text-sm text-slate-600">{debt.length === 0 ? 'Nadie te debe' : `${debt.length} ${debt.length === 1 ? 'factura sin pagar' : 'facturas sin pagar'}`}</div>
        </div>
      </div>

      {debt.length === 0 && pending.length === 0 && paidMonth.length === 0 && (
        <EmptyState icon={Receipt} title="Todavía no hay cobros" text="Cuando hagas una factura sale aquí hasta que te paguen. Para cobrar algo enseguida, toca “Factura rápida”." />
      )}

      {debt.length > 0 && (
        <section id="me-deben" className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-extrabold text-navy-900"><IconBadge icon={HandCoins} tone="orange" size="sm" /> Me deben</h2>
          <div className="space-y-2">
            {debt.map((r) => (
              <article key={r.id} className={`${CARD} p-3`}>
                <Link to={`/trabajos/${r.id}`} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold text-slate-900">{r.boats.clients.full_name}</span>
                    <span className="block truncate text-sm text-slate-600">{r.boats.name} · Factura #{r.invoice!.number} · {ago(r.invoice!.created_at)}</span>
                  </span>
                  <span className="shrink-0 text-xl font-extrabold text-navy-900">{formatMoney(Number(r.invoice!.total))}</span>
                </Link>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {r.boats.clients.phone ? (
                    <a href={whatsappLink(r.boats.clients.phone, reminderMessage(r, mech?.ath_movil_number ?? null, profile?.full_name ?? ''))} target="_blank" rel="noreferrer"
                      className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-[#25D366] text-base font-bold text-white">
                      <WhatsAppIcon size={20} /> Recordarle
                    </a>
                  ) : <span />}
                  <button onClick={() => setPaying(r)} className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-emerald-700 text-base font-bold text-white active:bg-emerald-800">
                    <CheckCircle2 size={20} /> Ya me pagó
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-extrabold text-navy-900"><IconBadge icon={FileText} tone="amber" size="sm" /> Falta hacer factura</h2>
          <div className="space-y-2">
            {pending.map((r) => (
              <article key={r.id} className={`${CARD} flex items-center gap-3 p-3`}>
                <Link to={`/trabajos/${r.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-bold text-slate-900">{r.boats.clients.full_name}</span>
                  <span className="block truncate text-sm text-slate-600">{r.boats.name} · terminado {formatDate(r.completed_at ?? r.created_at)}</span>
                </Link>
                <button disabled={busy === r.id} onClick={() => invoiceNow(r)} className="min-h-12 shrink-0 rounded-xl bg-navy-800 px-3 text-base font-bold text-white disabled:bg-slate-400">
                  {busy === r.id ? '…' : 'Hacer factura'}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {paidMonth.length > 0 && (
        <section className="mb-6">
          <button onClick={() => setShowPaid((v) => !v)} aria-expanded={showPaid} className={`${CARD} flex min-h-14 w-full items-center gap-2 px-3 py-2 text-left`}>
            <IconBadge icon={CheckCircle2} tone="green" size="sm" />
            <span className="flex-1 text-lg font-extrabold text-navy-900">Cobrado este mes</span>
            <span className="text-lg font-extrabold text-emerald-700">{formatMoney(sum(paidMonth))}</span>
            <ChevronDown className={`text-slate-400 transition ${showPaid ? 'rotate-180' : ''}`} />
          </button>
          {showPaid && (
            <div className="mt-2 space-y-1">
              {paidMonth.map((r) => (
                <Link key={r.id} to={`/trabajos/${r.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 text-base">
                  <span className="min-w-0 truncate">{r.boats.clients.full_name} · {r.boats.name}</span>
                  <span className="shrink-0 font-bold">{formatMoney(Number(r.invoice!.total))}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <PaySheet
        open={!!paying}
        total={Number(paying?.invoice?.total ?? 0)}
        onClose={() => setPaying(null)}
        onPay={async (method) => {
          if (!paying?.invoice) return
          await payInvoice(paying.invoice.id, paying.id, method)
          setPaying(null)
          reload()
        }}
      />
      <Fab to="/cobrar" label="Factura rápida" icon={Zap} />
    </>
  )
}
