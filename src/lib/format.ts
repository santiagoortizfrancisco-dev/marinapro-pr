export const TIME_ZONE = 'America/Puerto_Rico'

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

/** Siempre dd/mm/aaaa en hora de Puerto Rico (el locale es-PR usa mm/dd, por eso se arma a mano). */
export function formatDate(date: Date | string): string {
  const p = parts(new Date(date), { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${p.day}/${p.month}/${p.year}`
}

/** "2:30 PM" en hora de Puerto Rico */
export function formatTime(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(new Date(date))
}

/** "Lunes, 5 de octubre" */
export function formatLongDate(date: Date | string): string {
  const text = new Intl.DateTimeFormat('es-PR', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(date))
  return text.charAt(0).toUpperCase() + text.slice(1)
}
