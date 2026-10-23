import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { CalendarHeart, Check, CheckCircle2, ChevronDown, Copy, Smartphone } from 'lucide-react'
import Confetti from '../../components/Confetti'
import { WhatsAppIcon } from '../../components/BrandIcons'
import { logoUrl } from '../../lib/brand'
import { formatDate, formatLongDate, formatMoney, formatTime } from '../../lib/format'
import { whatsappLink } from '../../lib/links'
import { minutesLabel } from '../../lib/salon'
import { supabase } from '../../lib/supabase'

interface Cita {
  business: string; phone: string | null; town: string | null; logo_path: string | null; ath: string | null; policies: string | null; ivu_rate: number
  client: string; starts_at: string; duration_min: number; status: string; staff: string | null; deposit: number | null
  client_ok_at: string | null; reported_at: string | null; deposit_ok_at: string | null; charge_ivu: boolean
  services: { name: string; price: number }[]
}

/** Lo que ve la clienta en el link de su cita: la cita, el estimado, el depósito y un botón para aceptar. */
export default function CitaPublic() {
  const { id } = useParams()
  const [cita, setCita] = useState<Cita | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [justSent, setJustSent] = useState(false)

  async function load() {
    if (!supabase) return
    const { data } = await supabase.rpc('cita_public', { p_id: id })
    setCita((data as Cita | null) ?? null)
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (cita === undefined) return <div className="flex min-h-dvh items-center justify-center bg-pink-50"><div className="h-10 w-10 animate-spin rounded-full border-4 border-pink-100 border-t-pink-600" /></div>
  if (cita === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-pink-50 px-6 text-center">
        <CalendarHeart size={48} className="text-pink-400" />
        <h1 className="text-2xl font-extrabold text-slate-900">No encontramos esta cita</h1>
        <p className="text-base text-slate-600">Pregúntale al salón por WhatsApp.</p>
      </div>
    )
  }

  const deposit = Number(cita.deposit) || 0
  const priced = cita.services.filter((s) => Number(s.price) > 0)
  const subtotal = priced.reduce((t, s) => t + Number(s.price), 0)
  const ivu = cita.charge_ivu ? Math.round(subtotal * Number(cita.ivu_rate) * 100) / 100 : 0
  const total = subtotal + ivu
  const cancelled = cita.status === 'cancelled'
  const accepted = Boolean(cita.client_ok_at)
  const logo = logoUrl(cita.logo_path)

  async function accept() {
    if (!supabase) return
    setBusy(true)
    await supabase.rpc('cita_reply', { p_id: id })
    await load()
    setJustSent(true)
    setBusy(false)
  }

  async function copyAth() {
    try { await navigator.clipboard.writeText((cita!.ath ?? '').replace(/\D/g, '')) } catch { /* sin permiso: se ve el número */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-pink-100 via-pink-50 to-white px-5 py-8" data-trade="beauty">
      {justSent && <Confetti />}
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3">
          {logo && <img src={logo} alt="" className="h-14 w-14 rounded-2xl bg-white object-contain" />}
          <div>
            <div className="text-xl font-extrabold text-slate-900">{cita.business}</div>
            {cita.town && <div className="text-sm text-slate-600">{cita.town}</div>}
          </div>
        </header>

        <h1 className="mt-6 text-3xl font-black text-slate-900">Hola {cita.client} 💅</h1>
        <p className="mt-1 text-lg text-slate-700">{cancelled ? 'Esta cita quedó cancelada.' : 'Esta es tu cita:'}</p>

        <section className="mt-4 rounded-3xl bg-white p-4 shadow-[0_8px_30px_-18px_rgba(157,23,77,0.45)] ring-1 ring-pink-100">
          <div className="text-xl font-extrabold text-slate-900">{formatLongDate(cita.starts_at)}</div>
          <div className="text-lg text-slate-700">{formatTime(cita.starts_at)} · {minutesLabel(cita.duration_min)}{cita.staff ? ` · con ${cita.staff}` : ''}</div>
          <div className="text-sm text-slate-500">{formatDate(cita.starts_at)}</div>
        </section>

        {cita.services.length > 0 && (
          <section className="mt-4 rounded-3xl bg-white p-4 ring-1 ring-pink-100">
            <h2 className="mb-2 text-lg font-extrabold text-slate-900">Estimado</h2>
            <ul className="divide-y divide-dashed divide-slate-200">
              {cita.services.map((s, i) => (
                <li key={i} className="flex min-h-11 items-center justify-between gap-3 text-base">
                  <span className="font-bold text-slate-900">{s.name}</span>
                  <span className="shrink-0 text-slate-700">{Number(s.price) > 0 ? formatMoney(Number(s.price)) : 'Precio al llegar'}</span>
                </li>
              ))}
            </ul>
            {subtotal > 0 && (
              <div className="mt-2 border-t border-slate-200 pt-2 text-base">
                {ivu > 0 && <div className="flex justify-between text-slate-600"><span>IVU</span><span>{formatMoney(ivu)}</span></div>}
                <div className="flex justify-between text-lg font-extrabold text-slate-900"><span>Total aproximado</span><span>{formatMoney(total)}</span></div>
                {deposit > 0 && <div className="flex justify-between text-emerald-700"><span>Depósito (se resta)</span><span>−{formatMoney(deposit)}</span></div>}
              </div>
            )}
            <p className="mt-2 text-sm text-slate-500">El precio final puede cambiar según lo que te hagas.</p>
          </section>
        )}

        {deposit > 0 && !cancelled && (
          <section className="mt-4 rounded-3xl bg-white p-4 ring-2 ring-orange-200">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><Smartphone className="text-orange-600" /> Depósito para separar tu cita</h2>
            <div className="mt-2 text-4xl font-black text-slate-900">{formatMoney(deposit)}</div>
            {cita.deposit_ok_at ? (
              <p className="mt-2 flex items-center gap-2 text-base font-bold text-emerald-700"><CheckCircle2 /> Recibido. ¡Tu cita está separada!</p>
            ) : cita.ath ? (
              <>
                <p className="mt-2 text-base text-slate-700">Envíalo por <b>ATH Móvil</b> al:</p>
                <button type="button" onClick={copyAth} className="mt-2 flex min-h-14 w-full items-center justify-between gap-2 rounded-2xl bg-orange-50 px-4 text-left ring-1 ring-orange-200 active:bg-orange-100">
                  <span className="font-mono text-2xl font-extrabold text-slate-900">{cita.ath}</span>
                  <span className="flex items-center gap-1 text-sm font-bold text-orange-700">{copied ? <><Check size={18} /> Copiado</> : <><Copy size={18} /> Copiar</>}</span>
                </button>
                <p className="mt-2 text-sm text-slate-500">Abre ATH Móvil, envía {formatMoney(deposit)} a ese número y vuelve aquí.</p>
              </>
            ) : <p className="mt-2 text-base text-slate-700">Pregúntale al salón cómo enviarlo.</p>}
          </section>
        )}

        {!cancelled && (accepted ? (
          <section className="mt-5 rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
            <p className="flex items-center gap-2 text-xl font-extrabold text-emerald-800"><CheckCircle2 /> ¡Listo! Aceptaste tu cita</p>
            {deposit > 0 && !cita.deposit_ok_at && <p className="mt-1 text-base text-emerald-900">{cita.business} va a verificar tu depósito y te avisa.</p>}
            {cita.phone && (
              <a href={whatsappLink(cita.phone, `Hola, soy ${cita.client}. Acepté mi cita del ${formatDate(cita.starts_at)} a las ${formatTime(cita.starts_at)}${deposit > 0 ? ` y envié el depósito de ${formatMoney(deposit)} por ATH Móvil. Aquí va la foto del recibo:` : '.'}`)} target="_blank" rel="noreferrer"
                className="mt-3 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-lg font-bold text-white"><WhatsAppIcon size={24} /> {deposit > 0 ? 'Enviarle la foto del recibo' : 'Escribirle al salón'}</a>
            )}
          </section>
        ) : (
          <button type="button" disabled={busy} onClick={accept}
            className="mt-5 flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 px-3 text-lg font-extrabold text-white shadow-lg shadow-pink-900/20 active:bg-pink-700 disabled:opacity-60">
            <Check /> {deposit > 0 ? `Acepto y ya envié el depósito` : 'Acepto mi cita'}
          </button>
        ))}

        {cita.policies && (
          <details className="group mt-5 rounded-3xl bg-white p-4 ring-1 ring-pink-100">
            <summary className="flex cursor-pointer list-none items-center justify-between text-base font-bold text-slate-800">Políticas del salón <ChevronDown size={20} className="transition group-open:rotate-180" /></summary>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{cita.policies}</p>
          </details>
        )}
        <p className="mt-8 text-center text-xs text-slate-400">Hecho con FacturaFácil PR</p>
      </div>
    </div>
  )
}
