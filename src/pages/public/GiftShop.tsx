import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CheckCircle2, Copy, Gift, Smartphone } from 'lucide-react'
import Confetti from '../../components/Confetti'
import ChristmasBanner from '../../components/ChristmasBanner'
import { WhatsAppIcon } from '../../components/BrandIcons'
import { Input } from '../../components/ui'
import { logoUrl } from '../../lib/brand'
import { formatMoney } from '../../lib/format'
import { whatsappLink } from '../../lib/links'
import { usePublicSeason, type Season } from '../../lib/season'
import { supabase } from '../../lib/supabase'

const AMOUNTS = [25, 50, 75, 100]
const bg = (season: Season) => `min-h-dvh bg-gradient-to-b ${season === 'christmas' ? 'from-red-100 via-white to-green-50' : 'from-pink-100 via-pink-50 to-white'} px-5 py-8`

function Spinner() {
  return <div className="flex min-h-dvh items-center justify-center bg-pink-50"><div className="h-10 w-10 animate-spin rounded-full border-4 border-pink-100 border-t-pink-600" /></div>
}

function NotFound({ text }: { text: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-pink-50 px-6 text-center">
      <Gift size={48} className="text-pink-400" />
      <h1 className="text-2xl font-extrabold text-slate-900">{text}</h1>
      <p className="text-base text-slate-600">Pregúntale al negocio por WhatsApp.</p>
    </div>
  )
}

function Header({ business, logo, town }: { business: string; logo: string | null; town?: string | null }) {
  return (
    <header className="flex items-center gap-3">
      {logo && <img src={logo} alt="" className="h-14 w-14 rounded-2xl bg-white object-contain" />}
      <div>
        <div className="text-xl font-extrabold text-slate-900">{business}</div>
        {town && <div className="text-base text-slate-600">{town}</div>}
      </div>
    </header>
  )
}

interface Shop { business: string; town: string | null; phone: string | null; logo_path: string | null; ath: string }

/** /regalar/:ref — la clienta escoge la tarjeta de regalo y la pide. */
export function GiftShop() {
  const { ref } = useParams()
  const season = usePublicSeason('regalar', ref)
  const navigate = useNavigate()
  const [shop, setShop] = useState<Shop | null | undefined>(undefined)
  const [amount, setAmount] = useState(50)
  const [other, setOther] = useState('')
  const [buyer, setBuyer] = useState('')
  const [phone, setPhone] = useState('')
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.rpc('gift_shop_page', { p_ref: ref }).then(({ data }) => setShop((data as Shop | null) ?? null))
  }, [ref])

  if (shop === undefined) return <Spinner />
  if (shop === null) return <NotFound text="Este negocio no está vendiendo tarjetas por aquí" />

  const otherValue = Number(other.replace(/[^0-9.]/g, ''))
  const value = other.trim() ? otherValue : amount

  async function order() {
    if (!supabase) return
    if (!(value >= 5 && value <= 1000)) return setError('Escoge una cantidad entre $5 y $1,000.')
    if (!buyer.trim()) return setError('Escribe tu nombre.')
    if (phone.replace(/\D/g, '').length < 10) return setError('Escribe tu número de WhatsApp (10 dígitos).')
    setBusy(true)
    setError('')
    const { data, error: e } = await supabase.rpc('gift_order_create', { p_ref: ref, p_amount: value, p_buyer: buyer.trim(), p_phone: phone.trim(), p_recipient: recipient.trim() || null })
    setBusy(false)
    if (e || !data) return setError(e?.message?.replace(/^.*?:\s*/, '') || 'No se pudo pedir. Intenta otra vez.')
    navigate(`/regalar/pedido/${data}`)
  }

  return (
    <div className={bg(season)} data-trade="beauty">
      <div className="mx-auto max-w-md">
        {season === 'christmas' && <ChristmasBanner business={shop.business} />}
        <Header business={shop.business} logo={logoUrl(shop.logo_path)} town={shop.town} />
        <div className="mt-6 text-center">
          <div className="text-6xl">🎁</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">{season === 'christmas' ? 'Regala belleza esta Navidad' : 'Regala una tarjeta de regalo'}</h1>
          <p className="mt-1 text-lg text-slate-700">Escoge la cantidad, paga por ATH Móvil y te llega la tarjeta por WhatsApp.</p>
        </div>

        <section aria-label="Tu tarjeta" className="mt-6 space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-pink-100">
          <div>
            <div className="mb-2 text-base font-extrabold text-slate-800">¿De cuánto?</div>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="¿De cuánto?">
              {AMOUNTS.map((v) => {
                const on = !other.trim() && amount === v
                return (
                  <button key={v} type="button" role="radio" aria-checked={on} onClick={() => { setAmount(v); setOther('') }}
                    className={`min-h-14 rounded-2xl text-lg font-extrabold ${on ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-700'}`}>${v}</button>
                )
              })}
            </div>
            <Input aria-label="Otra cantidad" inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Otra cantidad" className="mt-2 text-center" />
          </div>
          <Input aria-label="Para quién es" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="¿Para quién es? (opcional)" />
          <Input aria-label="Tu nombre" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Tu nombre" autoComplete="name" />
          <Input aria-label="Tu WhatsApp" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu WhatsApp (ahí te llega la tarjeta)" autoComplete="tel" />
          {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
          <button type="button" disabled={busy} onClick={order}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 text-xl font-extrabold text-white shadow-lg shadow-pink-900/20 active:bg-pink-700 disabled:opacity-60">
            <Gift /> {busy ? 'Pidiendo…' : value >= 5 ? `Pedir tarjeta de ${formatMoney(value)}` : 'Pedir tarjeta'}
          </button>
        </section>
        <p className="mt-6 text-center text-sm text-slate-500">Hecho con FacturaFácil PR</p>
      </div>
    </div>
  )
}

