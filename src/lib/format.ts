export const TIME_ZONE = 'America/Puerto_Rico'
/** Puerto Rico no cambia la hora: siempre UTC-4. */
const PR_OFFSET = '-04:00'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** 1234.5 -> "$1,234.50" */
export function formatMoney(amount: number): string {
  return money.format(amount)
}

function parts(date: Date, options: Intl.DateTimeFormatOptions) {
  const out: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, ...options }).formatToParts(date)) {
    out[p.type] = p.value
  }
  return out
}

/** "YYYY-MM-DD" se interpreta como día de Puerto Rico (a mediodía, para no brincar de día). */
function toDate(date: Date | string): Date {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date(`${date}T12:00:00${PR_OFFSET}`)
  return new Date(date)
}

/** Siempre dd/mm/aaaa en hora de Puerto Rico (el locale es-PR usa mm/dd, por eso se arma a mano). */
export function formatDate(date: Date | string): string {
  const p = parts(toDate(date), { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${p.day}/${p.month}/${p.year}`
}

/** "2:30 PM" en hora de Puerto Rico */
export function formatTime(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(new Date(date))
}

/** "Lunes, 5 de octubre" */
export function formatLongDate(date: Date | string): string {
  const text = new Intl.DateTimeFormat('es-PR', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(date))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "lun 6" */
export function formatShortDay(day: string): string {
  return new Intl.DateTimeFormat('es-PR', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric' }).format(toDate(day))
}

/** Hoy en Puerto Rico como "YYYY-MM-DD". */
export function todayPR(): string {
  return prDay(new Date())
}

/** Fecha/hora -> día de Puerto Rico "YYYY-MM-DD". */
export function prDay(date: Date | string): string {
  const p = parts(new Date(date), { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${p.year}-${p.month}-${p.day}`
}

/** Fecha/hora -> "HH:MM" (24 h) en Puerto Rico, para los campos de hora. */
export function prTime(date: Date | string): string {
  const p = parts(new Date(date), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${p.hour}:${p.minute}`
}

/** Día + hora de Puerto Rico -> ISO para guardar. */
export function prToISO(day: string, time: string): string {
  return new Date(`${day}T${time}:00${PR_OFFSET}`).toISOString()
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Lunes de la semana de ese día. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay() // 0 = domingo
  return addDays(day, dow === 0 ? -6 : 1 - dow)
}

/** Rango [desde, hasta) en ISO para buscar citas de varios días de Puerto Rico. */
export function prRange(fromDay: string, days: number): [string, string] {
  return [new Date(`${fromDay}T00:00:00${PR_OFFSET}`).toISOString(), new Date(`${addDays(fromDay, days)}T00:00:00${PR_OFFSET}`).toISOString()]
}

/** Sumar meses a un día "YYYY-MM-DD" (si el mes no tiene ese día, queda en el último del mes). */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}

/** Días desde hoy (PR) hasta ese día: negativo si ya pasó. */
export function daysUntil(day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${todayPR()}T00:00:00Z`)) / 86400000)
}

/** "hoy", "hace 12 días", "hace 5 meses", "hace 2 años" */
export function ago(date: string): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days < 1) return 'hoy'
  if (days < 30) return `hace ${days} ${days === 1 ? 'día' : 'días'}`
  const months = Math.floor(days / 30.4)
  if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`
  const years = Math.floor(days / 365)
  return `hace ${years} ${years === 1 ? 'año' : 'años'}`
}
