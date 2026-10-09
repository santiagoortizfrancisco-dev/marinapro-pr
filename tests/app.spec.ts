// Bot de pruebas — pantallas. Usa el app como un iPhone (como lo usa el mecánico),
// contra el Supabase de PRUEBA de tu computadora. Cada prueba empieza con los datos de ejemplo.
import { test, expect, type Page } from '@playwright/test'

const MOCK = 'http://localhost:54321'
const USER = 'jqr'
const PASSWORD = 'prueba-del-bot' // contraseña del Supabase de prueba (tests/mock-supabase.mjs), no la real

type State = Record<string, Record<string, unknown>[]>
const state = async (): Promise<State> => (await fetch(`${MOCK}/__state`)).json()

/** Mañana en Puerto Rico (la cita de ejemplo es mañana a las 9:00 AM). */
function tomorrowPR() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico' }).format(new Date())
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Email o usuario').fill(USER)
  await page.locator('input[autocomplete=current-password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByText('JQR Boat Repair').first()).toBeVisible()
}

/** Abre la cita de ejemplo (mañana 9:00) desde la Agenda. */
async function openExampleAppointment(page: Page) {
  await page.goto(`/agenda?dia=${tomorrowPR()}`)
  await page.getByRole('link', { name: /La Tranquila/ }).first().click()
  await expect(page.getByRole('heading', { name: 'El trabajo' })).toBeVisible()
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__reset`)
})

test('entrar: contraseña mala da error, la buena entra con el logo y nombre del negocio', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Email o usuario').fill(USER)
  await page.locator('input[autocomplete=current-password]').fill('mala')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible()
  await page.locator('input[autocomplete=current-password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.locator('header').getByText('JQR Boat Repair')).toBeVisible()
  await expect(page.locator('header img')).toBeVisible()
})

test('mecánico nuevo entra por primera vez con su email: pone nombre y compañía y ya está dentro', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Email o usuario').fill('Nuevo@Prueba.test')
  await page.locator('input[autocomplete=current-password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Bienvenido a Salt Marine Repair/ })).toBeVisible()
  await page.getByLabel('Tu nombre completo *').fill('Luis Prueba')
  await page.getByLabel('Nombre de tu compañía').fill('Luis Marine Service')
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(page.locator('header').getByText('Luis Marine Service')).toBeVisible()
  await expect(page.locator('header img')).toHaveAttribute('src', '/logo.svg')
  await expect(page.getByRole('link', { name: 'Agenda', exact: true })).toBeVisible()
  const s = await state()
  expect(s.profiles.find((p) => p.email === 'nuevo@prueba.test')?.role).toBe('mechanic')
})

test('la sesión se mantiene al recargar el app', async ({ page }) => {
  await login(page)
  await page.reload()
  await expect(page.locator('header').getByText('JQR Boat Repair')).toBeVisible()
  await expect(page.getByLabel('Email o usuario')).toHaveCount(0)
})

test('agenda: la semana, la cita de mañana y los huecos libres', async ({ page }) => {
  await login(page)
  await page.goto(`/agenda?dia=${tomorrowPR()}`)
  await expect(page.getByText('1 cita')).toBeVisible()
  await expect(page.getByRole('link', { name: /La Tranquila/ })).toBeVisible()
  const cita = page.getByRole('link', { name: /La Tranquila/ })
  await expect(cita).toContainText('9:00 AM')
  await expect(cita).toContainText('a 12:00 PM')
  await expect(cita).toContainText('Confirmada')
  await expect(page.getByText('El motor de babor no arranca en frío')).toBeVisible()
  // 7–9 libre y 12–5 libre
  await expect(page.getByRole('link', { name: /Libre · 2 horas/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Libre · 5 horas/ })).toBeVisible()
  await expect(page.getByText('7 horas libres')).toBeVisible()
})

test('agenda: calendario del mes con las citas marcadas; recuerda si prefieres Semana', async ({ page }) => {
  await login(page)
  await page.goto(`/agenda?dia=${tomorrowPR()}`)
  await expect(page.getByRole('button', { name: 'Mes', exact: true })).toBeVisible()
  // el día de mañana sale marcado con su cita
  await expect(page.getByRole('button', { name: /1 cita$/ })).toBeVisible()
  // tocar otro día y volver
  await page.getByRole('button', { name: /1 cita$/ }).click()
  await expect(page.getByRole('link', { name: /La Tranquila/ })).toBeVisible()
  // cambiar a Semana y que se acuerde
  await page.getByRole('button', { name: 'Semana', exact: true }).click()
  await expect(page.getByText(/Semana del \d+ al \d+/)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Semana del \d+ al \d+/)).toBeVisible()
})

test('los botones principales se ven claros: Hacer cita, Añadir cliente y Factura rápida', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Hacer cita' }).click()
  await expect(page.getByRole('heading', { name: 'Cita nueva' })).toBeVisible()
  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByRole('link', { name: 'Añadir cliente' }).click()
  await expect(page.getByRole('heading', { name: 'Cliente nuevo' })).toBeVisible()
  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByRole('link', { name: 'Factura rápida' })).toBeVisible()
})

test('cita nueva desde un hueco libre, con cliente nuevo: crea cliente, bote, cita y su trabajo', async ({ page }) => {
  await login(page)
  await page.goto(`/agenda?dia=${tomorrowPR()}`)
  await page.getByRole('link', { name: /Libre · 5 horas/ }).click()
  await expect(page.getByRole('heading', { name: 'Cita nueva' })).toBeVisible()
  await expect(page.locator('input[type=time]')).toHaveValue('12:00')
  await expect(page.locator('input[type=date]')).toHaveValue(tomorrowPR())

  await page.getByRole('button', { name: 'Cliente nuevo' }).click()
  await page.getByPlaceholder('Nombre del cliente *').fill('Pedro Prueba')
  await page.getByPlaceholder('Teléfono / WhatsApp').fill('787-555-0177')
  await page.getByPlaceholder('La Tranquila').fill('Bote del Bot')
  await page.getByPlaceholder('El motor de babor no arranca en frío').fill('No prende el GPS')
  await page.getByRole('button', { name: 'Guardar cita' }).click()

  await expect(page.getByRole('heading', { name: 'El trabajo' })).toBeVisible()
  await expect(page.getByText('Bote del Bot').first()).toBeVisible()
  const s = await state()
  expect(s.clients.some((c) => c.full_name === 'Pedro Prueba')).toBe(true)
  expect(s.boats.some((b) => b.name === 'Bote del Bot')).toBe(true)
  expect(s.work_orders.some((w) => w.complaint === 'No prende el GPS')).toBe(true)

  await page.getByRole('link', { name: 'Clientes' }).click()
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Pedro Prueba/ })).toBeVisible()
})

test('cita nueva escogiendo un cliente que ya existe (buscando por teléfono)', async ({ page }) => {
  await login(page)
  await page.goto(`/citas/nueva?dia=${tomorrowPR()}&hora=14:00`)
  await page.getByPlaceholder('Buscar cliente, bote o teléfono').fill('0111')
  await page.getByRole('button', { name: /La Tranquila · Ana Ejemplo/ }).click()
  await page.getByRole('button', { name: 'Guardar cita' }).click()
  await expect(page.getByRole('heading', { name: 'El trabajo' })).toBeVisible()
  expect((await state()).appointments).toHaveLength(2)
})

test('el trabajo: horas y piezas calculan el total con IVU; la pieza del cliente no se cobra', async ({ page }) => {
  await login(page)
  await openExampleAppointment(page)
  await page.getByRole('button', { name: /Mano de obra por hora/ }).click()
  const hours = page.getByLabel('Horas')
  await hours.fill('2')
  await hours.blur()
  await expect(page.getByText('$170.00').first()).toBeVisible()

  await page.getByRole('button', { name: /Añadir lo que cobras/ }).click()
  await page.getByPlaceholder('Lo que hiciste o lo que pusiste').fill('Impeller')
  await page.getByPlaceholder('0.00').fill('50')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.getByRole('button', { name: /Añadir lo que cobras/ }).click()
  await page.getByRole('switch', { name: /Lo trajo el cliente/ }).click()
  await page.getByPlaceholder('Lo que hiciste o lo que pusiste').fill('Aceite del cliente')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('No se cobra')).toBeVisible()
  // 170 + 50 = 220; IVU 11.5% = 25.30; total 245.30
  await expect(page.getByText('$245.30').first()).toBeVisible()
})

test('servicios y piezas: sugerencias de la lista común, el precio se guarda y la próxima vez sale solo', async ({ page }) => {
  await login(page)
  await openExampleAppointment(page)
  // Servicio desde la lista común
  await page.getByRole('button', { name: /Añadir lo que cobras/ }).click()
  await page.getByPlaceholder('Lo que hiciste o lo que pusiste').fill('imp')
  await page.getByRole('option', { name: /Cambio de impeller/ }).click()
  await page.getByPlaceholder('0.00').fill('120')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Mano de obra y servicios')).toBeVisible()
  // 120 + IVU 11.5% = 133.80
  await expect(page.getByText('$133.80').first()).toBeVisible()
  let s = await state()
  expect(s.work_order_parts.some((p) => p.kind === 'service' && p.description === 'Cambio de impeller')).toBe(true)
  expect(s.catalog_items.some((c) => c.mechanic_id && c.name === 'Cambio de impeller' && Number(c.last_price) === 120)).toBe(true)

  // La próxima vez: sale con su precio
  await page.getByRole('button', { name: /Añadir lo que cobras/ }).click()
  await page.getByPlaceholder('Lo que hiciste o lo que pusiste').fill('camb')
  await expect(page.getByRole('option', { name: /Cambio de impeller.*\$120\.00/ })).toBeVisible()
  await page.getByRole('option', { name: /Cambio de impeller/ }).click()
  await expect(page.getByPlaceholder('0.00')).toHaveValue('120')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()

  // Una pieza que el mecánico escribe nueva también se guarda
  await page.getByRole('button', { name: /Añadir lo que cobras/ }).click()
  await page.getByPlaceholder('Lo que hiciste o lo que pusiste').fill('Kit de sellos Lewmar')
  await page.getByPlaceholder('0.00').fill('38')
  await page.getByRole('button', { name: /Más detalles de la pieza/ }).click()
  await page.getByPlaceholder('6CE-44352-00').fill('LW-123')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Kit de sellos Lewmar')).toBeVisible()
  s = await state()
  expect(s.catalog_items.some((c) => c.mechanic_id && c.kind === 'part' && c.name === 'Kit de sellos Lewmar')).toBe(true)

  // Mis piezas y servicios: cambiar el precio y borrar
  await page.goto('/mas/catalogo')
  await expect(page.getByText('Cambio de impeller')).toBeVisible()
  const precio = page.getByLabel('Precio de Cambio de impeller')
  await precio.fill('135')
  await precio.blur()
  await expect.poll(async () => Number((await state()).catalog_items.find((c) => c.mechanic_id && c.name === 'Cambio de impeller')?.last_price)).toBe(135)
  await page.getByRole('button', { name: 'Piezas', exact: true }).click()
  await page.getByRole('button', { name: 'Borrar Kit de sellos Lewmar' }).click()
  await expect(page.getByText('Kit de sellos Lewmar')).toHaveCount(0)
})

test('mantenimiento: al terminar el trabajo pregunta cuándo le toca, y el bote muestra historial y próximo servicio', async ({ page }) => {
  await login(page)
  await openExampleAppointment(page)
  await page.getByRole('button', { name: /Añadir lo que cobras/ }).click()
  await page.getByPlaceholder('Lo que hiciste o lo que pusiste').fill('Cambio de impeller')
  await page.getByPlaceholder('0.00').fill('120')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.getByRole('button', { name: 'Terminado', exact: true }).click()
  // El recuadro sale y se puede saltar o guardar
  await expect(page.getByText('¿Cuándo le toca el próximo servicio?')).toBeVisible()
  await expect(page.getByPlaceholder('Cambio de aceite e impeller')).toHaveValue('Cambio de impeller')
  await page.getByRole('button', { name: '6 meses' }).click()
  await page.getByRole('button', { name: 'Guardar recordatorio' }).click()
  await expect(page.getByText(/Próximo servicio: Cambio de impeller/)).toBeVisible()
  const m = (await state()).maintenance_schedules[0]
  expect(m.interval_months).toBe(6)

  // Ficha del bote: último servicio, historial con lo que se hizo, próximo servicio
  await page.getByRole('link', { name: /La Tranquila · Ana Ejemplo/ }).first().click()
  await expect(page.getByText(/Último servicio:/)).toBeVisible()
  await expect(page.getByText(/Servicios:.*Cambio de impeller/)).toBeVisible()
  await expect(page.getByText(/cada 6 meses/)).toBeVisible()
})

test('Le toca servicio: sale en Inicio con Avisarle por WhatsApp y Hacer cita', async ({ page }) => {
  await login(page)
  // recordatorio para dentro de 5 días, desde la ficha del bote
  await page.goto('/botes/b1')
  await page.getByRole('button', { name: 'Recordatorio' }).click()
  await page.getByPlaceholder('Cambio de aceite e impeller').fill('Cambio de aceite')
  await page.getByRole('button', { name: 'Otra fecha' }).click()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico' }).format(new Date())
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 5)
  await page.getByLabel('Fecha').fill(d.toISOString().slice(0, 10))
  await page.getByRole('button', { name: 'Guardar recordatorio' }).click()
  await expect(page.getByText('Cambio de aceite').first()).toBeVisible()

  await page.goto('/inicio')
  await expect(page.getByRole('heading', { name: /Le toca servicio \(1\)/ })).toBeVisible()
  await expect(page.getByText('En 5 días', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Avisarle' })).toHaveAttribute('href', /wa\.me\/17875550111\?text=.*Cambio%20de%20aceite/)
  await page.locator('section', { has: page.getByRole('heading', { name: /Le toca servicio/ }) }).getByRole('link', { name: 'Hacer cita', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Cita nueva' })).toBeVisible()
  await expect(page.getByPlaceholder('El motor de babor no arranca en frío')).toHaveValue('Cambio de aceite')
})

test('el cliente aprueba el estimado desde el link y al mecánico le sale el aviso verde en todas las pantallas', async ({ page, browser }) => {
  await login(page)
  await openExampleAppointment(page)
  const wo = (await state()).work_orders[0]

  // El cliente, en su teléfono, sin cuenta
  const client = await browser.newPage()
  await client.goto(`http://localhost:4321/d/${wo.public_token}`)
  await expect(client.getByText('ESTIMADO', { exact: true })).toBeVisible()
  await client.getByRole('button', { name: 'Aprobar estimado' }).click()
  await client.getByRole('button', { name: 'Sí, apruebo' }).click()
  await expect(client.getByText(/Aprobado el/)).toBeVisible()
  await client.close()

  // El mecánico: aviso arriba, en cualquier pantalla
  await page.goto('/clientes')
  const alert = page.getByRole('status').filter({ hasText: 'aprobó el estimado' })
  await expect(alert).toBeVisible()
  await page.goto('/mas')
  await expect(alert).toBeVisible()
  // Abrir la cita no lo borra; la X sí
  await alert.getByRole('button', { name: /aprobó/ }).click()
  await expect(page.getByText(/El cliente lo aprobó desde el link/)).toBeVisible()
  await expect(alert).toBeVisible()
  await alert.getByRole('button', { name: 'Quitar aviso' }).click()
  await expect(alert).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'El trabajo' })).toBeVisible()
  await expect(alert).toHaveCount(0)
})

