import { useState } from 'react'
import { Banknote, CreditCard, Gift, Plus, Search, Smartphone, type LucideIcon } from 'lucide-react'
import { WhatsAppIcon } from '../../components/BrandIcons'
import { Sheet } from '../../components/Sheet'
import { BackTitle, Button, EmptyState, ErrorBox, Input, Loading } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { db } from '../../lib/db'
import { formatDate, formatMoney } from '../../lib/format'
import { whatsappLink } from '../../lib/links'
import { shareAsImage } from '../../lib/shareImage'
import { must, num, useLoad } from '../../lib/useLoad'

export interface GiftCard {
  id: string; code: string; amount: number; balance: number; recipient_name: string | null; buyer_name: string | null
  phone: string | null; method: string; sold_at: string
}
type Method = 'ath_movil' | 'cash' | 'other'
const METHODS: { value: Method; label: string; icon: LucideIcon; color: string }[] = [
  { value: 'ath_movil', label: 'ATH Móvil', icon: Smartphone, color: '#ea580c' },
  { value: 'cash', label: 'Efectivo', icon: Banknote, color: '#15803d' },
  { value: 'other', label: 'Tarjeta', icon: CreditCard, color: '#6d28d9' },
]

/** Código fácil de dictar: letras del negocio + 4 números (ej. GLOW-4827). */
function newCode(business: string) {
  const letters = business.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) || 'REGALO'
  return `${letters}-${Math.floor(1000 + Math.random() * 9000)}`
}

/** La tarjeta como se ve (para enseñarla o mandarla). */
export function GiftCardView({ card, business }: { card: GiftCard; business: string }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-pink-600 to-fuchsia-700 p-5 text-white shadow-lg" aria-label={`Tarjeta ${card.code}`}>
      <span aria-hidden="true" className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15" />
      <span aria-hidden="true" className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/90"><Gift size={18} /> Tarjeta de regalo</div>
      <div className="relative mt-1 text-xl font-extrabold">{business}</div>
      <div className="relative mt-4 text-4xl font-extrabold">{formatMoney(Number(card.amount))}</div>
      {card.recipient_name && <div className="relative mt-1 text-base">Para: <b>{card.recipient_name}</b>{card.buyer_name ? <> · De: <b>{card.buyer_name}</b></> : null}</div>}
      <div className="relative mt-4 inline-block rounded-xl bg-white/20 px-3 py-1 font-mono text-lg font-extrabold tracking-widest">{card.code}</div>
    </div>
  )
}

/**
 * Tarjetas de regalo del salón: venderlas (con su código), ver cuánto le queda a cada una.
 * Se usan al cobrar: en Cobrar → "Regalo" se pone el código y se resta de la tarjeta.
 */
