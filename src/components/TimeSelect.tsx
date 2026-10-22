/** "14:30" -> "2:30 PM" (hora regular) */
export function time12(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * Escoger una hora en formato regular (2:30 PM), no de 24 horas.
 * Si la hora guardada no está en la lista (ej. 2:10), se añade para no perderla.
 */
export default function TimeSelect({ value, onChange, step = 15, from = 6, to = 22, className = '', ...rest }: {
  value: string; onChange: (v: string) => void; step?: number; from?: number; to?: number; className?: string; 'aria-label'?: string; required?: boolean
}) {
  const options: string[] = []
  for (let m = from * 60; m <= to * 60; m += step) options.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  if (value && !options.includes(value)) options.push(value)
  options.sort()
  return (
    <select {...rest} value={value} onChange={(e) => onChange(e.target.value)}
      className={`block min-h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg ${className}`}>
      {options.map((t) => <option key={t} value={t}>{time12(t)}</option>)}
    </select>
  )
}
