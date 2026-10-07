import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { CheckCircle2, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Sheet } from './Sheet'
import { Button, Field, Input, Textarea } from './ui'

/**
 * "Contactar al desarrollador": el mensaje llega a Admin → Mensajes.
 * El que escribe nunca ve el email del desarrollador.
 */
export default function ContactSheet({ open, onClose, needsContact = false }: { open: boolean; onClose: () => void; needsContact?: boolean }) {
  const { pathname } = useLocation()
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setSent(false)
  }, [open])

  async function send() {
    setError('')
    if (message.trim().length < 3) return setError('Escribe tu mensaje.')
    if (needsContact && contact.trim().length < 5) return setError('Escribe tu email o teléfono para contestarte.')
    if (!supabase) return
    setBusy(true)
    const { error: err } = await supabase.rpc('send_support_message', {
      p_message: message, p_contact: contact || null, p_version: __APP_VERSION__, p_page: pathname,
    })
    setBusy(false)
    if (err) return setError(err.message.includes('varios') ? err.message : 'No se pudo enviar. Revisa la señal e intenta otra vez.')
    setMessage('')
    setContact('')
    setSent(true)
  }

  return (
    <Sheet open={open} title="Contactar al desarrollador" onClose={onClose}>
      {sent ? (
        <div className="space-y-4 pb-2 text-center">
          <CheckCircle2 size={56} className="mx-auto text-emerald-600" />
          <p className="text-xl font-extrabold text-navy-900">¡Recibido!</p>
          <p className="text-base text-slate-600">Te contestamos lo antes posible.</p>
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      ) : (
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pb-2">
          <p className="text-base text-slate-600">¿Algo no funciona, tienes una duda o una idea? Escríbenos aquí.</p>
          <Field label="Tu mensaje">
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="Ej.: no me deja enviar la factura por WhatsApp" />
          </Field>
          {needsContact && (
            <Field label="Tu email o teléfono" hint="Para poder contestarte">
              <Input value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" />
            </Field>
          )}
          {error && <p role="alert" className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">{error}</p>}
          <Button onClick={send} disabled={busy}><Send size={20} /> {busy ? 'Enviando…' : 'Enviar mensaje'}</Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      )}
    </Sheet>
  )
}
