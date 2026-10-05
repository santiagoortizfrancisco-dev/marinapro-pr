import { useEffect, type ReactNode } from 'react'

/** Ventana que sube desde abajo (fácil de alcanzar con el pulgar). */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="safe-bottom w-full max-w-xl rounded-t-3xl bg-white px-5 pb-6 pt-3" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
        <h2 className="mb-4 text-xl font-extrabold text-navy-900">{title}</h2>
        {children}
      </div>
    </div>
  )
}

/** Aviso corto arriba de las pestañas. */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-20 flex justify-center px-4" role="status">
      <div className="max-w-md rounded-2xl bg-slate-900 px-5 py-4 text-center text-base font-semibold text-white shadow-lg">{message}</div>
    </div>
  )
}
