import { CHRISTMAS_GREETING } from '../lib/season'

/** Saludo de Navidad arriba de las páginas que abre la clientela. */
export default function ChristmasBanner({ business }: { business?: string | null }) {
  return (
    <div role="note" aria-label="Felices Fiestas" className="mb-4 rounded-2xl border-2 border-[#166534] bg-[#b91c1c] px-4 py-3 text-center text-white shadow">
      <p className="text-lg font-extrabold">{CHRISTMAS_GREETING}</p>
      {business && <p className="text-sm font-semibold text-white/90">de parte de {business} ❄️</p>}
    </div>
  )
}
