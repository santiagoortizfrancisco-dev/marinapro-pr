import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { PHOTO_KINDS } from '../lib/catalog'
import { db } from '../lib/db'
import { compressImage } from '../lib/image'
import type { Photo } from '../lib/types'

/** Fotos del trabajo: antes, pieza vieja, pieza nueva, después. Se achican en el celular antes de subirlas. */
export default function PhotoSection({ workOrderId, photos, onChange }: { workOrderId: string; photos: Photo[]; onChange: () => void }) {
  const { session } = useAuth()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<Photo | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    const paths = photos.map((p) => p.storage_path).filter((p) => !urls[p])
    if (paths.length === 0) return
    db().storage.from('photos').createSignedUrls(paths, 3600).then(({ data }) => {
      if (!data) return
      const fresh: Record<string, string> = {}
      for (const d of data) if (d.path && d.signedUrl) fresh[d.path] = d.signedUrl
      setUrls((prev) => ({ ...prev, ...fresh }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos])

  async function upload(kind: Photo['kind'], files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(kind)
    setError('')
    try {
      for (const file of Array.from(files)) {
        const blob = await compressImage(file)
        const path = `${session!.user.id}/${workOrderId}/${crypto.randomUUID()}.jpg`
        const up = await db().storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        const ins = await db().from('photos').insert({ work_order_id: workOrderId, kind, storage_path: path })
        if (ins.error) throw ins.error
      }
      onChange()
    } catch (e) {
      console.error(e)
      setError('No se pudo subir la foto. Revisa la señal e intenta otra vez.')
    } finally {
      setUploading(null)
      const input = inputs.current[kind]
      if (input) input.value = ''
    }
  }

  async function remove(p: Photo) {
    await db().storage.from('photos').remove([p.storage_path])
    await db().from('photos').delete().eq('id', p.id)
    setViewing(null)
    onChange()
  }

  return (
    <div className="space-y-4">
      {PHOTO_KINDS.map((k) => {
        const list = photos.filter((p) => p.kind === k.value)
        return (
          <div key={k.value}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-lg font-bold text-slate-900">{k.label} <span className="font-normal text-slate-500">({list.length})</span></span>
              <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-4 text-base font-bold ${uploading === k.value ? 'bg-slate-200 text-slate-500' : 'bg-navy-800 text-white active:bg-navy-900'}`}>
                <Camera size={20} /> {uploading === k.value ? 'Subiendo…' : 'Foto'}
                <input
                  ref={(el) => { inputs.current[k.value] = el }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => upload(k.value, e.target.files)}
                />
              </label>
            </div>
            {list.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {list.map((p) => (
                  <button key={p.id} type="button" onClick={() => setViewing(p)} className="aspect-square overflow-hidden rounded-xl bg-slate-200">
                    {urls[p.storage_path] && <img src={urls[p.storage_path]} alt={k.label} className="h-full w-full object-cover" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {error && <p className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}

      {viewing && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black" role="dialog" aria-modal="true">
          <div className="safe-top flex justify-between p-3">
            <button onClick={() => remove(viewing)} className="flex min-h-12 items-center gap-2 rounded-xl bg-red-700 px-4 font-bold text-white"><Trash2 size={20} /> Borrar</button>
            <button onClick={() => setViewing(null)} aria-label="Cerrar" className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-white"><X size={28} /></button>
          </div>
          <div className="flex flex-1 items-center justify-center p-2">
            {urls[viewing.storage_path] && <img src={urls[viewing.storage_path]} alt="" className="max-h-full max-w-full object-contain" />}
          </div>
        </div>
      )}
    </div>
  )
}
