import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, Trash2 } from 'lucide-react'

const PR_CENTER: L.LatLngExpression = [18.22, -66.45]

const pin = L.divIcon({
  className: '',
  html: '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#f59e0b;border:3px solid #0b3b5c;transform:rotate(-45deg)"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

/** Mapa para poner el pin del bote: tocar el mapa, arrastrar el pin o usar la ubicación del celular. */
export default function MapPicker({ lat, lng, onChange }: { lat: number | null; lng: number | null; onChange: (lat: number | null, lng: number | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const [locating, setLocating] = useState(false)
  const [msg, setMsg] = useState('')
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  function place(p: L.LatLng) {
    const la = Math.round(p.lat * 1e6) / 1e6
    const ln = Math.round(p.lng * 1e6) / 1e6
    onChangeRef.current(la, ln)
  }

  useEffect(() => {
    if (!box.current || map.current) return
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(
      lat != null && lng != null ? [lat, lng] : PR_CENTER,
      lat != null && lng != null ? 16 : 8,
    )
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => place(e.latlng))
    map.current = m
    return () => {
      m.remove()
      map.current = null
      marker.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mantener el pin igual que los datos
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (lat == null || lng == null) {
      marker.current?.remove()
      marker.current = null
      return
    }
    if (!marker.current) {
      marker.current = L.marker([lat, lng], { icon: pin, draggable: true }).addTo(m)
      marker.current.on('dragend', () => place(marker.current!.getLatLng()))
    } else {
      marker.current.setLatLng([lat, lng])
    }
  }, [lat, lng])

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMsg('Este celular no deja usar la ubicación.')
      return
    }
    setLocating(true)
    setMsg('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const p = L.latLng(pos.coords.latitude, pos.coords.longitude)
        place(p)
        map.current?.setView(p, 17)
      },
      () => {
        setLocating(false)
        setMsg('No se pudo usar tu ubicación. Revisa el permiso de ubicación o toca en el mapa.')
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  return (
    <div className="space-y-2">
      {/* isolate: que el mapa no pase por encima de la barra de arriba al bajar la pantalla */}
      <div ref={box} className="isolate h-64 w-full overflow-hidden rounded-xl border-2 border-slate-300" />
      <p className="text-sm text-slate-500">Toca el mapa donde está el bote. Puedes arrastrar el pin para moverlo.</p>
      <div className="flex gap-2">
        <button type="button" onClick={useMyLocation} disabled={locating} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-navy-800 px-3 text-base font-bold text-navy-800 active:bg-navy-50">
          <Crosshair size={20} /> {locating ? 'Buscando…' : 'Estoy en el bote'}
        </button>
        {lat != null && (
          <button type="button" onClick={() => onChange(null, null)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-slate-300 px-3 text-base font-bold text-slate-700">
            <Trash2 size={20} /> Quitar pin
          </button>
        )}
      </div>
      {msg && <p className="text-sm font-semibold text-red-700">{msg}</p>}
    </div>
  )
}