test('el mecánico abre "Ver el estimado" y puede volver al app (en el iPhone no hay botón de atrás)', async ({ page, browser }) => {
  await login(page)
  await openExampleAppointment(page)
  const cita = page.url()
  await page.getByRole('link', { name: 'Ver el estimado' }).click()
  await expect(page.getByText('ESTIMADO', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Volver al app' }).click()
  await expect(page).toHaveURL(cita)
  await expect(page.getByRole('heading', { name: 'El trabajo' })).toBeVisible()

  // El cliente (sin cuenta) no ve ese botón
  const token = (await state()).work_orders[0].public_token as string
  const client = await browser.newPage()
  await client.goto(`http://localhost:4321/d/${token}`)
  await expect(client.getByText('ESTIMADO', { exact: true })).toBeVisible()
  await expect(client.getByRole('button', { name: 'Volver al app' })).toHaveCount(0)
  await client.close()
})

test('Cobros es solo dinero: lo que está "Trabajando" sale en Inicio, no en Cobros', async ({ page }) => {
  await login(page)
  await openExampleAppointment(page)
  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByText('Todavía no hay cobros')).toBeVisible()

  await openExampleAppointment(page)
  await page.getByRole('button', { name: 'Trabajando', exact: true }).click()
  await page.getByRole('link', { name: 'Inicio' }).click()
  await expect(page.getByRole('heading', { name: 'Trabajando' })).toBeVisible()
  await expect(page.getByRole('link', { name: /La Tranquila · Ana Ejemplo/ })).toBeVisible()
  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByText('Todavía no hay cobros')).toBeVisible()
})

