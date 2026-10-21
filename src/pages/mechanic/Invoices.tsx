import { useWords } from '../../lib/trade'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { balanceOf, loadMoney } from '../../lib/money'
import { formatDate, formatMoney } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { BackTitle, EmptyState, ErrorBox, Input, Loading } from '../../components/ui'
import { Receipt } from 'lucide-react'

function plain(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Todas las facturas hechas (la más nueva primero). Se abre la factura para verla o sacarla en PDF. */
export default function Invoices() {
  const w = useWords()
  const { data, loading, error, reload } = useLoad(loadMoney, [])
  const [search, setSearch] = useState('')
  const list = useMemo(() => {
    const term = plain(search.trim()).replace(/^#/, '')
    return (data ?? [])
      .filter((r) => r.invoice)
      .filter((r) => !term || plain(`${r.invoice!.number} ${r.boats.clients.full_name} ${r.boats.name}`).includes(term))
      .sort((a, b) => b.invoice!.number.localeCompare(a.invoice!.number))
  }, [data, search])

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se pudo cargar.'} onRetry={reload} />

  return (
    <>
      <BackTitle subtitle="Tócala para verla o sacarla en PDF">Todas las facturas</BackTitle>
      <div className="relative mb-3">
        <Search size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input type="search" aria-label="Buscar factura" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Cliente, ${w.item} o número`} className="pl-12" />
      </div>
      {list.length === 0 && <EmptyState icon={Receipt} title={search ? 'No sale ninguna' : 'Todavía no hay facturas'} text={search ? 'Prueba con otro nombre o número.' : 'Cuando hagas una factura sale aquí.'} />}
      <div className="space-y-2">
        {list.map((r) => {
          const owe = balanceOf(r)
          const paid = Boolean(r.invoice!.paid_at)
          return (
            <a key={r.id} href={`/d/${r.invoice!.public_token}`} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200 active:bg-slate-50">
              <span className="shrink-0 rounded-lg bg-navy-50 px-2 py-1 text-sm font-extrabold text-navy-800">#{r.invoice!.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-slate-900">{r.boats.clients.full_name}</span>
                <span className="block truncate text-sm text-slate-600">{r.boats.name} · {formatDate(r.invoice!.created_at)}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-base font-extrabold text-navy-900">{formatMoney(Number(r.invoice!.total))}</span>
                <span className={`block text-sm font-bold ${paid ? 'text-emerald-700' : 'text-red-700'}`}>{paid ? 'Pagada ✓' : `Debe ${formatMoney(owe)}`}</span>
              </span>
            </a>
          )
        })}
      </div>
    </>
  )
}