interface Order { business: string; phone: string | null; logo_path: string | null; ath: string | null; amount: number; buyer: string; recipient: string | null; status: string; reported_at: string | null; gift_card_id: string | null }

/** /regalar/pedido/:id — pagar por ATH Móvil, avisar, y ver la tarjeta cuando el negocio la confirma. */
export function GiftOrder() {
  const { id } = useParams()
  const season = usePublicSeason('pedido', id)
  const [o, setO] = useState<Order | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!supabase) return
    const { data } = await supabase.rpc('gift_order_public', { p_id: id })
    setO((data as Order | null) ?? null)
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Mientras espera, mirar cada 20 segundos si ya la confirmaron
  useEffect(() => {
    if (!o || o.status !== 'pending' || !o.reported_at) return
    const t = setInterval(load, 20000)
    return () => clearInterval(t)
  }, [o?.status, o?.reported_at]) // eslint-disable-line react-hooks/exhaustive-deps

  if (o === undefined) return <Spinner />
  if (o === null) return <NotFound text="No encontramos este pedido" />

  const amount = formatMoney(Number(o.amount))
  async function paid() {
    if (!supabase) return
    setBusy(true)
    await supabase.rpc('gift_order_paid', { p_id: id })
    await load()
    setBusy(false)
  }
  async function copyAth() {
    try { await navigator.clipboard.writeText((o!.ath ?? '').replace(/\D/g, '')) } catch { /* se ve el número */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className={bg(season)} data-trade="beauty">
      {o.status === 'done' && <Confetti />}
      <div className="mx-auto max-w-md">
        {season === 'christmas' && <ChristmasBanner business={o.business} />}
        <Header business={o.business} logo={logoUrl(o.logo_path)} />
        <section aria-label="Tu pedido" className="mt-6 rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-pink-100">
          <div className="text-5xl">🎁</div>
          <p className="mt-1 text-lg text-slate-700">Tarjeta de regalo{o.recipient ? <> para <b>{o.recipient}</b></> : null}</p>
          <p className="text-4xl font-black text-pink-700">{amount}</p>
        </section>

        {o.status === 'done' && o.gift_card_id ? (
          <section className="mt-5 rounded-3xl bg-emerald-50 p-5 text-center ring-1 ring-emerald-200">
            <p className="flex items-center justify-center gap-2 text-xl font-extrabold text-emerald-800"><CheckCircle2 /> ¡Tu tarjeta está lista!</p>
            <Link to={`/regalo/${o.gift_card_id}`} className="mt-3 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-pink-600 text-lg font-bold text-white"><Gift /> Ver mi tarjeta de regalo</Link>
          </section>
        ) : o.status === 'cancelled' ? (
          <p className="mt-5 rounded-2xl bg-slate-100 p-4 text-center text-base text-slate-700">Este pedido se canceló. Pregúntale a {o.business} por WhatsApp.</p>
        ) : o.reported_at ? (
          <section className="mt-5 space-y-3 rounded-3xl bg-emerald-50 p-5 text-center ring-1 ring-emerald-200">
            <p className="flex items-center justify-center gap-2 text-xl font-extrabold text-emerald-800"><CheckCircle2 /> ¡Gracias, {o.buyer.split(' ')[0]}!</p>
            <p className="text-base text-emerald-900">{o.business} va a verificar tu pago y te envía la tarjeta por WhatsApp. También sale aquí mismo.</p>
            {o.phone && (
              <a href={whatsappLink(o.phone, `Hola, soy ${o.buyer}. Envié ${amount} por ATH Móvil para una tarjeta de regalo${o.recipient ? ` para ${o.recipient}` : ''}. Aquí va la foto del recibo:`)} target="_blank" rel="noreferrer"
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-lg font-bold text-white"><WhatsAppIcon size={24} /> Enviar foto del recibo</a>
            )}
          </section>
        ) : (
          <section aria-label="Cómo pagar" className="mt-5 space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-pink-100">
            <p className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><Smartphone className="text-orange-600" /> Paga {amount} por ATH Móvil</p>
            <p className="text-base text-slate-700">1. Abre ATH Móvil y envía <b>{amount}</b> a este número:</p>
            <button type="button" onClick={copyAth} className="flex min-h-14 w-full items-center justify-between gap-2 rounded-2xl bg-orange-50 px-4 text-left ring-1 ring-orange-200 active:bg-orange-100">
              <span className="font-mono text-2xl font-extrabold text-orange-700">{o.ath}</span>
              <span className="flex items-center gap-1 text-sm font-bold text-orange-700"><Copy size={18} /> {copied ? 'Copiado ✓' : 'Copiar'}</span>
            </button>
            <p className="text-base text-slate-700">2. Cuando lo envíes, toca aquí:</p>
            <button type="button" disabled={busy} onClick={paid}
              className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 text-lg font-extrabold text-white shadow-lg shadow-pink-900/20 active:bg-pink-700 disabled:opacity-60">
              <CheckCircle2 /> Ya envié el ATH Móvil
            </button>
          </section>
        )}
        <p className="mt-6 text-center text-sm text-slate-500">Hecho con FacturaFácil PR</p>
      </div>
    </div>
  )
}
