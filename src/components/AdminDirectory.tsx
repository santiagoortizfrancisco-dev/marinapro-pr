import { useState } from 'react'
import { ExternalLink, ImagePlus, Megaphone, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import { compressImage } from '../lib/image'
import { must, useLoad } from '../lib/useLoad'
import { Button, Field, Input, Toggle } from './ui'

interface DirRow { id: string; name: string; email: string | null; slug: string | null; listed: boolean; approved: boolean; towns: string[] }
interface AdRow { id: string; advertiser: string; image_path: string; link_url: string | null; active: boolean; clicks: number; views: number }

/** Admin del directorio: abrirlo al público, aprobar mecánicos y manejar los anuncios. */
export default function AdminDirectory() {
  const { data: open, setData: setOpen } = useLoad(async () => (await db().rpc('directory_is_open')).data === true, [])
  const { data: rows, reload: reloadRows } = useLoad(async () => must(await db().rpc('admin_directory_list')) as DirRow[], [])
  const [busy, setBusy] = useState(false)

  async function toggleOpen(v: boolean) {
    setBusy(true)
    const { error } = await db().rpc('admin_set_directory_open', { p_open: v })
    if (!error) setOpen(v)
    setBusy(false)
  }

  const [msg, setMsg] = useState('')
  async function approve(id: string, v: boolean) {
    setMsg('')
    const { error } = await db().rpc('admin_set_approved', { p_mechanic: id, p_approved: v })
    if (error) setMsg('No se pudo cambiar. Sal y vuelve a entrar al app e intenta otra vez.')
    reloadRows()
  }

  return (
    <section className="mb-6 space-y-4 rounded-2xl border-2 border-navy-800 p-4">
      <h2 className="text-xl font-extrabold text-navy-900">Directorio público</h2>
      <Toggle
        checked={open === true}
        onChange={(v) => !busy && toggleOpen(v)}
        label={open ? 'Abierto al público' : 'Cerrado (solo tú lo ves)'}
        hint="Los dueños de bote buscan mecánicos y piden cita en /mecanicos"
      />
      <a href="/mecanicos" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-navy-800 text-base font-bold text-navy-800">
        <ExternalLink size={18} /> Ver el directorio
      </a>

      <div>
        <h3 className="mb-2 text-base font-bold text-slate-800">Mecánicos que quieren salir</h3>
        {msg && <p role="alert" className="mb-2 rounded-xl bg-red-100 p-3 text-base font-semibold text-red-800">{msg}</p>}
        {rows?.length === 0 && <p className="text-base text-slate-500">Ninguno todavía. Cada mecánico lo pide en Más → Mi perfil público.</p>}
        <div className="space-y-2">
          {rows?.map((r) => (
            <div key={r.id} className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-slate-900">{r.name}</div>
                  <div className="truncate text-sm text-slate-600">{r.towns.join(', ') || 'Sin pueblos'}</div>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${r.approved && r.listed ? 'bg-emerald-100 text-emerald-900' : r.approved ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-900'}`}>
                  {r.approved && r.listed ? 'Sale' : r.approved ? 'Se ocultó' : 'Por aprobar'}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                {r.slug && <a href={`/mecanicos/${r.slug}`} className="flex min-h-12 flex-1 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-sm font-bold text-slate-700">Ver página</a>}
                {r.approved
                  ? <button onClick={() => approve(r.id, false)} className="min-h-12 flex-1 rounded-xl border-2 border-red-700 bg-white text-sm font-bold text-red-700">Quitar</button>
                  : <button onClick={() => approve(r.id, true)} className="min-h-12 flex-1 rounded-xl bg-emerald-700 text-sm font-bold text-white">Aprobar</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AdsAdmin />
    </section>
  )
}

function AdsAdmin() {
  const { data: ads, reload } = useLoad(async () => must(await db().from('ads').select('*').order('created_at', { ascending: false })) as AdRow[], [])
  const [adding, setAdding] = useState(false)
  const [advertiser, setAdvertiser] = useState('')
  const [link, setLink] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    setError('')
    if (!advertiser.trim()) return setError('Escribe el nombre de la tienda.')
    if (!file) return setError('Escoge la imagen del anuncio.')
    const url = link.trim()
    if (url && !/^https?:\/\//i.test(url)) return setError('El link tiene que empezar con https://')
    setBusy(true)
    try {
      const blob = await compressImage(file, 1200, 0.85, 'image/jpeg')
      const path = `${crypto.randomUUID()}.jpg`
      const up = await db().storage.from('ads').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const ins = await db().from('ads').insert({ advertiser: advertiser.trim(), link_url: url || null, image_path: path })
      if (ins.error) throw ins.error
      setAdvertiser(''); setLink(''); setFile(null); setAdding(false)
      reload()
    } catch (e) {
      console.error(e)
      setError('No se pudo subir el anuncio. Intenta otra vez.')
    } finally {
      setBusy(false)
    }
  }

  async function setActive(ad: AdRow, active: boolean) {
    await db().from('ads').update({ active }).eq('id', ad.id)
    reload()
  }

  async function remove(ad: AdRow) {
    if (!confirm(`¿Borrar el anuncio de ${ad.advertiser}?`)) return
    await db().from('ads').delete().eq('id', ad.id)
    await db().storage.from('ads').remove([ad.image_path])
    reload()
  }

  const imgUrl = (p: string) => db().storage.from('ads').getPublicUrl(p).data.publicUrl

  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-800"><Megaphone size={18} /> Anuncios de tiendas</h3>
      <p className="mb-2 text-sm text-slate-500">Salen como franja (3 veces más ancha que alta). La mejor imagen: 1200 × 400. Así se ve:</p>
      <div className="space-y-2">
        {ads?.map((ad) => (
          <div key={ad.id} className={`rounded-xl border-2 p-2 ${ad.active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-60'}`}>
            <img src={imgUrl(ad.image_path)} alt={ad.advertiser} className="aspect-[3/1] w-full rounded-lg bg-white object-contain ring-1 ring-slate-200" />
            <div className="mt-2 flex items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <div className="truncate text-base font-bold text-slate-900">{ad.advertiser}</div>
                <div className="text-sm text-slate-600">{ad.views} vistas · {ad.clicks} toques</div>
              </div>
              <button onClick={() => remove(ad)} aria-label={`Borrar anuncio de ${ad.advertiser}`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-red-700"><Trash2 size={20} /></button>
            </div>
            <div className="mt-1">
              <Toggle checked={ad.active} onChange={(v) => setActive(ad, v)} label={ad.active ? 'Se está mostrando' : 'Pausado'} />
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
          <Field label="Tienda"><Input value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} placeholder="Ej.: Marine Parts de Fajardo" /></Field>
          <Field label="Link (opcional)"><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" inputMode="url" autoCapitalize="none" /></Field>
          <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-navy-800 bg-white px-3 text-base font-bold text-navy-800">
            <ImagePlus size={20} /> {file ? file.name : 'Escoger imagen'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {error && <p className="font-semibold text-red-700">{error}</p>}
          <Button onClick={add} disabled={busy}>{busy ? 'Subiendo…' : 'Guardar anuncio'}</Button>
          <Button variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
        </div>
      ) : (
        <Button variant="secondary" className="mt-3" onClick={() => setAdding(true)}>+ Anuncio</Button>
      )}
    </div>
  )
}
