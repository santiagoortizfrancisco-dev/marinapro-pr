import { useEffect, useRef, useState } from 'react'

const DAY = 24 * 60 * 60 * 1000

/**
 * Borrador: lo que se va escribiendo en un formulario se guarda en el celular.
 * Si sales de la pantalla a mitad y vuelves, sigue donde lo dejaste (hasta 1 día).
 * `key` null = sin borrador (por ejemplo, al editar algo que ya existe).
 */
export function useDraft<T>(key: string | null, snapshot: T, apply: (draft: T) => void) {
  const [restored, setRestored] = useState(false)
  const ready = useRef(false)
  const initial = useRef(JSON.stringify(snapshot))
  const json = JSON.stringify(snapshot)

  // Al entrar: si hay borrador, se pone
  useEffect(() => {
    if (!key) return
    try {
      const raw = localStorage.getItem(key)
      const saved = raw ? (JSON.parse(raw) as { t: number; v: T }) : null
      if (saved && Date.now() - saved.t < DAY && JSON.stringify(saved.v) !== initial.current) {
        apply(saved.v)
        setRestored(true)
      }
    } catch { /* sin memoria: no pasa nada */ }
    ready.current = true
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras escribe: se guarda (solo si cambió algo)
  useEffect(() => {
    if (!key || !ready.current) return
    try {
      if (json === initial.current) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: JSON.parse(json) }))
    } catch { /* sin memoria: no pasa nada */ }
  }, [key, json])

  /** Se guardó de verdad (o empieza de nuevo): se borra el borrador. */
  function clear() {
    if (key) try { localStorage.removeItem(key) } catch { /* nada */ }
    setRestored(false)
  }

  return { restored, clear }
}
