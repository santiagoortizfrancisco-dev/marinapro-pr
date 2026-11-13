import { useState } from 'react'
import { Bot, Copy, KeyRound } from 'lucide-react'
import { BackTitle, Button, CARD } from '../../components/ui'
import { db } from '../../lib/db'
import { formatDate, formatTime } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { useMechanic } from '../../lib/useMechanic'

type KeyRow = { key_hint: string; created_at: string; last_used_at: string | null }

const SCHEMA_URL = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://TU-PROYECTO.supabase.co'}/functions/v1/gpt/openapi.json`

function instructions(business: string) {
  return `Eres el asistente de ${business}. Contesta en español de Puerto Rico, corto y claro.
Para cualquier pregunta de ventas, pagos, propinas, citas, clientas, empleadas, comisiones, rentas o lo que me deben, usa SIEMPRE las acciones de FacturaFácil PR. Nunca inventes números: si no está en los datos, dilo.
Primero llama "negocio" para saber la fecha de hoy. Para un mes usa desde = el día 1 y hasta = el último día.
Dinero en formato $1,234.56 y fechas dd/mm/aaaa. Cuando te pida un reporte o el cierre del mes, hazlo en una tabla sencilla.`
}

/** Conectar ChatGPT con el negocio (solo leer): una llave secreta y los pasos para crear su GPT. */
export default function ConnectChatGPT() {
  const { data: mech } = useMechanic()
  const { data: keys, reload } = useLoad(async () => (await db().from('gpt_keys').select('key_hint, created_at, last_used_at')).data as KeyRow[] | null, [])
  const current = keys?.[0]
  const [newKey, setNewKey] = useState('')
  const [copied, setCopied] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(''), 2500)
    } catch {
      setCopied('')
    }
  }

  async function makeKey() {
    if (current && !window.confirm('¿Sacar una llave nueva? La que tienes puesta en ChatGPT deja de servir y tendrás que poner la nueva.')) return
    setBusy(true)
    setError('')
    const { data, error: e } = await db().rpc('gpt_new_key')
    setBusy(false)
    if (e || !data) return setError('No se pudo sacar la llave. Intenta otra vez.')
    setNewKey(String(data))
    reload()
  }

  async function turnOff() {
    if (!window.confirm('¿Apagar la conexión? ChatGPT ya no podrá leer tus números hasta que saques una llave nueva.')) return
    await db().from('gpt_keys').delete().eq('mechanic_id', mech?.profile_id ?? '')
    setNewKey('')
    reload()
  }

  const CopyBtn = ({ text, what, label }: { text: string; what: string; label: string }) => (
    <Button variant="secondary" onClick={() => copy(text, what)}><Copy /> {copied === what ? 'Copiado ✓' : label}</Button>
  )

  return (
    <>
      <BackTitle to="/mas" subtitle="Pregúntale a ChatGPT por tus números">Conectar con ChatGPT</BackTitle>

      <section className={`${CARD} mb-4 p-4 text-base text-slate-700`}>
        <p className="flex items-center gap-2 font-bold text-navy-900"><Bot className="h-5 w-5" /> Cómo funciona</p>
        <p className="mt-1">Tu ChatGPT podrá <b>leer</b> tus ventas, citas, clientas, empleadas, rentas y lo que te deben. <b>No puede cambiar ni borrar nada.</b></p>
        <p className="mt-1 text-sm text-slate-500">Necesitas ChatGPT Plus. Los pasos en ChatGPT se hacen mejor en la computadora (chatgpt.com).</p>
      </section>

      <section aria-label="Tu llave" className={`${CARD} mb-4 p-4`}>
        <p className="flex items-center gap-2 text-lg font-bold text-navy-900"><KeyRound className="h-5 w-5" /> 1. Tu llave secreta</p>
        {newKey ? (
          <>
            <p className="mt-2 text-base text-slate-700">Cópiala ahora. <b>Por seguridad no se vuelve a enseñar.</b> No se la des a nadie.</p>
            <p data-testid="gpt-key" className="mt-2 break-all rounded-xl bg-slate-100 p-3 font-mono text-sm text-navy-900">{newKey}</p>
            <div className="mt-3"><CopyBtn text={newKey} what="key" label="Copiar la llave" /></div>
          </>
        ) : current ? (
          <p className="mt-2 text-base text-slate-700">
            Conectado ✓ · llave que termina en <b>…{current.key_hint}</b>, sacada el {formatDate(current.created_at)}.
            {current.last_used_at ? ` ChatGPT la usó por última vez el ${formatDate(current.last_used_at)} a las ${formatTime(current.last_used_at)}.` : ' ChatGPT todavía no la ha usado.'}
          </p>
        ) : (
          <p className="mt-2 text-base text-slate-700">Todavía no tienes llave.</p>
        )}
        <div className="mt-3 space-y-2">
          <Button disabled={busy} onClick={makeKey}><KeyRound /> {current ? 'Sacar una llave nueva' : 'Sacar mi llave'}</Button>
          {current && <Button variant="danger" onClick={turnOff}>Apagar la conexión</Button>}
        </div>
        {error && <p role="alert" className="mt-2 text-base font-bold text-red-700">{error}</p>}
      </section>

      <section aria-label="Pasos en ChatGPT" className={`${CARD} mb-4 space-y-3 p-4 text-base text-slate-700`}>
        <p className="text-lg font-bold text-navy-900">2. En ChatGPT (una sola vez)</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Entra a <b>chatgpt.com</b> → <b>GPT</b> → <b>+ Crear</b> → pestaña <b>Configurar</b>.</li>
          <li>Nombre: <b>{mech?.business_name ?? 'Mi negocio'}</b>. En <b>Instrucciones</b> pega esto:
            <div className="mt-2"><CopyBtn text={instructions(mech?.business_name ?? 'mi negocio')} what="ins" label="Copiar las instrucciones" /></div>
          </li>
          <li>Abajo toca <b>Crear nueva acción</b> → <b>Importar desde URL</b>, pega este enlace y toca <b>Importar</b>:
            <p className="mt-2 break-all rounded-xl bg-slate-100 p-2 font-mono text-xs text-navy-900">{SCHEMA_URL}</p>
            <div className="mt-2"><CopyBtn text={SCHEMA_URL} what="url" label="Copiar el enlace" /></div>
          </li>
          <li>En <b>Autenticación</b> escoge <b>Clave de API</b> → tipo <b>Portador (Bearer)</b> → pega tu llave → <b>Guardar</b>.</li>
          <li>Arriba toca <b>Crear</b> y escoge <b>Solo yo</b>.</li>
          <li>Listo. Entra a tu GPT y pregúntale: <i>“¿Cuánto vendí este mes?”</i>. La primera vez te pide permiso: toca <b>Permitir siempre</b>.</li>
        </ol>
      </section>
    </>
  )
}
