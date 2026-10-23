import { History } from 'lucide-react'

/** "Seguiste donde te quedaste": sale cuando se recuperó un borrador. */
export default function DraftBanner({ onReset }: { onReset: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-2xl bg-sky-50 px-3 py-2 ring-1 ring-sky-200">
      <History size={20} className="shrink-0 text-sky-700" />
      <span className="flex-1 text-base font-bold text-sky-900">Seguiste donde te quedaste</span>
      <button type="button" onClick={onReset} className="min-h-11 shrink-0 rounded-xl px-2 text-sm font-bold text-sky-800 underline">Empezar de nuevo</button>
    </div>
  )
}