test('"Ya me pagó" sin hacer factura: la hace sola y queda pagada', async ({ page }) => {
  await login(page)
  await openExampleAppointment(page)
  await page.getByRole('button', { name: 'Ya me pagó' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Efectivo' }).click()
  await page.getByRole('button', { name: 'Guardar pago' }).click()
  await expect(page.getByText(/Pagada el .* Efectivo/)).toBeVisible()
  const s = await state()
  expect(s.invoices).toHaveLength(1)
  expect(s.invoices[0].number).toBe('0001')
  expect(s.invoices[0].payment_method).toBe('cash')
  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByRole('button', { name: /Cobrado este mes/ })).toBeVisible()
})

test('factura: cómo pagar (efectivo, solo ATH, o los dos) cambia lo que ve el cliente', async ({ page }) => {
  await login(page)
  await openExampleAppointment(page)
  await page.getByRole('button', { name: /Mano de obra por hora/ }).click()
  const hours = page.getByLabel('Horas')
  await hours.fill('1')
  await hours.blur()
  await page.getByRole('button', { name: 'Hacer factura' }).click()
  await expect(page.getByText('Factura #0001')).toBeVisible()
  const token = (await state()).invoices[0].public_token as string

  const client = await page.context().newPage()
  await client.goto(`/d/${token}?pago=cash`)
  await expect(client.getByText(/Pago en efectivo o cheque/)).toBeVisible()
  await expect(client.getByRole('button', { name: 'Copiar número' })).toHaveCount(0)
  await client.goto(`/d/${token}?pago=ath`)
  await expect(client.getByRole('button', { name: 'Copiar número' })).toBeVisible()
  await expect(client.getByText('También puedes pagar en efectivo o cheque.')).toHaveCount(0)
  await client.goto(`/d/${token}?pago=any`)
  await expect(client.getByRole('button', { name: 'Copiar número' })).toBeVisible()
  await expect(client.getByText('También puedes pagar en efectivo o cheque.')).toBeVisible()
  await expect(client.getByText('FACTURA #0001')).toBeVisible()
})

test('cliente y bote: ficha con WhatsApp, bote con Waze, motores y equipos', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByPlaceholder('Buscar nombre, bote, pueblo o teléfono').fill('tranquila')
  await page.getByRole('link', { name: /Ana Ejemplo/ }).click()
  await expect(page.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', /wa\.me\/17875550111/)
  await page.getByRole('link', { name: /La Tranquila/ }).first().click()
  await expect(page.getByRole('link', { name: /Waze/ })).toBeVisible()
  await expect(page.getByText(/Yamaha F200/)).toBeVisible()
  await expect(page.getByText('Windlass / Molinete')).toBeVisible()
})

test('Más: versión del app y Mi negocio con ATH Móvil y tarifa', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Más' }).click()
  await expect(page.getByText(/Salt Marine Repair · versión \d{4}-\d{2}-\d{2}/)).toBeVisible()
  await page.getByRole('link', { name: /Mi negocio/ }).click()
  await expect(page.getByLabel(/Número de ATH Móvil/)).toHaveValue('787-555-0100')
  await expect(page.getByLabel('Tarifa por hora ($)')).toHaveValue('85')
})

