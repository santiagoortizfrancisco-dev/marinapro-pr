import { useState, type FormEvent } from 'react'
import { Boxes, Package, Plus, Trash2, Wrench } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { db } from '../../lib/db'
import { blank, must, num, useLoad } from '../../lib/useLoad'
import type { CatalogItem } from '../../components/PartSheet'
import { formatMoney } from '../../lib/format'
import type { PackageItem, ServicePackage } from '../../lib/packages'
import { BackTitle, Button, ErrorBox, Input, Loading } from '../../components/ui'

/** Las piezas y servicios del mecánico, con su precio. Se llenan solas al usarlas en un trabajo. */
export default function Catalog() {
  const { session } = useAuth()
  const [tab, setTab] = useState<'service' | 'part' | 'package'>('service')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [saved, setSaved] = useState('')
  const { data, loading, error, reload, setData } = useLoad(
    async () => must(await db().from('catalog_items').select('*').eq('mechanic_id', session!.user.id).order('use_count', { ascending: false })) as CatalogItem[],
    [],
  )

  function flash(msg: string) {
    setSaved(msg)
    setTimeout(() => setSaved(''), 1800)
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await db().rpc('remember_catalog_item', { p_kind: tab, p_name: name.trim(), p_price: num(price) })
    setName('')
    setPrice('')
    flash('Guardado ✓')
    reload()
  }

  async function updatePrice(item: CatalogItem, value: string) {
    const p = num(value)
    if (p === (item.last_price == null ? null : Number(item.last_price))) return
    await db().from('catalog_items').update({ last_price: p, updated_at: new Date().toISOString() }).eq('id', item.id)
    setData((list) => (list ?? []).map((x) => (x.id === item.id ? { ...x, last_price: p } : x)))
    flash('Precio guardado ✓')
  }

  async function remove(item: CatalogItem) {
    setData((list) => (list ?? []).filter((x) => x.id !== item.id))
    await db().from('catalog_items').delete().eq('id', item.id)
  }

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se pudo cargar.'} onRetry={reload} />
  const list = data.filter((c) => c.kind === tab)
  const tabs = [['service', 'Servicios'], ['part', 'Piezas'], ['package', 'Paquetes']] as const

  return (
    <>
      <BackTitle to="/mas" subtitle="Se llenan solas cuando las usas en un trabajo, con el último precio que cobraste">Mis piezas y servicios</BackTitle>
      {saved && <div className="fixed left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white">{saved}</div>}

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`min-h-12 rounded-lg text-lg font-bold ${tab === k ? 'bg-white text-navy-900 shadow' : 'text-slate-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'package' ? <Packages flash={flash} /> : (<>

      <form onSubmit={add} className="mb-5 grid grid-cols-[1fr_6.5rem] gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tab === 'service' ? 'Cambio de impeller' : 'Impeller'} aria-label={tab === 'service' ? 'Servicio nuevo' : 'Pieza nueva'} />
        <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$ precio" aria-label="Precio" />
        <Button type="submit" className="col-span-2" disabled={!blank(name)}><Plus /> Añadir {tab === 'service' ? 'servicio' : 'pieza'}</Button>
      </form>

      {list.length === 0 && (
        <p className="rounded-xl bg-slate-100 p-4 text-base text-slate-700">
          Todavía no tienes {tab === 'service' ? 'servicios' : 'piezas'} guardados. Cuando los uses en un trabajo se guardan aquí solos. Mientras tanto, al escribir te salen sugerencias de la lista común.
        </p>
      )}
      <div className="space-y-2">
        {list.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white p-2 pl-3">
            {c.kind === 'service' ? <Wrench size={20} className="shrink-0 text-navy-700" /> : <Package size={20} className="shrink-0 text-navy-700" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-bold text-slate-900">{c.name}</div>
              <div className="text-xs text-slate-500">Usado {c.use_count} {c.use_count === 1 ? 'vez' : 'veces'}</div>
            </div>
            <input
              inputMode="decimal"
              aria-label={`Precio de ${c.name}`}
              defaultValue={c.last_price != null ? String(c.last_price) : ''}
              placeholder="$"
              onBlur={(e) => updatePrice(c, e.target.value)}
              className="h-12 w-24 rounded-xl border-2 border-slate-300 px-2 text-right text-lg"
            />
            <button onClick={() => remove(c)} aria-label={`Borrar ${c.name}`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-red-700 active:bg-red-50">
              <Trash2 size={20} />
            </button>
          </div>
        ))}
      </div>
      </>)}
    </>
  )
}

/** Mis paquetes: cambiar nombre y precios, quitar líneas o borrar el paquete. */
function Packages({ flash }: { flash: (msg: string) => void }) {
  const { session } = useAuth()
  const { data, loading, setData } = useLoad(
    async () => must(await db().from('service_packages').select('*').eq('mechanic_id', session!.user.id).order('use_count', { ascending: false })) as ServicePackage[],
    [],
  )
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function save(pkg: ServicePackage, fields: Partial<Pick<ServicePackage, 'name' | 'items'>>) {
    setData((list) => (list ?? []).map((x) => (x.id === pkg.id ? { ...x, ...fields } : x)))
    await db().from('service_packages').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', pkg.id)
    flash('Guardado ✓')
  }

  function setItem(pkg: ServicePackage, n: number, item: PackageItem | null) {
    const items = item ? pkg.items.map((x, i) => (i === n ? item : x)) : pkg.items.filter((_, i) => i !== n)
    save(pkg, { items })
  }

  async function remove(pkg: ServicePackage) {
    setData((list) => (list ?? []).filter((x) => x.id !== pkg.id))
    await db().from('service_packages').delete().eq('id', pkg.id)
    flash('Paquete borrado')
  }

  if (loading && !data) return <Loading />
  if (!data?.length) {
    return (
      <p className="rounded-xl bg-slate-100 p-4 text-base text-slate-700">
        Todavía no tienes paquetes. En un trabajo, añade los servicios y piezas que siempre repites y toca <b>“Guardar como paquete”</b>.
        La próxima vez lo pones todo con <b>“+ Paquete”</b>.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {data.map((pkg) => (
        <section key={pkg.id} className="rounded-2xl border-2 border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <Boxes size={22} className="shrink-0 text-navy-700" />
            <input
              aria-label="Nombre del paquete"
              defaultValue={pkg.name}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== pkg.name && save(pkg, { name: e.target.value.trim() })}
              className="h-12 min-w-0 flex-1 rounded-xl border-2 border-transparent px-2 text-lg font-bold text-navy-900 focus:border-navy-600 focus:outline-none"
            />
          </div>
          <div className="mt-2 space-y-1">
            {pkg.items.map((i, n) => (
              <div key={`${pkg.id}-${n}-${i.name}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-base text-slate-800">{i.qty !== 1 ? `${i.qty} × ` : ''}{i.name}</span>
                <input
                  inputMode="decimal"
                  aria-label={`Precio de ${i.name}`}
                  defaultValue={i.price != null ? String(i.price) : ''}
                  placeholder="$"
                  onBlur={(e) => { const p = num(e.target.value); if (p !== i.price) setItem(pkg, n, { ...i, price: p }) }}
                  className="h-11 w-24 rounded-xl border-2 border-slate-300 px-2 text-right text-base"
                />
                <button onClick={() => setItem(pkg, n, null)} aria-label={`Quitar ${i.name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 active:bg-slate-100">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-sm text-slate-500">Usado {pkg.use_count} {pkg.use_count === 1 ? 'vez' : 'veces'}</span>
            <span className="text-base font-bold text-slate-900">{formatMoney(pkg.items.reduce((t, i) => t + i.qty * (i.price ?? 0), 0))}</span>
          </div>
          {confirmId === pkg.id ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="danger" onClick={() => remove(pkg)}>Sí, borrar</Button>
              <Button variant="secondary" onClick={() => setConfirmId(null)}>No</Button>
            </div>
          ) : (
            <button onClick={() => setConfirmId(pkg.id)} className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 text-sm font-bold text-red-700">
              <Trash2 size={16} /> Borrar paquete
            </button>
          )}
        </section>
      ))}
    </div>
  )
}
