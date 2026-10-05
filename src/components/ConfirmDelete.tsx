import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Sheet } from './Sheet'
import { Button } from './ui'

/** Botón "Borrar" que pregunta antes de borrar. */
export default function ConfirmDelete({ label, question, detail, onConfirm }: { label: string; question: string; detail?: string; onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (e) {
      console.error(e)
      setError('No se pudo borrar. Intenta otra vez.')
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="danger" onClick={() => setOpen(true)} className="mt-8">
        <Trash2 /> {label}
      </Button>
      <Sheet open={open} title={question} onClose={() => !busy && setOpen(false)}>
        {detail && <p className="mb-5 text-base text-slate-600">{detail}</p>}
        {error && <p className="mb-3 rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
        <div className="space-y-3">
          <Button onClick={confirm} disabled={busy} className="bg-red-700 active:bg-red-800">
            <Trash2 /> {busy ? 'Borrando…' : 'Sí, borrar'}
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
        </div>
      </Sheet>
    </>
  )
}
