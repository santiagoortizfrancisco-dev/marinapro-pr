import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { type LucideIcon, Home, Mail, MapPin, MessageCircle, Phone, StickyNote, User } from 'lucide-react'
import { WhatsAppIcon } from '../../components/BrandIcons'
import { useAuth } from '../../auth/AuthProvider'
import { CONTACT_PREFS } from '../../lib/catalog'
import { db } from '../../lib/db'
import { PR_TOWNS } from '../../lib/towns'
import type { Client } from '../../lib/types'
import { blank } from '../../lib/useLoad'
import { BackTitle, Choice, Field, FormActions, Input, Loading, Select, Textarea } from '../../components/ui'

type Form = { full_name: string; phone: string; email: string; town: string; address: string; preferred_contact: Client['preferred_contact']; notes: string }
const CONTACT_ICONS = {
  whatsapp: { icon: WhatsAppIcon as unknown as LucideIcon, tone: 'whatsapp' },
  call: { icon: Phone, tone: 'blue' },
  email: { icon: Mail, tone: 'violet' },
} as const

const EMPTY: Form = { full_name: '', phone: '', email: '', town: '', address: '', preferred_contact: 'whatsapp', notes: '' }

export default function ClientForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [f, setF] = useState<Form>(EMPTY)
  const [loading, setLoading] = useState(Boolean(id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!id) return
    db().from('clients').select('*').eq('id', id).single().then(({ data }) => {
      const c = data as Client | null
      if (c) setF({ full_name: c.full_name, phone: c.phone ?? '', email: c.email ?? '', town: c.town ?? '', address: c.address ?? '', preferred_contact: c.preferred_contact, notes: c.notes ?? '' })
      setLoading(false)
    })
  }, [id])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const row = {
      full_name: f.full_name.trim(),
      phone: blank(f.phone),
      email: blank(f.email),
      town: blank(f.town),
      address: blank(f.address),
      preferred_contact: f.preferred_contact,
      notes: blank(f.notes),
    }
    const res = id
      ? await db().from('clients').update(row).eq('id', id).select('id').single()
      : await db().from('clients').insert({ ...row, mechanic_id: session!.user.id }).select('id').single()
    setBusy(false)
    if (res.error) {
      setError('No se pudo guardar. Intenta otra vez.')
      return
    }
    const newId = (res.data as { id: string }).id
    // Cliente nuevo: seguir directo a añadir su bote
    navigate(id ? `/clientes/${id}` : `/botes/nuevo?cliente=${newId}`, { replace: true })
  }

  if (loading) return <Loading />

  return (
    <>
      <BackTitle subtitle={id ? undefined : 'Después de guardar añades su bote'}>{id ? 'Editar cliente' : 'Cliente nuevo'}</BackTitle>
      <form onSubmit={save} className="space-y-4">
        <Field label="Nombre completo *" icon={User}>
          <Input required autoComplete="off" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Ana Martínez" />
        </Field>
        <Field label="Teléfono / WhatsApp" icon={WhatsAppIcon as unknown as LucideIcon} tone="whatsapp">
          <Input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="787-555-0123" />
        </Field>
        <Field label="¿Cómo prefiere que lo contacten?" icon={MessageCircle} tone="navy">
          <Choice columns={3} value={f.preferred_contact} onChange={(v) => set('preferred_contact', v)} options={CONTACT_PREFS.map((c) => ({ ...c, ...CONTACT_ICONS[c.value] }))} />
        </Field>
        <Field label="Email" icon={Mail} tone="blue" hint="Para enviarle facturas y recordatorios">
          <Input type="email" inputMode="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="nombre@gmail.com" />
        </Field>
        <Field label="Pueblo" icon={MapPin} tone="orange">
          <Select value={f.town} onChange={(e) => set('town', e.target.value)}>
            <option value="">Escoge el pueblo</option>
            {PR_TOWNS.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Dirección" icon={Home} tone="violet">
          <Textarea rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Urb., calle, número" />
        </Field>
        <Field label="Notas" icon={StickyNote} tone="amber" hint="Ej.: paga con ATH Móvil, llamar después de las 5">
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <FormActions busy={busy} error={error} saveLabel={id ? 'Guardar cambios' : 'Guardar y añadir bote'} />
      </form>
    </>
  )
}
