import { TRADES, type Trade } from '../lib/trade'

/** "¿A qué te dedicas?": botones grandes con su dibujito. */
export default function TradePicker({ value, onChange, dark = false }: { value: Trade | null; onChange: (t: Trade) => void; dark?: boolean }) {
  return (
    <div role="radiogroup" aria-label="¿A qué te dedicas?" className="grid grid-cols-2 gap-2">
      {TRADES.map((t) => {
        const on = value === t.value
        return (
          <button key={t.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(t.value)}
            className={`flex min-h-16 items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left text-base font-bold transition active:scale-[0.98] ${
              on ? 'border-navy-800 bg-navy-800 text-white' : dark ? 'border-white/30 bg-white/10 text-white' : 'border-slate-300 bg-white text-slate-900'
            }`}>
            <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
            <span className="min-w-0 text-[15px] leading-tight">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
