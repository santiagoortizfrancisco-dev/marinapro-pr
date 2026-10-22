import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

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
      <div className="safe-bottom max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white px-5 pb-6 pt-3" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
        <div className="mb-4 flex items-center gap-2">
          <h2 className="flex-1 text-xl font-extrabold text-navy-900">{title}</h2>
          {/* Siempre hay cómo salir sin hacer nada */}
          <button type="button" onClick={onClose} aria-label="Cerrar ventana" className="-mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"><X size={24} /></button>
        </div>
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
