import { useState } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import { useLoad } from '../lib/useLoad'
import { useWords } from '../lib/trade'

/**
 * La cuenta nueva empieza con ejemplos para ver cómo funciona el app.
 * Este aviso lo dice y los borra con un toque (los de verdad no se tocan).
 */
export default function ExamplesBanner() {
  const w = useWords()
  const [busy, setBusy] = useState(false)
  const { data: has } = useLoad(async () => {
    const { data } = await db().from('clients').select('id').eq('is_example', true).limit(1)
    return Boolean(data && data.length)
  }, [])

  if (!has) return null

  async function clear() {
    if (!window.confirm(`¿Borrar los ejemplos? Se borran ${w.salon ? 'las clientas, citas' : 'los clientes, citas'} y cobros de ejemplo. Lo tuyo no se toca.`)) return
    setBusy(true)
    await db().rpc('clear_examples')
    window.location.reload()
  }

  return (
    <div className="mb-5 rounded-3xl bg-amber-50 p-4 ring-1 ring-amber-200" role="status" aria-label="Ejemplos">
      <p className="flex items-center gap-2 text-lg font-extrabold text-amber-950"><Sparkles size={22} /> Estos son ejemplos</p>
      <p className="mt-1 text-base text-amber-900">Los pusimos para que veas cómo funciona: tócalos, cobra, mira la factura. Cuando estés listo, bórralos y empieza con lo tuyo.</p>
      <button type="button" disabled={busy} onClick={clear}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-base font-bold text-amber-900 ring-2 ring-amber-300 active:bg-amber-100 disabled:opacity-60">
        <Trash2 size={20} /> {busy ? 'Borrando…' : 'Borrar ejemplos y empezar'}
      </button>
    </div>
  )
}