export default function GiftCards() {
  const { session } = useAuth()
  const [sellOpen, setSellOpen] = useState(false)
  const [show, setShow] = useState<GiftCard | null>(null)
  const [search, setSearch] = useState('')
  const { data, loading, error, reload } = useLoad(async () => {
    const [cards, mech] = await Promise.all([
      db().from('gift_cards').select('*').order('sold_at', { ascending: false }),
      db().from('mechanics').select('business_name').eq('profile_id', session!.user.id).single(),
    ])
    return { cards: must(cards) as GiftCard[], business: ((mech.data as { business_name: string | null } | null)?.business_name) ?? 'Mi salón' }
  }, [])

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No se pudo abrir.'} onRetry={reload} />

  const term = search.trim().toLowerCase()
  const list = data.cards.filter((c) => !term || [c.code, c.recipient_name, c.buyer_name].some((x) => (x ?? '').toLowerCase().includes(term)))
  const left = data.cards.reduce((t, c) => t + Number(c.balance), 0)

  return (
    <>
      <BackTitle subtitle={data.cards.length ? `Les queda ${formatMoney(left)} por usar` : 'Véndelas para regalos, cumpleaños y Navidad'}>Tarjetas de regalo</BackTitle>
      <Button onClick={() => setSellOpen(true)} className="bg-pink-600! active:bg-pink-700!"><Plus /> Vender tarjeta de regalo</Button>

      {data.cards.length > 3 && (
        <div className="relative mt-4">
          <Search size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input type="search" aria-label="Buscar tarjeta" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar código o nombre" className="pl-12" />
        </div>
      )}

      <div className="mt-4 space-y-2">
        {data.cards.length === 0 && <EmptyState icon={Gift} title="Todavía no has vendido tarjetas" text="Cuando vendas una, sale aquí con lo que le queda." />}
        {list.map((c) => (
          <button key={c.id} type="button" onClick={() => setShow(c)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-pink-100 active:bg-pink-50">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-100 text-pink-700"><Gift size={22} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-base font-extrabold text-slate-900">{c.code}</span>
              <span className="block truncate text-sm text-slate-600">{c.recipient_name ? `Para ${c.recipient_name} · ` : ''}{formatDate(c.sold_at)}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className={`block text-lg font-extrabold ${Number(c.balance) > 0 ? 'text-pink-700' : 'text-slate-400'}`}>{formatMoney(Number(c.balance))}</span>
              <span className="block text-xs text-slate-500">{Number(c.balance) > 0 ? `de ${formatMoney(Number(c.amount))}` : 'Usada'}</span>
            </span>
          </button>
        ))}
      </div>

      <SellSheet open={sellOpen} business={data.business} onClose={() => setSellOpen(false)} onSold={(c) => { setSellOpen(false); setShow(c); reload() }} />

      <Sheet open={Boolean(show)} title="Tarjeta de regalo" onClose={() => setShow(null)}>
        {show && (
          <div className="space-y-3">
            <div id="tarjeta-regalo"><GiftCardView card={show} business={data.business} /></div>
            <p className="text-center text-base text-slate-700">Le queda <b>{formatMoney(Number(show.balance))}</b> · vendida el {formatDate(show.sold_at)}</p>
            {(() => {
              // El mensaje lleva el link donde la tarjeta se ve en grande, con confeti
              const msg = `🎁 ¡Tienes una tarjeta de regalo de ${formatMoney(Number(show.amount))} en ${data.business}!${show.recipient_name ? ` Para: ${show.recipient_name}.` : ''}${show.buyer_name ? ` De parte de: ${show.buyer_name}.` : ''} Tu código es ${show.code}. Ábrela aquí: ${window.location.origin}/regalo/${show.id} 💅`
              return (
                <>
                  <button type="button" onClick={() => { const el = document.getElementById('tarjeta-regalo'); if (el) shareAsImage(el, `tarjeta-regalo-${show.code}.png`, msg).catch(() => undefined) }}
                    className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 text-lg font-bold text-white active:bg-pink-700"><Gift size={22} /> Enviar tarjeta (imagen)</button>
                  <a href={whatsappLink(show.phone ?? '', msg)}
                    target="_blank" rel="noreferrer" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-lg font-bold text-white"><WhatsAppIcon size={24} /> Enviar por WhatsApp</a>
                </>
              )
            })()}
            <FixCard key={show.id} card={show} onDone={(c) => { setShow(c); reload() }} />
            <Button variant="ghost" onClick={() => setShow(null)}>Listo</Button>
          </div>
        )}
      </Sheet>
    </>
  )
}

function SellSheet({ open, business, onClose, onSold }: { open: boolean; business: string; onClose: () => void; onSold: (c: GiftCard) => void }) {
  const { session } = useAuth()
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [buyer, setBuyer] = useState('')
  const [phone, setPhone] = useState('')
  const [method, setMethod] = useState<Method>('ath_movil')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const value = num(amount) ?? 0

  async function sell() {
    if (!(value > 0)) return setError('Escoge cuánto vale la tarjeta.')
    setBusy(true)
    setError('')
    // El código no se repite en el negocio: si sale uno que ya existe, se prueba otro
    for (let i = 0; i < 5; i++) {
      const { data, error } = await db().from('gift_cards').insert({
        mechanic_id: session!.user.id, code: newCode(business), amount: value, balance: value,
        recipient_name: recipient.trim() || null, buyer_name: buyer.trim() || null, phone: phone.trim() || null, method,
      }).select('*').single()
      if (!error) {
        setBusy(false)
        setAmount(''); setRecipient(''); setBuyer(''); setPhone('')
        return onSold(data as GiftCard)
      }
      if (!/duplicate|unique/i.test(error.message)) break
    }
    setBusy(false)
    setError('No se pudo guardar. Revisa la señal e intenta otra vez.')
  }

  return (
    <Sheet open={open} title="Vender tarjeta de regalo" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-base font-extrabold text-slate-800">¿Cuánto vale?</div>
          <div className="grid grid-cols-4 gap-2">
            {[25, 50, 75, 100].map((v) => (
              <button key={v} type="button" aria-pressed={value === v} onClick={() => setAmount(String(v))}
                className={`min-h-12 rounded-2xl text-lg font-extrabold ${value === v ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-700'}`}>${v}</button>
            ))}
          </div>
          <Input aria-label="Otra cantidad" inputMode="decimal" value={[25, 50, 75, 100].includes(value) ? '' : amount} onChange={(e) => setAmount(e.target.value)} placeholder="Otra cantidad" className="mt-2 text-center" />
        </div>
        <Input aria-label="Para quién" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="¿Para quién es? (opcional)" />
        <details className="rounded-2xl bg-slate-50 px-3">
          <summary className="min-h-12 cursor-pointer py-3 text-base font-bold text-slate-600">De parte de quién y WhatsApp (opcional)</summary>
          <div className="space-y-2 pb-3">
            <Input aria-label="De parte de" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="De parte de" />
            <Input aria-label="Teléfono para enviarla" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp para enviarla" />
          </div>
        </details>
        <div>
          <div className="mb-2 text-base font-extrabold text-slate-800">¿Cómo la pagó?</div>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="¿Cómo la pagó?">
            {METHODS.map((m) => {
              const on = method === m.value
              const Icon = m.icon
              return (
                <button key={m.value} type="button" role="radio" aria-checked={on} onClick={() => setMethod(m.value)}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-base font-bold"
                  style={on ? { backgroundColor: m.color, color: '#fff' } : { backgroundColor: '#f1f5f9', color: '#334155' }}>
                  <Icon size={24} /> {m.label}
                </button>
              )
            })}
          </div>
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <button type="button" disabled={busy} onClick={sell}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 text-xl font-extrabold text-white active:bg-pink-700 disabled:opacity-60">
          <Gift /> {busy ? 'Guardando…' : value > 0 ? `Vender tarjeta de ${formatMoney(value)}` : 'Vender tarjeta'}
        </button>
      </div>
    </Sheet>
  )
}

/** Por si hubo un error: cambiar para quién / de parte de / teléfono, o borrarla si todavía no se ha usado. */
function FixCard({ card, onDone }: { card: GiftCard; onDone: (c: GiftCard | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [recipient, setRecipient] = useState(card.recipient_name ?? '')
  const [buyer, setBuyer] = useState(card.buyer_name ?? '')
  const [phone, setPhone] = useState(card.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const used = Number(card.balance) < Number(card.amount)

  async function save() {
    setBusy(true)
    const fields = { recipient_name: recipient.trim() || null, buyer_name: buyer.trim() || null, phone: phone.trim() || null }
    const { error } = await db().from('gift_cards').update(fields).eq('id', card.id)
    setBusy(false)
    if (error) return setError('No se pudo guardar.')
    setEditing(false)
    onDone({ ...card, ...fields })
  }

  async function remove() {
    if (used) return
    if (!window.confirm(`¿Borrar la tarjeta ${card.code} de ${formatMoney(Number(card.amount))}? Esto no se puede deshacer.`)) return
    setBusy(true)
    const { error } = await db().from('gift_cards').delete().eq('id', card.id)
    setBusy(false)
    if (error) return setError('No se pudo borrar.')
    onDone(null)
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
        <Input aria-label="Para quién" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Para quién" />
        <Input aria-label="De parte de" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="De parte de" />
        <Input aria-label="Teléfono para enviarla" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp para enviarla" />
        {error && <p role="alert" className="rounded-xl bg-red-100 p-2 font-semibold text-red-800">{error}</p>}
        <Button disabled={busy} onClick={save} className="bg-pink-600! active:bg-pink-700!">Guardar cambios</Button>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => setEditing(true)} className="min-h-12 rounded-2xl bg-slate-100 text-base font-bold text-slate-700">Cambiar</button>
      <button type="button" disabled={busy || used} onClick={remove} className="min-h-12 rounded-2xl bg-red-50 text-base font-bold text-red-700 disabled:opacity-50">Borrar tarjeta</button>
      {used && <p className="col-span-2 text-center text-sm text-slate-500">Ya se usó para pagar, así que no se puede borrar.</p>}
      {error && <p role="alert" className="col-span-2 rounded-xl bg-red-100 p-2 font-semibold text-red-800">{error}</p>}
    </div>
  )
}
