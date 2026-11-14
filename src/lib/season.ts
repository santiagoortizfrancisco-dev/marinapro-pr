import { useEffect, useSyncExternalStore } from 'react'
import { db } from './db'

/** Época del año que el negocio prendió en Más (por ahora solo Navidad). */
export type Season = 'christmas' | null

let current: Season = null
const listeners = new Set<() => void>()

export function getSeason(): Season {
  return current
}

/** Prender o apagar la época: cambia los colores (index.css) y los mensajes de WhatsApp. */
export function setSeason(s: Season) {
  current = s
  if (typeof document !== 'undefined') {
    if (s) document.body.dataset.season = s
    else delete document.body.dataset.season
  }
  listeners.forEach((l) => l())
}

export function useSeason(): Season {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, getSeason, getSeason)
}

export const CHRISTMAS_GREETING = '🎄 ¡Felices Fiestas! 🎁'

/** El mensaje de WhatsApp con su toque de Navidad (si está prendida). */
export function festive(text: string): string {
  if (current !== 'christmas' || !text.trim() || text.includes('Felices Fiestas')) return text
  return `${text.replace(/💅/g, '🎄').trimEnd()}\n\n${CHRISTMAS_GREETING}`
}

/** Páginas que abre la clientela (factura, cita, reservar, regalo): toman la época del negocio. */
export function usePublicSeason(kind: 'doc' | 'cita' | 'reservar' | 'regalo', ref: string | undefined): Season {
  useEffect(() => {
    if (!ref) return
    let alive = true
    db().rpc('public_season', { p_kind: kind, p_ref: ref }).then(({ data }) => {
      if (alive) setSeason(data === 'christmas' ? 'christmas' : null)
    })
    return () => { alive = false }
  }, [kind, ref])
  return useSeason()
}
