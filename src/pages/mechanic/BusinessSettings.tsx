import { useEffect, useState, type FormEvent } from 'react'
import { Check, ImagePlus, Trash2 } from 'lucide-react'
import { BRAND_COLORS, DEFAULT_BRAND, logoUrl, notifyBrandChanged } from '../../lib/brand'
import { compressImage } from '../../lib/image'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { db } from '../../lib/db'
import { PR_TOWNS } from '../../lib/towns'
import { blank, num } from '../../lib/useLoad'
import { useMechanic } from '../../lib/useMechanic'
import { BackTitle, ErrorBox, Field, FormActions, Input, Loading, Select, Textarea, Toggle } from '../../components/ui'

/** Datos del negocio: salen en las facturas. */
export default function BusinessSettings() {
  const navigate = useNavigate()
  const { profile, session, refreshProfile } = useAuth()
  const { data: m, loading, error } = useMechanic()
  const [f, setF] = useState({
    full_name: '', phone: '', town: '', business_name: '', ath_movil_number: '', labor_rate_hour: '', ivu_percent: '',
    ivu_on_labor: true, ivu_on_parts: true, warranty_days: '', next_invoice_number: '', policies_text: '',
  })
  const [busy, setBusy] = useState(false)
  const [color, setColor] = useState(DEFAULT_BRAND)
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState('')
  const [saveError, setSaveError] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!m) return
    setColor(m.brand_color || DEFAULT_BRAND)
    setLogoPath(m.logo_path)
    setF({
      full_name: profile?.full_name ?? '', phone: profile?.phone ?? '', town: profile?.town ?? '',
      business_name: m.business_name ?? '', ath_movil_number: m.ath_movil_number ?? '', labor_rate_hour: String(m.labor_rate_hour ?? 0),
      ivu_percent: String(Math.round(Number(m.ivu_rate) * 1000) / 10), ivu_on_labor: m.ivu_on_labor, ivu_on_parts: m.ivu_on_parts,
      warranty_days: String(m.warranty_days), next_invoice_number: String(m.next_invoice_number), policies_text: m.policies_text,
    })
  }, [m, profile])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!m) return
    setBusy(true)
    setSaveError('')
    const policiesChanged = f.policies_text.trim() !== m.policies_text.trim()
    const [r1, r2] = await Promise.all([
      db().from('profiles').update({ full_name: f.full_name.trim(), phone: blank(f.phone), town: blank(f.town) }).eq('id', session!.user.id),
      db().from('mechanics').update({
        business_name: blank(f.business_name),
        ath_movil_number: blank(f.ath_movil_number),
        labor_rate_hour: num(f.labor_rate_hour) ?? 0,
        ivu_rate: (num(f.ivu_percent) ?? 0) / 100,
        ivu_on_labor: f.ivu_on_labor,
        ivu_on_parts: f.ivu_on_parts,
        warranty_days: num(f.warranty_days) ?? 90,
        next_invoice_number: Math.max(1, Math.floor(num(f.next_invoice_number) ?? 1)),
        policies_text: f.policies_text.trim(),
        brand_color: color,
        // Si cambian las políticas, sube la versión (los estimados aprobados guardan la versión que aceptaron)
        policies_version: policiesChanged ? m.policies_version + 1 : m.policies_version,
      }).eq('profile_id', session!.user.id),
    ])
    setBusy(false)
    if (r1.error || r2.error) {
      setSaveError('No se pudo guardar. Intenta otra vez.')
      return
    }
    await refreshProfile()
    notifyBrandChanged()
    navigate('/mas')
  }

  async function uploadLogo(file: File | undefined) {
    if (!file || !m) return
    setLogoBusy(true)
    setLogoError('')
    try {
      const blob = await compressImage(file, 600, 0.92, 'image/png')
      const path = `${session!.user.id}/logo-${crypto.randomUUID()}.png`
      const up = await db().storage.from('logos').upload(path, blob, { contentType: 'image/png' })
      if (up.error) throw up.error
      const res = await db().from('mechanics').update({ logo_path: path }).eq('profile_id', session!.user.id)
      if (res.error) throw res.error
      if (logoPath && !logoPath.startsWith('/')) await db().storage.from('logos').remove([logoPath])
      setLogoPath(path)
      notifyBrandChanged()
    } catch (e) {
      console.error(e)
      setLogoError('No se pudo subir el logo. Intenta otra vez.')
    } finally {
      setLogoBusy(false)
    }
  }

  async function removeLogo() {
    if (!logoPath) return
    setLogoBusy(true)
    await db().from('mechanics').update({ logo_path: null }).eq('profile_id', session!.user.id)
    if (!logoPath.startsWith('/')) await db().storage.from('logos').remove([logoPath])
    setLogoPath(null)
    setLogoBusy(false)
    notifyBrandChanged()
  }

  if (loading) return <Loading />
  if (error || !m) return <ErrorBox message={error || 'No se encontraron los datos del negocio.'} />

  return (
    <>
      <BackTitle to="/mas" subtitle="Esto sale en tus estimados y facturas">Mi negocio</BackTitle>
      <form onSubmit={save} className="space-y-4">
        <Field label="Logo" hint="Sale arriba en el app y en tus estimados y facturas">
          <div className="flex items-center gap-3">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-300 bg-black">
              {logoPath ? <img src={logoUrl(logoPath) ?? ''} alt="Logo" className="h-full w-full object-contain" /> : <ImagePlus className="text-slate-400" size={32} />}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-navy-800 px-3 text-base font-bold text-navy-800">
                <ImagePlus size={20} /> {logoBusy ? 'Subiendo…' : logoPath ? 'Cambiar logo' : 'Subir logo'}
                <input type="file" accept="image/*" className="hidden" disabled={logoBusy} onChange={(e) => uploadLogo(e.target.files?.[0])} />
              </label>
              {logoPath && (
                <button type="button" onClick={removeLogo} disabled={logoBusy} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-slate-300 text-base font-bold text-slate-700">
                  <Trash2 size={18} /> Quitar
                </button>
              )}
            </div>
          </div>
          {logoError && <p className="mt-2 font-semibold text-red-700">{logoError}</p>}
        </Field>
        <Field label="Color de tu negocio" hint="Es el color de la barra de arriba y de la factura">
          <div className="grid grid-cols-4 gap-2">
            {BRAND_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                className={`flex min-h-16 flex-col items-center justify-center rounded-xl text-xs font-bold text-white ${color === c.value ? 'ring-4 ring-sun-400 ring-offset-2' : ''}`}
                style={{ backgroundColor: c.value }}
              >
                {color === c.value && <Check size={20} />}
                {c.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Nombre del negocio">
          <Input value={f.business_name} onChange={(e) => set('business_name', e.target.value)} placeholder="Rivera Marine Service" />
        </Field>
        <Field label="Tu nombre *">
          <Input required value={f.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <Input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Pueblo">
          <Select value={f.town} onChange={(e) => set('town', e.target.value)}>
            <option value="">Escoge tu pueblo</option>
            {PR_TOWNS.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Número de ATH Móvil (opcional)" hint="Si lo pones, sale en la factura para que el cliente te pague. Si lo dejas vacío, no sale.">
          <Input type="tel" inputMode="tel" value={f.ath_movil_number} onChange={(e) => set('ath_movil_number', e.target.value)} placeholder="787-555-0123" />
        </Field>

        <h2 className="pt-3 text-xl font-extrabold text-navy-900">Precios</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tarifa por hora ($)">
            <Input inputMode="decimal" value={f.labor_rate_hour} onChange={(e) => set('labor_rate_hour', e.target.value)} placeholder="85" />
          </Field>
          <Field label="IVU (%)">
            <Input inputMode="decimal" value={f.ivu_percent} onChange={(e) => set('ivu_percent', e.target.value)} placeholder="11.5" />
          </Field>
        </div>
        <p className="text-sm text-slate-500">Para trabajos nuevos. En cada trabajo puedes poner o quitar el IVU.</p>
        <Toggle checked={f.ivu_on_labor} onChange={(v) => set('ivu_on_labor', v)} label="Cobrar IVU en mano de obra" />
        <Toggle checked={f.ivu_on_parts} onChange={(v) => set('ivu_on_parts', v)} label="Cobrar IVU en piezas" />

        <h2 className="pt-3 text-xl font-extrabold text-navy-900">Facturas y garantía</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Próxima factura #">
            <Input inputMode="numeric" value={f.next_invoice_number} onChange={(e) => set('next_invoice_number', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Garantía (días)">
            <Input inputMode="numeric" value={f.warranty_days} onChange={(e) => set('warranty_days', e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>
        <Field label="Políticas de garantía" hint="Salen al final del estimado y la factura. (Revisar con un abogado.)">
          <Textarea rows={9} value={f.policies_text} onChange={(e) => set('policies_text', e.target.value)} />
        </Field>
        <FormActions busy={busy} error={saveError} saveLabel="Guardar" />
      </form>
    </>
  )
}
