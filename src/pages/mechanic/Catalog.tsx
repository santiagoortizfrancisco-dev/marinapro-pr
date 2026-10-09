import { useState, type FormEvent } from 'react'
import { Package, Plus, Trash2, Wrench } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { db } from '../../lib/db'
import { blank, must, num, useLoad } from '../../lib/useLoad'
import type { CatalogItem } from '../../components/PartSheet'
import { BackTitle, Button, ErrorBox, Input, Loading } from '../../components/ui'

/** Las piezas y servicios del mecánico, con su precio. Se llenan solas al usarlas en un trabajo. */
export default function Catalog() {
  const { session } = useAuth()
  const [tab, setTab] = useState<'service' | 'part'>('service')
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
  const tabs = [['service', 'Servicios'], ['part', 'Piezas']] as const

  return (
    <>
      <BackTitle to="/mas" subtitle="Se llenan solas cuando las usas en un trabajo, con el último precio que cobraste">Mis piezas y servicios</BackTitle>
      {saved && <div className="fixed left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white">{saved}</div>}

      <div className={`mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1`}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`min-h-12 rounded-lg text-lg font-bold ${tab === k ? 'bg-white text-navy-900 shadow' : 'text-slate-600'}`}>
            {label}
          </button>
        ))}
      </div>


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
    </>
  )
}