test('Admin: el dueño ve cuántos mecánicos hay y cuánto usa cada uno (sin los clientes de ellos)', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Más' }).click()
  await page.getByRole('link', { name: /Admin/ }).click()
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()
  await expect(page.getByText('Mecánicos', { exact: true })).toBeVisible()
  await expect(page.getByText('JQR Boat Repair').last()).toBeVisible()
  await expect(page.getByText('No ha entrado')).toBeVisible() // el mecánico nuevo de prueba
  await expect(page.getByText('Ana Ejemplo')).toHaveCount(0) // los clientes de los mecánicos no salen
})

test('Admin: un mecánico normal no ve el enlace de Admin', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Email o usuario').fill('nuevo@prueba.test')
  await page.locator('input[autocomplete=current-password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByLabel('Tu nombre completo *').fill('Mecánico Normal')
  await page.getByRole('button', { name: 'Empezar' }).click()
  await page.getByRole('link', { name: 'Más' }).click()
  await expect(page.getByRole('link', { name: /Mi negocio/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Admin/ })).toHaveCount(0)
})

test('Salir pide confirmación y vuelve a la pantalla de entrar', async ({ page }) => {
  await login(page)
  await page.locator('header').getByRole('button', { name: /Salir/ }).click()
  await page.getByRole('button', { name: 'Sí, salir' }).click()
  // El teléfono se acuerda de quién era: solo pide la contraseña o el PIN
  await expect(page.getByText('Entrando como')).toBeVisible()
  await expect(page.getByText('jqr', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cambiar' }).click()
  await expect(page.getByLabel('Email o usuario')).toBeVisible()
})

test('directorio cerrado: el público ve "Muy pronto" y no ve mecánicos', async ({ browser }) => {
  const visitor = await browser.newPage()
  await visitor.goto('http://localhost:4321/mecanicos')
  await expect(visitor.getByRole('heading', { name: 'Muy pronto' })).toBeVisible()
  await visitor.goto('http://localhost:4321/mecanicos/jqr-boat-repair')
  await expect(visitor.getByText('No encontramos ese mecánico')).toBeVisible()
  await visitor.close()
})

test('directorio: el mecánico pide salir, el admin lo aprueba y abre; un dueño de bote pide cita y al mecánico le llega', async ({ page, browser }) => {
  await login(page)

  // 1) El mecánico llena su perfil público
  await page.getByRole('link', { name: 'Más' }).click()
  await page.getByRole('link', { name: /Mi perfil público/ }).click()
  await expect(page.getByText('No sales en el directorio.')).toBeVisible()
  await page.getByRole('switch', { name: /Quiero salir en el directorio/ }).click()
  await expect(page.getByLabel('Dirección de tu página')).toHaveValue('jqr-boat-repair')
  await page.getByLabel('Sobre tu negocio').fill('Mecánico Yamaha con 15 años de experiencia.')
  await page.getByLabel('Añadir pueblo').selectOption('Ceiba')
  await page.getByRole('button', { name: 'Motores' }).click()
  await page.getByRole('button', { name: 'Yamaha' }).click()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('heading', { name: 'Más' })).toBeVisible()
  const m = (await state()).mechanics[0]
  expect(m).toMatchObject({ listed: true, approved: false, slug: 'jqr-boat-repair', public_services: ['engine'], public_brands: ['Yamaha'] })
  expect(m.public_towns).toEqual(['Fajardo', 'Ceiba'])

  // 2) El admin lo aprueba y abre el directorio
  await page.getByRole('link', { name: /Admin/ }).click()
  await expect(page.getByText('Por aprobar')).toBeVisible()
  await page.getByRole('button', { name: 'Aprobar' }).click()
  await expect(page.getByText('Sale', { exact: true })).toBeVisible()
  await page.getByRole('switch', { name: /Cerrado/ }).click()
  await expect(page.getByRole('switch', { name: /Abierto al público/ })).toBeVisible()

  // 3) Un dueño de bote, sin cuenta, busca y pide cita
  const visitor = await browser.newPage()
  await visitor.goto('http://localhost:4321/mecanicos')
  await expect(visitor.getByRole('heading', { name: /Encuentra un mecánico/ })).toBeVisible()
  await visitor.getByLabel(/Dónde está tu bote/).selectOption('Ceiba')
  await expect(visitor.getByText('1 mecánico')).toBeVisible()
  await visitor.getByLabel(/Dónde está tu bote/).selectOption('Ponce')
  await expect(visitor.getByText('No encontramos mecánicos')).toBeVisible()
  await visitor.getByLabel(/Dónde está tu bote/).selectOption('Fajardo')
  await visitor.getByRole('link', { name: /JQR Boat Repair/ }).click()
  await expect(visitor.getByRole('heading', { name: 'JQR Boat Repair' })).toBeVisible()
  await expect(visitor.getByText('Mecánico Yamaha con 15 años de experiencia.')).toBeVisible()
  await expect(visitor.getByText('Ana Ejemplo')).toHaveCount(0) // nunca los clientes del mecánico
  await visitor.getByRole('button', { name: 'Pedir cita' }).click()
  await visitor.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(visitor.getByRole('alert')).toHaveText('Escribe tu nombre.')
  await visitor.getByLabel('Tu nombre').fill('Pedro Boricua')
  await visitor.getByLabel('Tu teléfono (WhatsApp)').fill('787-555-0199')
  await visitor.getByLabel('¿Qué le pasa al bote?').fill('El Yamaha 150 no sube de revoluciones')
  await visitor.getByLabel('Nombre del bote (si tiene)').fill('Mi Sueño')
  await visitor.getByLabel('¿Dónde está el bote?').fill('Villa Marina, muelle 7')
  await visitor.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(visitor.getByText('¡Listo! Tu solicitud llegó')).toBeVisible()
  await visitor.close()

  const sr = (await state()).service_requests.find((r) => r.source === 'directory')!
  expect(sr).toMatchObject({ status: 'new', contact_name: 'Pedro Boricua', preferred_when: 'Esta semana' })

  // 4) Al mecánico le sale el aviso; abre la solicitud y hace la cita
  await page.goto('/clientes')
  const alert = page.getByRole('status').filter({ hasText: 'pidió cita' })
  await expect(alert).toBeVisible()
  await alert.click()
  await expect(page.getByRole('heading', { name: /Pedro Boricua pidió cita/ })).toBeVisible()
  await expect(page.getByText('Villa Marina, muelle 7')).toBeVisible()
  await page.getByRole('link', { name: 'Hacer cita' }).click()
  await expect(page.getByText('Mi Sueño').first()).toBeVisible()
  await expect(page.getByLabel(/problema/i).first()).toHaveValue('El Yamaha 150 no sube de revoluciones')
  await page.getByRole('button', { name: /Guardar/ }).click()
  await expect(page.getByRole('heading', { name: 'El trabajo' })).toBeVisible()
  const after = (await state()).service_requests.find((r) => r.id === sr.id)!
  expect(after.status).toBe('scheduled')
  await expect(page.getByRole('status').filter({ hasText: 'pidió cita' })).toHaveCount(0)
})

test('directorio cerrado: el admin lo ve desde el app en la misma ventana y puede volver al app', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Más' }).click()
  await page.getByRole('link', { name: /Mi perfil público/ }).click()
  await page.getByRole('switch', { name: /Quiero salir en el directorio/ }).click()
  await page.getByRole('button', { name: 'Motores' }).click()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.getByRole('link', { name: /Admin/ }).click()
  await page.getByRole('button', { name: 'Aprobar' }).click()
  await expect(page.getByText('Sale', { exact: true })).toBeVisible()
  // Todavía cerrado: el admin lo ve igual (vista previa), sin que se borre
  await page.getByRole('link', { name: 'Ver el directorio' }).click()
  await expect(page.getByText('Vista de administrador')).toBeVisible()
  await expect(page.getByRole('link', { name: /JQR Boat Repair/ })).toBeVisible()
  await page.waitForTimeout(1000)
  await expect(page.getByLabel(/Dónde está tu bote/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Muy pronto' })).toHaveCount(0)
  await page.getByRole('link', { name: /JQR Boat Repair/ }).click()
  await page.getByRole('button', { name: 'Pedir cita' }).click()
  // Con el directorio cerrado, el admin puede enviar una solicitud de prueba
  await page.getByLabel('Tu nombre').fill('Prueba Francisco')
  await page.getByLabel('Tu teléfono (WhatsApp)').fill('787-555-0177')
  await page.getByLabel('¿Qué le pasa al bote?').fill('Probando el directorio')
  await page.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(page.getByText('¡Listo! Tu solicitud llegó')).toBeVisible()
  await page.getByRole('link', { name: 'Volver al app' }).click()
  await expect(page.getByRole('heading', { name: 'Más' })).toBeVisible()
})

test('sin paquetes: el trabajo tiene un solo botón para añadir lo que cobras', async ({ page }) => {
  await login(page)
  await openExampleAppointment(page)
  await expect(page.getByRole('button', { name: /Añadir lo que cobras/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Paquete/ })).toHaveCount(0)
  await page.goto('/mas/catalogo')
  await expect(page.getByRole('button', { name: 'Paquetes' })).toHaveCount(0)
})

test('Admin: Quitar saca al mecánico del directorio', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Más' }).click()
  await page.getByRole('link', { name: /Mi perfil público/ }).click()
  await page.getByRole('switch', { name: /Quiero salir en el directorio/ }).click()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.getByRole('link', { name: /Admin/ }).click()
  await page.getByRole('button', { name: 'Aprobar' }).click()
  await expect(page.getByText('Sale', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Quitar', exact: true }).click()
  await expect(page.getByText('Por aprobar')).toBeVisible()
  expect((await state()).mechanics[0].approved).toBe(false)
})

test('Contactar al desarrollador: el mecánico escribe desde Más y al admin le llega a Mensajes (sin ver ningún email)', async ({ page, browser }) => {
  // Alguien que no puede entrar escribe desde la pantalla de entrar
  const visitor = await browser.newPage()
  await visitor.goto('http://localhost:4321/')
  await visitor.getByRole('button', { name: '¿Problemas para entrar? Escríbenos' }).click()
  const sheet = visitor.getByRole('dialog', { name: 'Contactar al desarrollador' })
  await sheet.getByLabel('Tu mensaje').fill('No me acuerdo de la contraseña')
  await sheet.getByRole('button', { name: /Enviar mensaje/ }).click()
  await expect(sheet.getByRole('alert')).toContainText('email o teléfono')
  await sheet.getByLabel('Tu email o teléfono').fill('787-555-0177')
  await sheet.getByRole('button', { name: /Enviar mensaje/ }).click()
  await expect(sheet.getByText('¡Recibido!')).toBeVisible()
  await expect(visitor.getByText(/@gmail\.com/)).toHaveCount(0) // el email del desarrollador no se ve
  await visitor.close()

  // El mecánico escribe desde Más
  await login(page)
  await page.getByRole('link', { name: 'Más' }).click()
  await page.getByRole('button', { name: /Contactar al desarrollador/ }).click()
  const s2 = page.getByRole('dialog', { name: 'Contactar al desarrollador' })
  await s2.getByLabel('Tu mensaje').fill('La factura no sale por WhatsApp')
  await s2.getByRole('button', { name: /Enviar mensaje/ }).click()
  await expect(s2.getByText('¡Recibido!')).toBeVisible()
  await s2.getByRole('button', { name: 'Cerrar' }).click()
  expect((await state()).support_messages).toHaveLength(2)

  // El admin lo ve en Admin → Mensajes
  await page.reload()
  await expect(page.getByRole('link', { name: /Admin/ })).toContainText('2 mensajes')
  await page.getByRole('link', { name: /Admin/ }).click()
  await expect(page.getByText('La factura no sale por WhatsApp')).toBeVisible()
  await expect(page.getByText('No me acuerdo de la contraseña')).toBeVisible()
  await page.getByRole('button', { name: 'Leído' }).first().click()
  await expect(page.getByText('1 nuevos')).toBeVisible()
})

test('PIN: el mecánico cambia su contraseña por un PIN de 6 números y entra con el teclado de números', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Más' }).click()
  await page.getByRole('link', { name: /Mi contraseña o PIN/ }).click()
  await page.getByLabel('PIN nuevo').fill('123456')
  await page.getByLabel('Repite el PIN').fill('123456')
  await page.getByRole('button', { name: 'Guardar PIN' }).click()
  await expect(page.getByRole('alert')).toContainText('muy fácil')
  await page.getByLabel('PIN nuevo').fill('48a2913') // las letras no entran
  await expect(page.getByLabel('PIN nuevo')).toHaveValue('482913')
  await page.getByLabel('Repite el PIN').fill('482913')
  await page.getByRole('button', { name: 'Guardar PIN' }).click()
  await expect(page.getByText('Tu PIN quedó guardado.')).toBeVisible()

  // Salir y entrar con el PIN (el teléfono recuerda que usa PIN)
  await page.getByText('Volver', { exact: true }).click()
  await page.locator('header').getByRole('button', { name: /Salir/ }).click()
  await page.getByRole('button', { name: 'Sí, salir' }).click()
  await expect(page.getByLabel('PIN', { exact: true })).toBeVisible()
  await expect(page.getByLabel('PIN', { exact: true })).toHaveAttribute('inputmode', 'numeric')
  await expect(page.getByText('Entrando como')).toBeVisible() // solo pide el PIN
  await page.getByLabel('PIN', { exact: true }).fill('482913')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.locator('header').getByText('JQR Boat Repair')).toBeVisible()
})

test('registro: un mecánico crea su cuenta solo, espera aprobación, el admin lo aprueba y entra', async ({ page, browser }) => {
  // 1) El mecánico nuevo, desde el link
  const nuevo = await browser.newPage()
  await nuevo.goto('http://localhost:4321/')
  await nuevo.getByRole('button', { name: /Crea tu cuenta/ }).click()
  await nuevo.getByLabel('Tu nombre completo *').fill('Pedro Mecánico')
  await nuevo.getByLabel('Nombre de tu compañía').fill('Pedro Marine')
  await nuevo.getByLabel('Teléfono / WhatsApp *').fill('787-555-0444')
  await nuevo.getByLabel('Tu email *').fill('pedro@marine.test')
  await nuevo.getByLabel('Tu PIN').fill('482913')
  await nuevo.getByLabel('Repite el PIN').fill('482913')
  await nuevo.getByRole('button', { name: /Crear mi cuenta/ }).click()
  await expect(nuevo.getByText(/Tu cuenta está/)).toBeVisible()
  await expect(nuevo.getByRole('link', { name: 'Agenda', exact: true })).toHaveCount(0) // todavía no entra al app
  const p = (await state()).profiles.find((x) => x.email === 'pedro@marine.test')!
  expect(p).toMatchObject({ role: 'mechanic', full_name: 'Pedro Mecánico', access: 'pending' })

  // 2) El admin lo ve y lo aprueba
  await login(page)
  await page.getByRole('link', { name: 'Más' }).click()
  await expect(page.getByRole('link', { name: /Admin/ })).toContainText('1 por aprobar')
  await page.getByRole('link', { name: /Admin/ }).click()
  await expect(page.getByText('Pedro Marine').first()).toBeVisible()
  await page.getByRole('button', { name: 'Aprobar' }).first().click()
  await expect(page.getByText('Cuentas por aprobar')).toHaveCount(0)

  // 3) El mecánico revisa y ya entra
  await nuevo.getByRole('button', { name: /Ya me aprobaron/ }).click()
  await expect(nuevo.locator('header').getByText('Pedro Marine')).toBeVisible()
  await nuevo.close()
})

test('factura rápida: sin cita, con cliente nuevo; Ya me pagó deja la factura pagada y en Cobros', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Cobros' }).click()
  await page.getByRole('link', { name: /Factura rápida/ }).click()
  await expect(page.getByRole('heading', { name: 'Factura rápida' })).toBeVisible()
  await page.getByRole('button', { name: 'Hacer factura' }).click()
  await expect(page.getByRole('alert')).toContainText('cliente')

  await page.getByRole('button', { name: 'Cliente nuevo' }).click()
  await page.getByPlaceholder('Nombre del cliente *').fill('Rosa Rápida')
  await page.getByPlaceholder('Teléfono / WhatsApp').fill('787-555-0155')
  await page.getByLabel('Descripción 1').fill('Cambio de impeller')
  await page.getByLabel('Precio 1').fill('100')
  await page.getByRole('button', { name: /Añadir otra cosa/ }).click() // sin escoger pieza o servicio
  await expect(page.getByLabel('Descripción 2')).toBeFocused()
  await page.getByLabel('Descripción 2').fill('Impeller')
  await page.getByLabel('Precio 2').fill('40')
  await expect(page.getByText('$156.10')).toBeVisible() // 140 + 11.5% IVU
  await page.getByRole('button', { name: 'Ya me pagó' }).click()
  await page.getByRole('dialog', { name: '¿Cómo te pagó?' }).getByRole('button', { name: /Efectivo/ }).click()
  await page.getByRole('button', { name: 'Guardar pago' }).click()
  await expect(page.getByText('Pagada ✓')).toBeVisible()
  await expect(page.getByRole('link', { name: /Enviar factura por WhatsApp/ })).toBeVisible()

  const s = await state()
  const boat = s.boats.find((b) => b.name === 'Bote de Rosa')!
  expect(boat).toBeTruthy()
  const wo = s.work_orders.find((w) => w.boat_id === boat.id)!
  expect(wo).toMatchObject({ status: 'paid', sea_trial_required: false })
  expect(s.work_order_parts.filter((p) => p.work_order_id === wo.id)).toHaveLength(2)
  expect(s.invoices.find((i) => i.work_order_id === wo.id)).toMatchObject({ payment_method: 'cash', total: 156.1 })
  // Lo que escribió y sus precios quedan guardados para la próxima vez
  const mine = s.catalog_items.filter((c) => c.mechanic_id)
  expect(mine.find((c) => c.name === 'Cambio de impeller')?.last_price).toBe(100)
  expect(mine.find((c) => c.name === 'Impeller')?.last_price).toBe(40)

  await page.getByRole('button', { name: 'Listo' }).click()
  await page.getByRole('button', { name: /Cobrado este mes/ }).click()
  await expect(page.getByRole('link', { name: /Bote de Rosa/ })).toBeVisible()

  // La próxima factura: al escribirlo, el precio sale solo
  await page.getByRole('link', { name: /Factura rápida/ }).click()
  await page.getByLabel('Descripción 1').fill('Cambio de impeller')
  await expect(page.getByLabel('Precio 1')).toHaveValue('100')
})

