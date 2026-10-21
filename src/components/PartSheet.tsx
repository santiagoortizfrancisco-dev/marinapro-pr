import { JOB_IDEAS, useWords } from '../lib/trade'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import { formatMoney } from '../lib/format'
import type { Part } from '../lib/types'
import { blank, num } from '../lib/useLoad'
import { Sheet } from './Sheet'
import { Button, Field, Input, Toggle } from './ui'

export interface CatalogItem {
  id: string
  mechanic_id: string | null
  kind: 'part' | 'service'
  name: string
  category: string | null
  last_price: number | null
  use_count: number
}

type Form = { description: string; qty: string; unit_cost: string; byClient: boolean; part_number: string; supplier: string; eta: string; received: boolean }
const EMPTY: Form = { description: '', qty: '1', unit_cost: '', byClient: false, part_number: '', supplier: '', eta: '', received: true }

function plain(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * "Añadir lo que cobras": una sola ventana para servicios y piezas. El mecánico escribe qué es y el precio;
 * la app decide por dentro si es pieza o servicio (por lo que ya tiene guardado) y recuerda el precio.
 * Lo de pieza (número de parte, dónde se compró, cuándo llega) queda en "Más detalles".
 */
export default function PartSheet({ open, workOrderId, part, onClose, onSaved }: {
  open: boolean
  /** (ya no se usa: la app decide si es pieza o servicio) */
  kind?: Part['kind']
  workOrderId: string
  part: Part | null
  onClose: () => void
  onSaved: () => void
}) {
  const words = useWords()
  const [f, setF] = useState<Form>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [details, setDetails] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setError('')
    setShowSuggestions(false)
    setF(
      part
        ? { description: part.description, qty: String(part.qty), unit_cost: String(part.unit_cost), byClient: part.supplied_by === 'client', part_number: part.part_number ?? '', supplier: part.supplier ?? '', eta: part.eta ?? '', received: Boolean(part.received_at) }
        : EMPTY,
    )
    setDetails(Boolean(part && (part.part_number || part.supplier || part.eta)))
    db().from('catalog_items').select('*').then(({ data }) => setCatalog((data ?? []) as CatalogItem[]))
  }, [open, part])

  // Sugerencias: primero lo suyo (lo que más usa, con su precio), después la lista común
  const suggestions = useMemo(() => {
    const term = plain(f.description.trim())
    if (!term) return []
    const match = catalog.filter((c) => plain(c.name).includes(term) && plain(c.name) !== term)
    const mine = match.filter((c) => c.mechanic_id).sort((a, b) => b.use_count - a.use_count)
    const mineNames = new Set(mine.map((c) => plain(c.name)))
    const common = match.filter((c) => !c.mechanic_id && !mineNames.has(plain(c.name)))
    return [...mine, ...common].slice(0, 6)
  }, [catalog, f.description])

  function pick(c: CatalogItem) {
    setF((p) => ({ ...p, description: c.name, unit_cost: c.last_price != null ? String(c.last_price) : p.unit_cost }))
    setShowSuggestions(false)
  }

  /** Pieza o servicio: si lo trajo el cliente o tiene datos de pieza, es pieza; si no, lo que ya tiene guardado; si es nuevo, servicio. */
  function kindOf(): Part['kind'] {
    if (f.byClient || f.part_number.trim() || f.supplier.trim() || f.eta) return 'part'
    const name = plain(f.description.trim())
    const known = catalog.find((c) => c.mechanic_id && plain(c.name) === name) ?? catalog.find((c) => plain(c.name) === name)
    return known?.kind ?? part?.kind ?? 'service'
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!f.description.trim()) return setError('Escribe qué es.')
    setBusy(true)
    setError('')
    const kind = kindOf()
    const isPart = kind === 'part'
    const charged = !f.byClient
    const row = {
      kind,
      description: f.description.trim(),
      part_number: isPart ? blank(f.part_number) : null,
      qty: num(f.qty) ?? 1,
      unit_cost: charged ? num(f.unit_cost) ?? 0 : 0,
      supplied_by: f.byClient ? 'client' : 'mechanic',
      supplier: isPart ? blank(f.supplier) : null,
      eta: isPart ? blank(f.eta) : null,
      received_at: isPart && f.received ? part?.received_at ?? new Date().toISOString() : null,
    }
    const res = part ? await db().from('work_order_parts').update(row).eq('id', part.id) : await db().from('work_order_parts').insert({ ...row, work_order_id: workOrderId })
    if (res.error) {
      setBusy(false)
      setError('No se pudo guardar. Revisa la señal e intenta otra vez.')
      return
    }
    // Se guarda en "Mis piezas y servicios" con el precio (para la próxima vez)
    await db().rpc('remember_catalog_item', { p_kind: kind, p_name: row.description, p_price: charged ? row.unit_cost : null })
    setBusy(false)
    onSaved()
    onClose()
  }

  async function remove() {
    if (!part) return
    setBusy(true)
    await db().from('work_order_parts').delete().eq('id', part.id)
    setBusy(false)
    onSaved()
    onClose()
  }

  const lineTotal = (num(f.qty) ?? 0) * (num(f.unit_cost) ?? 0)

  return (
    <Sheet open={open} title={part ? 'Cambiar la línea' : 'Añadir a la factura'} onClose={onClose}>
      <form onSubmit={save} className="max-h-[70vh] space-y-4 overflow-y-auto pb-2">
        {/* Un renglón de factura: descripción, cantidad y precio */}
        <div>
          <div className="grid grid-cols-[1fr_3.5rem_5.5rem] gap-1 rounded-t-lg bg-navy-50 px-2 py-2 text-xs font-bold uppercase tracking-wide text-navy-800">
            <span>Descripción</span><span className="text-center">Cant.</span><span className="pr-2 text-right">Precio</span>
          </div>
          <div className="grid grid-cols-[1fr_3.5rem_5.5rem] items-center gap-1 border-b border-slate-200 px-1">
            <Input
              aria-label="Descripción"
              autoComplete="off"
              value={f.description}
              onChange={(e) => { set('description', e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              placeholder={JOB_IDEAS[words.trade][0]}
              className="min-h-12! rounded-lg! border-0! bg-transparent! focus:bg-navy-50! px-2! text-base!"
            />
            <Input aria-label="Cantidad" inputMode="decimal" value={f.qty} onChange={(e) => set('qty', e.target.value)} className="min-h-12! rounded-lg! border-0! bg-transparent! focus:bg-navy-50! px-1! text-center" />
            {f.byClient
              ? <span className="pr-2 text-right text-sm font-semibold text-slate-500">No se cobra</span>
              : <Input aria-label="Precio" inputMode="decimal" value={f.unit_cost} onChange={(e) => set('unit_cost', e.target.value)} placeholder="$0.00" className="min-h-12! rounded-lg! border-0! bg-transparent! focus:bg-navy-50! px-2! text-right font-semibold" />}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-xl border-2 border-slate-200 bg-white" role="listbox" aria-label="Sugerencias">
              {suggestions.map((c) => (
                <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => pick(c)} className="flex min-h-12 w-full items-center gap-2 border-b border-slate-100 px-3 text-left last:border-0 active:bg-slate-50">
                  {c.mechanic_id && <Star size={16} className="shrink-0 text-amber-500" aria-label="Tuya" />}
                  <span className="flex-1 text-base text-slate-900">{c.name}</span>
                  <span className="shrink-0 text-sm font-semibold text-slate-500">{c.last_price != null ? formatMoney(Number(c.last_price)) : ''}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-between px-2 pt-2 text-base">
            <span className="text-slate-600">Total de la línea</span>
            <b className="text-navy-900">{f.byClient ? 'No se cobra' : lineTotal > 0 ? formatMoney(lineTotal) : 'Incluido'}</b>
          </div>
        </div>

        {/* Pieza que trajo el cliente: un renglón sencillo, no un cuadro grande */}
        <button type="button" role="switch" aria-checked={f.byClient} onClick={() => set('byClient', !f.byClient)}
          className="flex min-h-12 w-full items-center gap-3 px-1 text-left">
          <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${f.byClient ? 'bg-navy-800' : 'bg-slate-300'}`}>
            <span className={`h-5 w-5 rounded-full bg-white shadow transition ${f.byClient ? 'translate-x-5' : ''}`} />
          </span>
          <span className="text-base text-slate-800">Lo trajo el cliente (no se cobra)</span>
        </button>

        <details open={details} onToggle={(e) => setDetails((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer px-1 py-1 text-base font-bold text-navy-700">Más detalles de la pieza (opcional)</summary>
          <div className="mt-3 space-y-4">
            <Field label="Número de parte">
              <Input value={f.part_number} onChange={(e) => set('part_number', e.target.value.toUpperCase())} placeholder="6CE-44352-00" />
            </Field>
            <Field label="Dónde se compró">
              <Input value={f.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="West Marine, Marine Max…" />
            </Field>
            <Field label="¿Cuándo llega?" hint="Si hay que pedirla">
              <Input type="date" value={f.eta} onChange={(e) => { set('eta', e.target.value); if (e.target.value) set('received', false) }} />
            </Field>
            <Toggle checked={f.received} onChange={(v) => set('received', v)} label="Ya la tengo" />
          </div>
        </details>

        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
        {part && <Button type="button" variant="danger" disabled={busy} onClick={remove}><Trash2 /> Quitar</Button>}
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
      </form>
    </Sheet>
  )
}
