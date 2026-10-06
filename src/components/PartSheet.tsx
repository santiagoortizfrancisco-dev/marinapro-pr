import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import { formatMoney } from '../lib/format'
import type { Part } from '../lib/types'
import { blank, num } from '../lib/useLoad'
import { Sheet } from './Sheet'
import { Button, Choice, Field, Input, Toggle } from './ui'

export interface CatalogItem {
  id: string
  mechanic_id: string | null
  kind: 'part' | 'service'
  name: string
  category: string | null
  last_price: number | null
  use_count: number
}

type Form = { description: string; part_number: string; qty: string; unit_cost: string; supplied_by: Part['supplied_by']; supplier: string; eta: string; received: boolean }
const EMPTY: Form = { description: '', part_number: '', qty: '1', unit_cost: '', supplied_by: 'mechanic', supplier: '', eta: '', received: false }

function plain(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Añadir o editar una pieza o un servicio del trabajo. Sugiere de "Mis piezas y servicios" y de la lista común. */
export default function PartSheet({ open, kind, workOrderId, part, onClose, onSaved }: {
  open: boolean
  kind: Part['kind']
  workOrderId: string
  part: Part | null
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState<Form>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))
  const isService = (part?.kind ?? kind) === 'service'
  const noun = isService ? 'servicio' : 'pieza'

  useEffect(() => {
    if (!open) return
    setError('')
    setShowSuggestions(false)
    setF(
      part
        ? { description: part.description, part_number: part.part_number ?? '', qty: String(part.qty), unit_cost: String(part.unit_cost), supplied_by: part.supplied_by, supplier: part.supplier ?? '', eta: part.eta ?? '', received: Boolean(part.received_at) }
        : EMPTY,
    )
    db().from('catalog_items').select('*').then(({ data }) => setCatalog((data ?? []) as CatalogItem[]))
  }, [open, part])

  // Sugerencias: primero las mías (las más usadas), después la lista común
  const suggestions = useMemo(() => {
    const term = plain(f.description.trim())
    if (!term) return []
    const k = isService ? 'service' : 'part'
    const match = catalog.filter((c) => c.kind === k && plain(c.name).includes(term) && plain(c.name) !== term)
    const mine = match.filter((c) => c.mechanic_id).sort((a, b) => b.use_count - a.use_count)
    const mineNames = new Set(mine.map((c) => plain(c.name)))
    const common = match.filter((c) => !c.mechanic_id && !mineNames.has(plain(c.name)))
    return [...mine, ...common].slice(0, 6)
  }, [catalog, f.description, isService])

  function pick(c: CatalogItem) {
    setF((p) => ({ ...p, description: c.name, unit_cost: c.last_price != null ? String(c.last_price) : p.unit_cost }))
    setShowSuggestions(false)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const charged = isService || f.supplied_by === 'mechanic'
    const row = {
      kind: isService ? 'service' : 'part',
      description: f.description.trim(),
      part_number: isService ? null : blank(f.part_number),
      qty: num(f.qty) ?? 1,
      unit_cost: charged ? num(f.unit_cost) ?? 0 : 0,
      supplied_by: isService ? 'mechanic' : f.supplied_by,
      supplier: isService ? null : blank(f.supplier),
      eta: isService ? null : blank(f.eta),
      received_at: isService ? null : f.received ? part?.received_at ?? new Date().toISOString() : null,
    }
    const res = part ? await db().from('work_order_parts').update(row).eq('id', part.id) : await db().from('work_order_parts').insert({ ...row, work_order_id: workOrderId })
    if (res.error) {
      setBusy(false)
      setError(`No se pudo guardar el ${noun}.`)
      return
    }
    // Se guarda en "Mis piezas y servicios" con el precio que cobró (para la próxima vez)
    await db().rpc('remember_catalog_item', { p_kind: row.kind, p_name: row.description, p_price: charged ? row.unit_cost : null })
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
  const charged = isService || f.supplied_by === 'mechanic'

  return (
    <Sheet open={open} title={part ? `Editar ${noun}` : isService ? 'Servicio nuevo' : 'Pieza nueva'} onClose={onClose}>
      <form onSubmit={save} className="max-h-[70vh] space-y-4 overflow-y-auto pb-2">
        {!isService && (
          <Field label="¿Quién compró la pieza?">
            <Choice
              value={f.supplied_by}
              onChange={(v) => set('supplied_by', v)}
              options={[
                { value: 'mechanic', label: 'Yo', hint: 'Se cobra en la factura' },
                { value: 'client', label: 'El cliente', hint: 'No se cobra; solo garantía de instalación' },
              ]}
            />
          </Field>
        )}

        <div>
          <Field label={isService ? 'Servicio *' : 'Pieza *'} hint={isService ? 'Precio fijo; cuenta como mano de obra' : undefined}>
            <Input
              required
              autoComplete="off"
              value={f.description}
              onChange={(e) => { set('description', e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              placeholder={isService ? 'Cambio de impeller' : 'Impeller'}
            />
          </Field>
          {showSuggestions && suggestions.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-xl border-2 border-slate-200 bg-white" role="listbox" aria-label="Sugerencias">
              {suggestions.map((c) => (
                <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => pick(c)} className="flex min-h-12 w-full items-center gap-2 border-b border-slate-100 px-3 text-left last:border-0 active:bg-slate-50">
                  {c.mechanic_id && <Star size={16} className="shrink-0 text-amber-500" aria-label="Tuya" />}
                  <span className="flex-1 text-base text-slate-900">{c.name}</span>
                  <span className="shrink-0 text-sm font-semibold text-slate-500">{c.last_price != null ? formatMoney(Number(c.last_price)) : c.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!isService && (
          <Field label="Número de parte">
            <Input value={f.part_number} onChange={(e) => set('part_number', e.target.value.toUpperCase())} placeholder="6CE-44352-00" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad">
            <Input inputMode="decimal" value={f.qty} onChange={(e) => set('qty', e.target.value)} />
          </Field>
          {charged && (
            <Field label="Precio c/u ($)">
              <Input inputMode="decimal" value={f.unit_cost} onChange={(e) => set('unit_cost', e.target.value)} placeholder={isService ? '120.00' : '45.00'} />
            </Field>
          )}
        </div>
        {charged && lineTotal > 0 && <p className="text-right text-lg font-bold text-navy-900">Total: {formatMoney(lineTotal)}</p>}
        {!isService && (
          <>
            <Field label="Dónde se compró">
              <Input value={f.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="West Marine, Marine Max…" />
            </Field>
            <Field label="¿Cuándo llega?" hint="Si hay que pedirla">
              <Input type="date" value={f.eta} onChange={(e) => set('eta', e.target.value)} />
            </Field>
            <Toggle checked={f.received} onChange={(v) => set('received', v)} label="Ya la tengo" />
          </>
        )}
        {error && <p className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : `Guardar ${noun}`}</Button>
        {part && <Button type="button" variant="danger" disabled={busy} onClick={remove}><Trash2 /> Quitar {noun}</Button>}
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
      </form>
    </Sheet>
  )
}
