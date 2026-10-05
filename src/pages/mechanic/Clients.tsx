import { useMemo, useState } from 'react'
import { Search, User, Users } from 'lucide-react'
import { db } from '../../lib/db'
import { must, useLoad } from '../../lib/useLoad'
import { EmptyState, ErrorBox, Fab, Input, Loading, PageTitle, RowLink } from '../../components/ui'

interface Row {
  id: string
  full_name: string
  phone: string | null
  town: string | null
  boats: { name: string }[]
}

/** Quita acentos para buscar "jose" y encontrar "José". */
function plain(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function Clients() {
  const [q, setQ] = useState('')
  const { data, loading, error, reload } = useLoad(
    async () => must(await db().from('clients').select('id, full_name, phone, town, boats(name)').order('full_name')) as Row[],
    [],
  )

  const list = useMemo(() => {
    const term = plain(q.trim())
    if (!data || !term) return data ?? []
    const digits = term.replace(/\D/g, '')
    return data.filter(
      (c) =>
        plain(c.full_name).includes(term) ||
        plain(c.town ?? '').includes(term) ||
        c.boats.some((b) => plain(b.name).includes(term)) ||
        (digits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digits)),
    )
  }, [data, q])

  return (
    <>
      <PageTitle subtitle={data ? `${data.length} ${data.length === 1 ? 'cliente' : 'clientes'}` : undefined}>Clientes</PageTitle>

      {data && data.length > 0 && (
        <div className="relative mb-4">
          <Search size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, bote, pueblo o teléfono" className="pl-12" />
        </div>
      )}

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && data.length === 0 && (
        <EmptyState icon={Users} title="Todavía no tienes clientes" text="Toca “Cliente” abajo para añadir el primero, con su bote y sus motores." />
      )}
      {data && data.length > 0 && list.length === 0 && <p className="py-6 text-center text-base text-slate-600">Nadie con “{q}”.</p>}

      <div className="space-y-2">
        {list.map((c) => (
          <RowLink
            key={c.id}
            to={`/clientes/${c.id}`}
            icon={User}
            title={c.full_name}
            subtitle={[c.boats.map((b) => b.name).join(', ') || 'Sin bote todavía', c.town].filter(Boolean).join(' · ')}
          />
        ))}
      </div>

      <Fab to="/clientes/nuevo" label="Cliente" />
    </>
  )
}
