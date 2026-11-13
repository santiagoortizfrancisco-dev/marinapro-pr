// FacturaFácil PR → ChatGPT (solo LEER).
// ChatGPT (un GPT con "Acciones") llama aquí con la llave del negocio en
// "Authorization: Bearer ff_...". Esto le pasa la pregunta a la base de datos
// (gpt_query) y devuelve los números. No puede cambiar ni borrar nada.
//
// Publicar: Supabase → Edge Functions → Deploy a new function → Via Editor →
// nombre "gpt" → pegar este archivo → Deploy. Luego en sus ajustes apagar
// "Verify JWT" (ChatGPT usa la llave del negocio, no una sesión del app).
// El esquema para ChatGPT queda en: https://<proyecto>.supabase.co/functions/v1/gpt/openapi.json

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const QUESTIONS: Record<string, { summary: string; range: boolean; search?: boolean }> = {
  negocio: { summary: 'Datos del negocio: nombre, fecha de hoy, IVU, empleadas (comisión o renta) y servicios con precio y duración.', range: false },
  resumen: { summary: 'Resumen del período: cobrado, propinas, pagos por método, facturado, IVU, citas (hechas, canceladas, pendientes) y rentas cobradas.', range: true },
  ventas: { summary: 'Cada pago recibido: fecha, cliente, servicio, empleada, método, monto y propina.', range: true },
  citas: { summary: 'Citas del período: fecha y hora, cliente, servicios, empleada, estado y depósito.', range: true },
  deudas: { summary: 'Facturas que todavía deben dinero (de cualquier fecha), con lo que falta y el total.', range: false },
  rentas: { summary: 'Rentas de espacios cobradas en el período (quién pagó, concepto y monto).', range: true },
  empleadas: { summary: 'Por empleada en el período: ventas, propinas, servicios cobrados, comisión ganada y renta pagada.', range: true },
  clientas: { summary: 'Clientes con visitas hechas, última visita, próxima cita y total pagado. Se puede buscar por nombre.', range: false, search: true },
}

function openapi(server: string) {
  const dateParam = (name: string, description: string) => ({ name, in: 'query', required: false, description, schema: { type: 'string', format: 'date' } })
  const paths: Record<string, unknown> = {}
  for (const [what, q] of Object.entries(QUESTIONS)) {
    const parameters = []
    if (q.range) parameters.push(dateParam('desde', 'Primer día (AAAA-MM-DD). Si no se pone: el día 1 del mes actual.'), dateParam('hasta', 'Último día (AAAA-MM-DD), incluido. Si no se pone: el último día del mes actual.'))
    if (q.search) parameters.push({ name: 'buscar', in: 'query', required: false, description: 'Parte del nombre del cliente', schema: { type: 'string' } })
    paths[`/${what}`] = {
      get: {
        operationId: what,
        summary: q.summary,
        parameters,
        responses: { '200': { description: 'Datos en JSON (dinero en USD)', content: { 'application/json': { schema: { type: 'object' } } } } },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: { title: 'FacturaFácil PR', version: '1.0.0', description: 'Números del negocio en FacturaFácil PR (solo lectura). Zona horaria America/Puerto_Rico. Dinero en USD.' },
    servers: [{ url: server }],
    paths,
    components: { schemas: {}, securitySchemes: { llave: { type: 'http', scheme: 'bearer' } } },
    security: [{ llave: [] }],
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const what = url.pathname.split('/').filter(Boolean).pop() ?? ''
  const server = `${SUPABASE_URL}/functions/v1/gpt`

  if (what === 'openapi.json' || what === 'gpt') return json(openapi(server))
  if (req.method !== 'GET') return json({ error: 'Solo se puede leer' }, 405)
  if (!QUESTIONS[what]) return json({ error: `No conozco "${what}". Usa: ${Object.keys(QUESTIONS).join(', ')}` }, 404)

  const key = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!key.startsWith('ff_')) return json({ error: 'Falta la llave. Sácala en FacturaFácil PR: Más → Conectar con ChatGPT.' }, 401)

  const rpc = (fn: string, args: Record<string, unknown>) =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })

  const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const res = await rpc('gpt_query', {
    p_key: key,
    p_what: what,
    p_from: day(url.searchParams.get('desde')),
    p_to: day(url.searchParams.get('hasta')),
    p_search: url.searchParams.get('buscar')?.slice(0, 80) ?? null,
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (body && typeof body === 'object' && 'message' in body ? String(body.message) : '') || 'No se pudo leer'
    return json({ error: msg }, /llave/i.test(msg) ? 401 : 400)
  }
  await rpc('gpt_touch', { p_key: key }).catch(() => {})
  return json(body)
})
