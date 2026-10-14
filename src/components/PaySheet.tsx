import { useEffect, useState } from 'react'
import { Banknote, CheckCircle2, CreditCard, ScrollText, Smartphone, type LucideIcon } from 'lucide-react'
import { PAYMENT_METHODS } from '../lib/catalog'
import { formatMoney } from '../lib/format'
import type { Invoice } from '../lib/types'
import { num } from '../lib/useLoad'
import { Sheet } from './Sheet'
import { Button, Choice, Field, Input, type Tone } from './ui'

export const PAY_ICONS: Record<string, { icon: LucideIcon; tone: Tone }> = {
  ath_movil: { icon: Smartphone, tone: 'orange' },
  cash: { icon: Banknote, tone: 'green' },
  check: { icon: ScrollText, tone: 'blue' },
  other: { icon: CreditCard, tone: 'violet' },
}

/**
 * Recibir un pago: cuánto (sale lo que falta; si le dio una parte, la cambia) y cómo.
 * Sirve para el pago completo, un depósito o un abono: el mecánico decide.
 */
export default function PaySheet({ open, balance, title = 'Recibir pago', onClose, onPay }: {
  open: boolean
  /** Lo que falta (0 si todavía no hay total) */
  balance: number
  title?: string
  onClose: () => void
  onPay: (method: NonNullable<Invoice['payment_method']>, amount: number) => Promise<void>
}) {
  const [method, setMethod] = useState<NonNullable<Invoice['payment_method']>>('ath_movil')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setAmount(balance > 0 ? balance.toFixed(2) : '')
    setError('')
  }, [open, balance])

  const value = num(amount) ?? 0
  const left = Math.round((balance - value) * 100) / 100

  async function save() {
    if (!(value > 0)) return setError('Escribe cuánto te dio.')
    setBusy(true)
    setError('')
    try {
      await onPay(method, value)
    } catch {
      setError('No se pudo guardar el pago. Revisa la señal e intenta otra vez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="space-y-3">
        <Field label="¿Cuánto te dio? ($)" hint={balance > 0 ? `Falta ${formatMoney(balance)}. Si te dio una parte (depósito o abono), cambia la cantidad.` : 'Un depósito o adelanto: la cantidad que quieras.'}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-2xl! font-extrabold" />
        </Field>
        {balance > 0 && value > 0 && left > 0.004 && <p className="rounded-xl bg-amber-50 p-3 text-base font-bold text-amber-900">Le quedan {formatMoney(left)} de balance.</p>}
        {balance > 0 && value > 0 && left <= 0.004 && <p className="rounded-xl bg-emerald-50 p-3 text-base font-bold text-emerald-800">Con esto queda saldado ✓</p>}
        <Field label="¿Cómo te pagó?">
          <Choice value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => ({ ...m, ...PAY_ICONS[m.value] }))} />
        </Field>
        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <Button disabled={busy} className="bg-emerald-700! active:bg-emerald-800!" onClick={save}>
          <CheckCircle2 /> {busy ? 'Guardando…' : 'Guardar pago'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
    </Sheet>
  )
}
