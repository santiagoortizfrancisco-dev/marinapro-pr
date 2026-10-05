/** Links para llamar, WhatsApp, email y mapas. */

function digits(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length === 10 ? `1${d}` : d // números de PR/EE.UU. sin el 1
}

export function telLink(phone: string): string {
  return `tel:+${digits(phone)}`
}

export function whatsappLink(phone: string, text?: string): string {
  return `https://wa.me/${digits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function mailLink(email: string): string {
  return `mailto:${email}`
}

interface Place {
  lat: number | null
  lng: number | null
  marina_name?: string | null
  town?: string | null
}

function placeQuery(p: Place): string {
  return [p.marina_name, p.town, 'Puerto Rico'].filter(Boolean).join(', ')
}

export function googleMapsLink(p: Place): string {
  const q = p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : placeQuery(p)
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export function wazeLink(p: Place): string {
  return p.lat != null && p.lng != null
    ? `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(placeQuery(p))}&navigate=yes`
}

export function hasPlace(p: Place): boolean {
  return (p.lat != null && p.lng != null) || Boolean(p.marina_name || p.town)
}
