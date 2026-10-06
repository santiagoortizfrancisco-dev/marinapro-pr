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
  await expect(page.getByRole('heading', { name: /Bienvenido a Marine Mechanics PR/ })).toBeVisible()
  await page.getByLabel('Tu nombre completo *').fill('Luis Prueba')
  await page.getByLabel('Nombre de tu compañía').fill('Luis Marine Service')
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(page.locator('header').getByText('Luis Marine Service')).toBeVisible()
  await expect(page.locator('header img')).toHaveAttribute('src', '/logo.svg')
  await expect(page.getByRole('link', { name: 'Agenda' })).toBeVisible()
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
  await expect(page.getByText(/9:00 AM a 12:00 PM/)).toBeVisible()
  await expect(page.getByText('El motor de babor no arranca en frío')).toBeVisible()
  // 7–9 libre y 12–5 libre
  await expect(page.getByRole('link', { name: /Libre · 2 horas/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Libre · 5 horas/ })).toBeVisible()
  await expect(page.getByText('7 horas libres')).toBeVisible()
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
  const hours = page.getByLabel('Horas')
  await hours.fill('2')
  await hours.blur()
  await expect(page.getByText('$170.00').first()).toBeVisible()

  await page.getByRole('button', { name: 'Pieza', exact: true }).click()
  await page.getByPlaceholder('Impeller Yamaha F200').fill('Impeller')
  await page.getByPlaceholder('45.00').fill('50')
  await page.getByRole('button', { name: 'Guardar pieza' }).click()
  await page.getByRole('button', { name: 'Pieza', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /El cliente/ }).click()
  await page.getByPlaceholder('Impeller Yamaha F200').fill('Aceite del cliente')
  await page.getByRole('button', { name: 'Guardar pieza' }).click()
  await expect(page.getByText('No se cobra')).toBeVisible()
  // 170 + 50 = 220; IVU 11.5% = 25.30; total 245.30
  await expect(page.getByText('$245.30').first()).toBeVisible()
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

test('Cobros: el estimado sin aprobar no sale; al marcarlo "Trabajando" sí sale', async ({ page }) => {
  await login(page)
  await openExampleAppointment(page)
  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByText('Todavía no hay cobros')).toBeVisible()

  await openExampleAppointment(page)
  await page.getByRole('button', { name: 'Trabajando', exact: true }).click()
  await page.getByRole('link', { name: 'Cobros' }).click()
  await expect(page.getByText('Aprobados y trabajando')).toBeVisible()
  await expect(page.getByText(/La Tranquila · Ana Ejemplo/)).toBeVisible()
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
  await expect(page.getByRole('heading', { name: 'Pagados' })).toBeVisible()
})

test('factura: cómo pagar (efectivo, solo ATH, o los dos) cambia lo que ve el cliente', async ({ page }) => {
  await login(page)
  await openExampleAppointment(page)
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
  await expect(page.getByText(/Marine Mechanics PR · versión \d{4}-\d{2}-\d{2}/)).toBeVisible()
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
  await expect(page.getByLabel('Email o usuario')).toBeVisible()
})
