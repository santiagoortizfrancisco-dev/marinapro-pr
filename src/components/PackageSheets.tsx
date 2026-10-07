import { useEffect, useState } from 'react'
import { Boxes, Star } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { db } from '../lib/db'
import { formatMoney } from '../lib/format'
import { addPackageToJob, packagePrices, type PackageItem, type ServicePackage } from '../lib/packages'
import { Sheet } from './Sheet'
import { Button, Field, Input } from './ui'

/** "+ Paquete": escoge un paquete y se añaden todas sus líneas al trabajo de un toque. */
export function PackagePicker({ open, workOrderId, onClose, onAdded }: { open: boolean; workOrderId: string; onClose: () => void; onAdded: (name: string) => void }) {
  const [list, setList] = useState<(ServicePackage & { total: number })[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setList(null)
    ;(async () => {
      const { data } = await db().from('service_packages').select('*').order('use_count', { ascending: false })
      const pkgs = (data ?? []) as ServicePackage[]
      // Los míos primero; los de ejemplo al final
      const sorted = [...pkgs.filter((p) => p.mechanic_id), ...pkgs.filter((p) => !p.mechanic_id)]
      const withTotals = await Promise.all(sorted.map(async (p) => {
        const prices = await packagePrices(p.items)
        return { ...p, total: p.items.reduce((t, i, n) => t + (Number(i.qty) || 1) * prices[n], 0) }
      }))
      setList(withTotals)
    })()
  }, [open])

  async function pick(p: ServicePackage) {
    setBusy(true)
    setError('')
    try {
      await addPackageToJob(p, workOrderId)
      onAdded(p.name)
      onClose()
    } catch (e) {
      console.error(e)
      setError('No se pudo añadir el paquete. Intenta otra vez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title="Añadir un paquete" onClose={onClose}>
      <div className="max-h-[65vh] space-y-2 overflow-y-auto pb-2">
        {list === null && <p className="py-6 text-center text-slate-500">Cargando…</p>}
        {list?.length === 0 && <p className="text-base text-slate-600">Todavía no hay paquetes.</p>}
        {list?.map((p) => (
          <button key={p.id} disabled={busy} onClick={() => pick(p)} className="flex w-full items-start gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3 text-left active:bg-slate-50 disabled:opacity-50">
            {p.mechanic_id ? <Star size={22} className="mt-0.5 shrink-0 text-amber-500" aria-label="Tuyo" /> : <Boxes size={22} className="mt-0.5 shrink-0 text-navy-700" />}
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-slate-900">{p.name}</span>
              <span className="block text-sm text-slate-600">
                {p.items.length} {p.items.length === 1 ? 'cosa' : 'cosas'}{!p.mechanic_id && ' · ejemplo'}
              </span>
              <span className="mt-1 block truncate text-xs text-slate-500">{p.items.map((i) => (Number(i.qty) > 1 ? `${i.name} ×${Number(i.qty)}` : i.name)).join(', ')}</span>
            </span>
            <span className="shrink-0 text-base font-bold text-slate-900">{p.total > 0 ? formatMoney(p.total) : <span className="text-sm text-slate-500">Sin precios</span>}</span>
          </button>
        ))}
        <p className="pt-2 text-sm text-slate-500">Después puedes cambiar o quitar cualquier cosa. Para crear tus paquetes: arma un trabajo y toca “Guardar como paquete”.</p>
        {error && <p className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
    </Sheet>
  )
}

/** "Guardar como paquete": copia las líneas del trabajo con sus precios para usarlas otra vez. */
export function SavePackageSheet({ open, items, onClose, onSaved }: { open: boolean; items: PackageItem[]; onClose: () => void; onSaved: (name: string) => void }) {
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setName(items.find((i) => i.kind === 'service')?.name ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]) // solo al abrir (items cambia en cada render)

  async function save() {
    if (!name.trim()) return setError('Ponle un nombre al paquete.')
    setBusy(true)
    const { error: err } = await db().from('service_packages').insert({ mechanic_id: session!.user.id, name: name.trim(), items })
    setBusy(false)
    if (err) return setError('No se pudo guardar. Intenta otra vez.')
    onSaved(name.trim())
    onClose()
  }

  const total = items.reduce((t, i) => t + i.qty * (i.price ?? 0), 0)

  return (
    <Sheet open={open} title="Guardar como paquete" onClose={onClose}>
      <div className="max-h-[65vh] space-y-4 overflow-y-auto pb-2">
        <Field label="Nombre del paquete" hint="Ej.: Servicio 100 horas Yamaha F150">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <ul className="space-y-1 rounded-xl bg-slate-50 p-3 text-base">
          {items.map((i, n) => (
            <li key={n} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{i.qty !== 1 ? `${i.qty} × ` : ''}{i.name}</span>
              <span className="shrink-0 font-semibold">{formatMoney(i.qty * (i.price ?? 0))}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-slate-200 pt-1 font-bold"><span>Total</span><span>{formatMoney(total)}</span></li>
        </ul>
        <p className="text-sm text-slate-500">Las piezas que compró el cliente no se guardan en el paquete.</p>
        {error && <p className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <Button onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar paquete'}</Button>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
    </Sheet>
  )
}