test('Inicio: al entrar salen los 4 botones grandes y lo de hoy', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('heading', { name: /¡Buen(os|as) (días|tardes|noches)/ })).toBeVisible()
  for (const name of ['Hacer cita', 'Factura rápida', 'Añadir cliente', 'Me deben']) {
    await expect(page.getByRole('link', { name: new RegExp(name) }).first()).toBeVisible()
  }
  await expect(page.getByRole('link', { name: /Ver agenda/ })).toBeVisible()
  await page.getByRole('link', { name: /Factura rápida/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Factura rápida' })).toBeVisible()
})

test('quién me debe: la factura sin pagar sale en Cobros, en Clientes ("Debe") y en el cliente; Ya me pagó la pasa a Pagos', async ({ page }) => {
  await login(page)
  await openExampleAppointment(page)
  await page.getByRole('button', { name: /Mano de obra por hora/ }).click()
  await page.getByLabel('Horas').fill('1')
  await page.getByLabel('Horas').blur()
  await page.getByRole('button', { name: 'Hacer factura' }).click()
  await expect(page.getByText('Factura #0001')).toBeVisible()

  // Cobros: me deben $94.78 (85 + 11.5%)
  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByText('$94.78').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Me deben' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Recordarle' })).toHaveAttribute('href', /wa\.me\/17875550111\?text=.*factura/)

  // Clientes: etiqueta roja
  await page.getByRole('link', { name: 'Clientes' }).click()
  await expect(page.getByText('Debe $94.78')).toBeVisible()

  // El cliente: pagar desde su ficha
  await page.getByRole('link', { name: /Ana Ejemplo/ }).click()
  await page.getByRole('button', { name: 'Ya me pagó' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Efectivo/ }).click()
  await page.getByRole('button', { name: 'Guardar pago' }).click()
  await expect(page.getByRole('heading', { name: 'Pagos' })).toBeVisible()
  await expect(page.getByText(/#0001 · La Tranquila/)).toBeVisible()
  expect((await state()).invoices[0].paid_at).toBeTruthy()

  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByRole('heading', { name: 'Me deben' })).toHaveCount(0)
})

