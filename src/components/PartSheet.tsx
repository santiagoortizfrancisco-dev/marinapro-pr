import { useEffect, useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import { formatMoney } from '../lib/format'
import type { Part } from '../lib/types'
import { blank, num } from '../lib/useLoad'
import { Sheet } from './Sheet'
import { Button, Choice, Field, Input, Toggle } from './ui'

type Form = { description: string; part_number: string; qty: string; unit_cost: string; supplied_by: Part['supplied_by']; supplier: string; eta: string; received: boolean }
const EMPTY: Form = { description: '', part_number: '', qty: '1', unit_cost: '', supplied_by: 'mechanic', supplier: '', eta: '', received: false }

/** Añadir o editar una pieza del trabajo. */
export default function PartSheet({ open, workOrderId, part, onClose, onSaved }: { open: boolean; workOrderId: string; part: Part | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setError('')
    setF(
      part
        ? { description: part.description, part_number: part.part_number ?? '', qty: String(part.qty), unit_cost: String(part.unit_cost), supplied_by: part.supplied_by, supplier: part.supplier ?? '', eta: part.eta ?? '', received: Boolean(part.received_at) }
        : EMPTY,
    )
  }, [open, part])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const row = {
      description: f.description.trim(),
      part_number: blank(f.part_number),
      qty: num(f.qty) ?? 1,
      unit_cost: f.supplied_by === 'client' ? 0 : num(f.unit_cost) ?? 0,
      supplied_by: f.supplied_by,
      supplier: blank(f.supplier),
      eta: blank(f.eta),
      received_at: f.received ? part?.received_at ?? new Date().toISOString() : null,
    }
    const res = part ? await db().from('work_order_parts').update(row).eq('id', part.id) : await db().from('work_order_parts').insert({ ...row, work_order_id: workOrderId })
    setBusy(false)
    if (res.error) {
      setError('No se pudo guardar la pieza.')
      return
    }
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
    <Sheet open={open} title={part ? 'Editar pieza' : 'Pieza nueva'} onClose={onClose}>
      <form onSubmit={save} className="max-h-[70vh] space-y-4 overflow-y-auto pb-2">
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
        <Field label="Pieza *">
          <Input required value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Impeller Yamaha F200" />
        </Field>
        <Field label="Número de parte">
          <Input value={f.part_number} onChange={(e) => set('part_number', e.target.value.toUpperCase())} placeholder="6CE-44352-00" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad">
            <Input inputMode="decimal" value={f.qty} onChange={(e) => set('qty', e.target.value)} />
          </Field>
          {f.supplied_by === 'mechanic' && (
            <Field label="Precio c/u ($)">
              <Input inputMode="decimal" value={f.unit_cost} onChange={(e) => set('unit_cost', e.target.value)} placeholder="45.00" />
            </Field>
          )}
        </div>
        {f.supplied_by === 'mechanic' && lineTotal > 0 && <p className="text-right text-lg font-bold text-navy-900">Total: {formatMoney(lineTotal)}</p>}
        <Field label="Dónde se compró">
          <Input value={f.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="West Marine, Marine Max…" />
        </Field>
        <Field label="¿Cuándo llega?" hint="Si hay que pedirla">
          <Input type="date" value={f.eta} onChange={(e) => set('eta', e.target.value)} />
        </Field>
        <Toggle checked={f.received} onChange={(v) => set('received', v)} label="Ya la tengo" />
        {error && <p className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar pieza'}</Button>
        {part && <Button type="button" variant="danger" disabled={busy} onClick={remove}><Trash2 /> Quitar pieza</Button>}
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
      </form>
    </Sheet>
  )
}
