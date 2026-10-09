import { useState } from 'react'
import { Banknote, CheckCircle2, CreditCard, ScrollText, Smartphone, type LucideIcon } from 'lucide-react'
import { PAYMENT_METHODS } from '../lib/catalog'
import { formatMoney } from '../lib/format'
import type { Invoice } from '../lib/types'
import { Sheet } from './Sheet'
import { Button, Choice, type Tone } from './ui'

const PAY_ICONS: Record<string, { icon: LucideIcon; tone: Tone }> = {
  ath_movil: { icon: Smartphone, tone: 'orange' },
  cash: { icon: Banknote, tone: 'green' },
  check: { icon: ScrollText, tone: 'blue' },
  other: { icon: CreditCard, tone: 'violet' },
}

/** "¿Cómo te pagó?" para marcar una factura como pagada desde Cobros o desde el cliente. */
export default function PaySheet({ open, total, onClose, onPay }: {
  open: boolean
  total: number
  onClose: () => void
  onPay: (method: NonNullable<Invoice['payment_method']>) => Promise<void>
}) {
  const [method, setMethod] = useState<NonNullable<Invoice['payment_method']>>('ath_movil')
  const [busy, setBusy] = useState(false)
  return (
    <Sheet open={open} title={`¿Cómo te pagó? (${formatMoney(total)})`} onClose={onClose}>
      <div className="space-y-3">
        <Choice value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => ({ ...m, ...PAY_ICONS[m.value] }))} />
        <Button disabled={busy} className="bg-emerald-700! active:bg-emerald-800!"
          onClick={async () => { setBusy(true); try { await onPay(method) } finally { setBusy(false) } }}>
          <CheckCircle2 /> {busy ? 'Guardando…' : 'Guardar pago'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
    </Sheet>
  )
}