test('Factura rápida: la flecha de volver regresa a donde estabas (Inicio o Agenda), no a Cobros', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: /Factura rápida/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Factura rápida' })).toBeVisible()
  await page.getByRole('button', { name: 'Volver' }).click()
  await expect(page.getByRole('heading', { name: /¡Buen(os|as)/ })).toBeVisible()

  await page.getByRole('link', { name: 'Agenda', exact: true }).click()
  await page.getByRole('link', { name: /Factura rápida/ }).click()
  await page.getByRole('button', { name: 'Volver' }).click()
  await expect(page).toHaveURL(/\/agenda/)
})

test('botón grande "Volver atrás": en Cobros regresa a Inicio, y en una pantalla de adentro regresa a la anterior', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Cobros' }).click()
  await page.getByRole('button', { name: 'Volver atrás' }).click()
  await expect(page.getByRole('heading', { name: /¡Buen(os|as)/ })).toBeVisible()

  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByRole('link', { name: /Ana Ejemplo/ }).click()
  await page.getByRole('button', { name: 'Volver atrás' }).click()
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
})

test('bloqueo con PIN: si el app estuvo sin usar más del tiempo escogido, pide el PIN para seguir', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Más' }).click()
  await page.getByRole('link', { name: /Mi contraseña o PIN/ }).click()
  await page.getByRole('button', { name: '5 minutos', exact: true }).click()
  // Como si hubieran pasado 10 minutos sin tocarla
  await page.evaluate(() => localStorage.setItem('ultima-actividad', String(Date.now() - 10 * 60_000)))
  await page.goto('/inicio')
  await expect(page.getByRole('heading', { name: 'El app está bloqueada' })).toBeVisible()
  await page.getByLabel('Contraseña').fill('mala')
  await page.getByRole('button', { name: 'Desbloquear' }).click()
  await expect(page.getByRole('alert')).toContainText('incorrect')
  await page.getByLabel('Contraseña').fill('prueba-del-bot')
  await page.getByRole('button', { name: 'Desbloquear' }).click()
  await expect(page.getByRole('heading', { name: /¡Buen(os|as)/ })).toBeVisible()
})

test('Mis piezas y servicios: añadir un servicio y una pieza con su precio', async ({ page }) => {
  await login(page)
  await page.goto('/mas/catalogo')
  await page.getByLabel('Servicio nuevo').fill('Cambio de bujías')
  await page.getByLabel('Precio', { exact: true }).fill('60')
  await page.getByRole('button', { name: /Añadir servicio/ }).click()
  await expect(page.getByText('Cambio de bujías')).toBeVisible()
  await expect(page.getByLabel('Servicio nuevo')).toHaveValue('')

  await page.getByRole('button', { name: 'Piezas', exact: true }).click()
  await page.getByLabel('Pieza nueva').fill('Bujía NGK')
  await page.getByLabel('Precio', { exact: true }).fill('9')
  await page.getByRole('button', { name: /Añadir pieza/ }).click()
  await expect(page.getByText('Bujía NGK')).toBeVisible()
  const mine = (await state()).catalog_items.filter((c) => c.mechanic_id)
  expect(mine.map((c) => [c.kind, c.name, c.last_price])).toEqual(expect.arrayContaining([['service', 'Cambio de bujías', 60], ['part', 'Bujía NGK', 9]]))
})
