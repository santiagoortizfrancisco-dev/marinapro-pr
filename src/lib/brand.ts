import { supabase } from './supabase'

/** Colores para la barra del app y la factura (todos oscuros para que el texto blanco se lea al sol). */
export const BRAND_COLORS = [
  { value: '#0c4a6e', label: 'Azul océano' },
  { value: '#0b3b5c', label: 'Azul marino' },
  { value: '#0b0b0f', label: 'Negro' },
  { value: '#1d4ed8', label: 'Azul eléctrico' },
  { value: '#1e3a8a', label: 'Azul rey' },
  { value: '#115e59', label: 'Verde mar' },
  { value: '#166534', label: 'Verde' },
  { value: '#b91c1c', label: 'Rojo' },
  { value: '#334155', label: 'Gris' },
]

export const DEFAULT_BRAND = '#0c4a6e'

export function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null
  // Logos que vienen con el app (ej. '/brands/jqr-boat-repair.jpg')
  if (path.startsWith('/')) return path
  if (!supabase) return null
  return supabase.storage.from('logos').getPublicUrl(path).data.publicUrl
}

/** Avisar a la barra de arriba que cambiaron el logo o el color. */
export const BRAND_EVENT = 'marinapro:brand'
export function notifyBrandChanged() {
  window.dispatchEvent(new Event(BRAND_EVENT))
}
