import { useEffect, useState } from 'react'
import { Banknote, CheckCircle2, CreditCard, Gift, ScrollText, Smartphone, type LucideIcon } from 'lucide-react'
import { db } from '../lib/db'
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
export default function PaySheet({ open, balance, title = 'Recibir pago', onClose, onPay, withTip = false, withGift = false }: {
  open: boolean
  /** Salón: se puede añadir la propina (va aparte, para la empleada) */
  withTip?: boolean
  /** Salón: se puede pagar con una tarjeta de regalo (se escoge de la lista) */
  withGift?: boolean
  /** Lo que falta (0 si todavía no hay total) */
  balance: number
  title?: string
  onClose: () => void
  onPay: (method: NonNullable<Invoice['payment_method']>, amount: number, tip: number, giftCardId?: string) => Promise<void>
}) {
  const [gift, setGift] = useState(false)
  const [cards, setCards] = useState<{ id: string; code: string; balance: number; recipient_name: string | null }[] | null>(null)
  const [cardId, setCardId] = useState<string | null>(null)
  useEffect(() => {
    if (!gift || cards) return
    db().from('gift_cards').select('id, code, balance, recipient_name').gt('balance', 0).order('sold_at', { ascending: false }).limit(100)
      .then(({ data }) => setCards((data ?? []) as { id: string; code: string; balance: number; recipient_name: string | null }[]))
  }, [gift, cards])
  const [method, setMethod] = useState<NonNullable<Invoice['payment_method']>>('ath_movil')
  const [amount, setAmount] = useState('')
  const [tip, setTip] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setAmount(balance > 0 ? balance.toFixed(2) : '')
    setTip('')
    setError('')
    setGift(false)
    setCards(null)
    setCardId(null)
  }, [open, balance])

  const value = num(amount) ?? 0
  const left = Math.round((balance - value) * 100) / 100

  async function save() {
    if (!(value > 0)) return setError('Escribe cuánto te dio.')
    const card = gift ? cards?.find((c) => c.id === cardId) : null
    if (gift && !card) return setError('Escoge la tarjeta de regalo.')
    setBusy(true)
    setError('')
    try {
      // Con tarjeta de regalo: se usa lo que le quede (si no alcanza, el resto queda de balance)
      if (card) await onPay('other', Math.min(value, Number(card.balance)), 0, card.id)
      else await onPay(method, value, num(tip) ?? 0)
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
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => { const box = e.currentTarget; setTimeout(() => box.select(), 0) }} placeholder="0.00" className="text-2xl! font-extrabold" />
        </Field>
        {balance > 0 && value > 0 && left > 0.004 && <p className="rounded-xl bg-amber-50 p-3 text-base font-bold text-amber-900">Le quedan {formatMoney(left)} de balance.</p>}
        {balance > 0 && value > 0 && left <= 0.004 && <p className="rounded-xl bg-emerald-50 p-3 text-base font-bold text-emerald-800">Con esto queda saldado ✓</p>}
        {withTip && !gift && (
          <Field label="Propina (opcional)" hint="Va aparte, para la empleada">
            <div className="flex gap-2">
              {[3, 5, 10].map((t) => (
                <button key={t} type="button" onClick={() => setTip(String(t))} aria-pressed={tip === String(t)}
                  className={`min-h-12 flex-1 rounded-xl text-base font-bold ${tip === String(t) ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-800'}`}>${t}</button>
              ))}
              <Input aria-label="Otra propina" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="Otra" className="w-24! text-center" />
            </div>
          </Field>
        )}
        <Field label="¿Cómo te pagó?">
          <div className={gift ? 'opacity-40' : ''} onClickCapture={() => setGift(false)}>
            <Choice value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => ({ ...m, ...PAY_ICONS[m.value] }))} />
          </div>
          {withGift && (
            <button type="button" role="radio" aria-checked={gift} onClick={() => setGift(true)}
              className={`mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold ${gift ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
              <Gift size={22} /> Tarjeta de regalo
            </button>
          )}
        </Field>
        {gift && (
          <div className="space-y-2" role="radiogroup" aria-label="¿Cuál tarjeta?">
            {cards === null ? <p className="text-base text-slate-500">Buscando…</p> : cards.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-3 text-base text-slate-600">No hay tarjetas de regalo con dinero.</p>
            ) : cards.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={cardId === c.id} onClick={() => setCardId(c.id)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left ${cardId === c.id ? 'bg-pink-600 text-white' : 'bg-pink-50 text-slate-900'}`}>
                <Gift size={22} />
                <span className="min-w-0 flex-1"><span className="block truncate text-base font-bold">{c.recipient_name ? `Para ${c.recipient_name}` : 'Tarjeta de regalo'}</span><span className="block font-mono text-sm opacity-80">{c.code}</span></span>
                <span className="shrink-0 text-lg font-extrabold">{formatMoney(Number(c.balance))}</span>
              </button>
            ))}
          </div>
        )}
        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <Button disabled={busy} className="bg-emerald-700! active:bg-emerald-800!" onClick={save}>
          <CheckCircle2 /> {busy ? 'Guardando…' : 'Guardar pago'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
    </Sheet>
  )
}
