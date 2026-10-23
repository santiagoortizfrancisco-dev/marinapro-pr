import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Gift } from 'lucide-react'
import Confetti from '../../components/Confetti'
import { WhatsAppIcon } from '../../components/BrandIcons'
import { GiftCardView, type GiftCard } from '../mechanic/GiftCards'
import { formatMoney } from '../../lib/format'
import { whatsappLink } from '../../lib/links'
import { supabase } from '../../lib/supabase'

interface PublicCard { business: string; phone: string | null; town: string | null; code: string; amount: number; balance: number; recipient_name: string | null; buyer_name: string | null }

/** Lo que ve quien recibe la tarjeta de regalo: la tarjeta en grande, con confeti. */
export default function GiftCardPublic() {
  const { id } = useParams()
  const [card, setCard] = useState<PublicCard | null | undefined>(undefined)
  useEffect(() => {
    if (!supabase) return
    supabase.rpc('gift_card_public', { p_id: id }).then(({ data }) => setCard((data as PublicCard | null) ?? null))
  }, [id])

  if (card === undefined) return <div className="flex min-h-dvh items-center justify-center bg-pink-50"><div className="h-10 w-10 animate-spin rounded-full border-4 border-pink-100 border-t-pink-600" /></div>
  if (card === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-pink-50 px-6 text-center">
        <Gift size={48} className="text-pink-400" />
        <h1 className="text-2xl font-extrabold text-slate-900">No encontramos esta tarjeta</h1>
        <p className="text-base text-slate-600">Pregúntale al salón que te la dio.</p>
      </div>
    )
  }

  const first = card.recipient_name?.split(' ')[0]
  const asCard = { id: id!, code: card.code, amount: card.amount, balance: card.balance, recipient_name: card.recipient_name, buyer_name: card.buyer_name, phone: null, method: 'cash', sold_at: '' } as GiftCard
  return (
    <div className="min-h-dvh bg-gradient-to-b from-pink-100 via-pink-50 to-white px-5 py-10" data-trade="beauty">
      <Confetti />
      <div className="mx-auto max-w-md text-center">
        <div className="text-6xl">🎁</div>
        <h1 className="mt-2 text-3xl font-black text-slate-900">¡{first ? `${first}, tienes` : 'Tienes'} un regalo!</h1>
        {card.buyer_name && <p className="mt-1 text-lg text-slate-700">De parte de <b>{card.buyer_name}</b> 💖</p>}
        <div className="mt-6 text-left"><GiftCardView card={asCard} business={card.business} /></div>
        {Number(card.balance) < Number(card.amount) && (
          <p className="mt-3 text-base font-bold text-pink-800">{Number(card.balance) > 0 ? `Le queda ${formatMoney(Number(card.balance))}` : 'Esta tarjeta ya se usó completa'}</p>
        )}
        <p className="mt-5 text-lg text-slate-700">Enséñale el código <b className="font-mono">{card.code}</b> a <b>{card.business}</b> cuando vayas, y se resta de lo que te hagas. 💅</p>
        {card.phone && (
          <a href={whatsappLink(card.phone, `Hola, tengo una tarjeta de regalo (${card.code}) y quiero sacar una cita.`)} target="_blank" rel="noreferrer"
            className="mt-6 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-lg font-bold text-white shadow-lg"><WhatsAppIcon size={24} /> Sacar mi cita</a>
        )}
        <p className="mt-8 text-xs text-slate-400">Hecho con FacturaFácil PR</p>
      </div>
    </div>
  )
}
