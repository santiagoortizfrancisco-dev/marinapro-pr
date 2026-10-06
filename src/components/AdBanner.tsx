import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Ad {
  id: string
  advertiser: string
  image_path: string
  link_url: string | null
}

let cache: Promise<Ad[]> | null = null
function loadAds(): Promise<Ad[]> {
  if (!supabase) return Promise.resolve([])
  cache ??= Promise.resolve(supabase.rpc('ads_active')).then(({ data }) => (data ?? []) as Ad[])
  return cache
}

/** Un anuncio de una tienda marina, marcado "Anuncio". Si no hay anuncios activos, no ocupa espacio. */
export default function AdBanner({ index = 0 }: { index?: number }) {
  const [ad, setAd] = useState<Ad | null>(null)

  useEffect(() => {
    loadAds().then((ads) => setAd(ads.length ? ads[index % ads.length] : null))
  }, [index])

  if (!ad || !supabase) return null
  const src = supabase.storage.from('ads').getPublicUrl(ad.image_path).data.publicUrl
  const img = <img src={src} alt={ad.advertiser} className="w-full rounded-xl object-cover" loading="lazy" />

  return (
    <aside className="my-5" aria-label={`Anuncio de ${ad.advertiser}`}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Anuncio</div>
      {ad.link_url ? (
        <a href={ad.link_url} target="_blank" rel="noreferrer sponsored" onClick={() => supabase?.rpc('ad_click', { p_id: ad.id })} className="block overflow-hidden rounded-xl border border-slate-200">
          {img}
        </a>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">{img}</div>
      )}
    </aside>
  )
}
