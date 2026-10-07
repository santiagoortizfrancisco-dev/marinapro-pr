// Bot de pruebas — base de datos.
// Corre TODAS las migraciones en un Postgres de mentira (en memoria, en tu computadora)
// y revisa seguridad, totales, facturas y aprobación de estimados. No toca Supabase.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const sql = (f) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), 'utf8')
let A, B // dos mecánicos

/** Correr algo como un usuario (o como alguien sin cuenta con role = 'anon'). */
async function as(uid, query, role = 'authenticated') {
  await db.exec(`set role ${role}; select set_config('request.jwt.uid', '${uid ?? ''}', false);`)
  try {
    return (await db.query(query)).rows
  } finally {
    await db.exec('reset role')
  }
}
const one = async (uid, q, role) => (await as(uid, q, role))[0]
const fails = async (fn) => {
  try {
    await fn()
  } catch {
    return true
  }
  return false
}

before(async () => {
  // Lo que Supabase trae por su cuenta
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.uid', true), '')::uuid $$;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
    grant usage on schema public, auth, storage to authenticated, anon; grant all on storage.objects to authenticated;
    -- Igual que Supabase: las tablas nuevas le dan permisos a anon y authenticated (la RLS decide qué ven)
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;`)
  const files = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) await db.exec(sql(`migrations/${f}`))

  A = (await db.query(`insert into auth.users(email) values ('a@prueba.test') returning id`)).rows[0].id
  B = (await db.query(`insert into auth.users(email) values ('b@prueba.test') returning id`)).rows[0].id
  await as(A, `select set_my_role('mechanic','Mecánico A','787-555-0100','Fajardo','Taller A')`)
  await as(B, `select set_my_role('mechanic','Mecánico B',null,null,null)`)
})

test('las migraciones se pueden correr dos veces sin romper nada', async () => {
  // todas otra vez, en orden (como si alguien las pegara de nuevo en Supabase)
  const files = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files.filter((f) => f >= '0003')) await db.exec(sql(`migrations/${f}`))
})

test('el rol no se puede cambiar después de escogido', async () => {
  assert.ok(await fails(() => as(A, `select set_my_role('client','x',null,null,null)`)))
  assert.ok(await fails(() => as(A, `update profiles set role = 'client' where id = '${A}'`)))
})

let client, boat, wo
test('el mecánico crea cliente, bote, motor, equipo y cita', async () => {
  client = (await one(A, `insert into clients(mechanic_id, full_name, phone) values ('${A}','Ana Prueba','787-555-0111') returning id`)).id
  boat = (await one(A, `insert into boats(client_id, name, marina_name) values ('${client}','La Prueba','Puerto del Rey') returning id`)).id
  await as(A, `insert into engines(boat_id, make, hp, drive_type) values ('${boat}','Yamaha',200,'outboard')`)
  await as(A, `insert into equipment(boat_id, category, make) values ('${boat}','windlass','Lewmar')`)
  await as(A, `insert into appointments(mechanic_id, boat_id, starts_at, status) values ('${A}','${boat}','2026-10-07T09:00:00-04:00','confirmed')`)
  assert.equal((await one(A, `select count(*)::int n from boats`)).n, 1)
})

test('otro mecánico NO ve ni toca los clientes, botes, citas ni trabajos del primero', async () => {
  for (const t of ['clients', 'boats', 'engines', 'equipment', 'appointments']) {
    assert.equal((await one(B, `select count(*)::int n from ${t}`)).n, 0, `B ve ${t}`)
  }
  assert.ok(await fails(() => as(B, `insert into boats(client_id, name) values ('${client}','Robado')`)))
  assert.ok(await fails(() => as(B, `insert into equipment(boat_id, category) values ('${boat}','gps')`)))
  await as(B, `update clients set full_name = 'hackeado' where id = '${client}'`)
  assert.equal((await one(A, `select full_name from clients where id = '${client}'`)).full_name, 'Ana Prueba')
})

test('alguien sin cuenta no ve nada', async () => {
  for (const t of ['clients', 'boats', 'work_orders', 'invoices']) {
    const rows = await as(null, `select * from ${t}`, 'anon').catch(() => [])
    assert.equal(rows.length, 0, `anon ve ${t}`)
  }
})

test('totales: mano de obra + piezas del mecánico + IVU; la pieza del cliente no se cobra', async () => {
  wo = await one(A, `insert into work_orders(boat_id, labor_hours, labor_rate) values ('${boat}', 3.5, 85) returning id, public_token`)
  await as(A, `insert into work_order_parts(work_order_id, description, qty, unit_cost, supplied_by) values
      ('${wo.id}','Kit 100h',2,89.95,'mechanic'), ('${wo.id}','Aceite',4,30,'client')`)
  const d = (await one(null, `select get_public_document('${wo.public_token}') d`, 'anon')).d
  assert.equal(d.kind, 'estimate')
  assert.equal(Number(d.totals.labor), 297.5)
  assert.equal(Number(d.totals.parts), 179.9)
  assert.equal(Number(d.totals.ivu), 54.9)
  assert.equal(Number(d.totals.total), 532.3)
})

test('quitar el IVU de la mano de obra baja el total', async () => {
  await as(A, `update work_orders set charge_ivu_labor = false where id = '${wo.id}'`)
  const d = (await one(null, `select get_public_document('${wo.public_token}') d`, 'anon')).d
  assert.equal(Number(d.totals.ivu), 20.69)
  assert.equal(Number(d.totals.total), 498.09)
  await as(A, `update work_orders set charge_ivu_labor = true where id = '${wo.id}'`)
})

test('el cliente aprueba el estimado desde el link (sin cuenta)', async () => {
  const r = (await one(null, `select approve_estimate('${wo.public_token}') j`, 'anon')).j
  assert.equal(r.approved_by, 'client')
  const w = await one(A, `select status, estimate_approved_by, policies_accepted_version, approval_seen_at from work_orders where id = '${wo.id}'`)
  assert.equal(w.status, 'approved')
  assert.equal(w.estimate_approved_by, 'client')
  assert.equal(w.policies_accepted_version, 1)
  assert.equal(w.approval_seen_at, null)
})

test('un link falso no abre ni aprueba nada', async () => {
  assert.equal((await one(null, `select get_public_document(gen_random_uuid()) d`, 'anon')).d, null)
  assert.ok(await fails(() => as(null, `select approve_estimate(gen_random_uuid())`, 'anon')))
})

test('facturas: numeración 0001, 0002… sin repetir; otro mecánico no puede facturar', async () => {
  await as(A, `update mechanics set next_invoice_number = 1 where profile_id = '${A}'`)
  assert.ok(await fails(() => as(B, `select create_invoice('${wo.id}')`)))
  assert.ok(await fails(() => as(null, `select create_invoice('${wo.id}')`, 'anon')))
  const inv1 = (await one(A, `select create_invoice('${wo.id}') id`)).id
  const again = (await one(A, `select create_invoice('${wo.id}') id`)).id
  assert.equal(inv1, again, 'repetir la factura del mismo trabajo no crea otra')
  const wo2 = (await one(A, `insert into work_orders(boat_id) values ('${boat}') returning id`)).id
  await one(A, `select create_invoice('${wo2}') id`)
  const nums = (await as(A, `select number from invoices order by number`)).map((r) => r.number)
  assert.deepEqual(nums, ['0001', '0002'])
  assert.equal((await one(A, `select status from work_orders where id = '${wo.id}'`)).status, 'invoiced')
})

test('la factura pública trae el número, el cliente y el ATH Móvil', async () => {
  await as(A, `update mechanics set ath_movil_number = '787-555-0100' where profile_id = '${A}'`)
  const tok = (await one(A, `select public_token from invoices where work_order_id = '${wo.id}'`)).public_token
  const d = (await one(null, `select get_public_document('${tok}') d`, 'anon')).d
  assert.equal(d.kind, 'invoice')
  assert.equal(d.number, '0001')
  assert.equal(d.client.name, 'Ana Prueba')
  assert.equal(d.business.ath_movil, '787-555-0100')
})

test('fotos y logos: cada mecánico solo en su carpeta', async () => {
  await as(A, `insert into storage.objects(bucket_id, name) values ('photos', '${A}/${wo.id}/x.jpg')`)
  assert.ok(await fails(() => as(B, `insert into storage.objects(bucket_id, name) values ('photos', '${A}/${wo.id}/y.jpg')`)))
  assert.equal((await one(B, `select count(*)::int n from storage.objects`)).n, 0)
  assert.ok(await fails(() => as(B, `insert into storage.objects(bucket_id, name) values ('logos', '${A}/logo.png')`)))
})

test('mecánico invitado: entra y su cuenta ya está lista con su negocio y logo', async () => {
  await db.exec(`insert into mechanic_invites(email, full_name, business_name, logo_path, brand_color, labor_rate_hour)
                 values ('Nuevo@Prueba.test','José Nuevo','Taller Nuevo','/brands/x.jpg','#0b0b0f', 90)`)
  const id = (await db.query(`insert into auth.users(email) values ('nuevo@prueba.test') returning id`)).rows[0].id
  const m = (await db.query(`select p.role, m.business_name, m.logo_path, m.labor_rate_hour from profiles p join mechanics m on m.profile_id = p.id where p.id = '${id}'`)).rows[0]
  assert.equal(m.role, 'mechanic')
  assert.equal(m.business_name, 'Taller Nuevo')
  assert.equal(Number(m.labor_rate_hour), 90)
  const otro = (await db.query(`insert into auth.users(email) values ('cualquiera@prueba.test') returning id`)).rows[0].id
  assert.equal((await db.query(`select role from profiles where id = '${otro}'`)).rows[0].role, null)
})

test('los datos de prueba (seed) cargan sin errores', async () => {
  await db.exec(sql('seed.sql').replace('CAMBIA-ESTE@email.com', 'a@prueba.test'))
  assert.ok((await one(A, `select count(*)::int n from clients`)).n >= 3)
})

test('admin: solo el dueño del app ve el resumen, y solo números (no los clientes de los mecánicos)', async () => {
  assert.ok(await fails(() => as(A, `select admin_overview()`)), 'un mecánico no puede ver el resumen')
  assert.equal((await one(A, `select is_app_admin() ok`)).ok, false)
  assert.ok(await fails(() => as(null, `select admin_overview()`, 'anon')))
  assert.ok(await fails(() => as(A, `insert into app_admins(email) values ('a@prueba.test')`)), 'nadie se hace admin desde el app')

  const F = (await db.query(`insert into auth.users(email) values ('santiagoortizfrancisco@gmail.com') returning id`)).rows[0].id
  await as(F, `select set_my_role('mechanic','Francisco',null,null,null)`)
  assert.equal((await one(F, `select is_app_admin() ok`)).ok, true)
  const list = (await one(F, `select admin_overview() j`)).j
  const a = list.find((x) => x.email === 'a@prueba.test')
  assert.equal(a.business_name, 'Taller A')
  assert.ok(a.clients >= 4 && a.appointments >= 1 && a.invoices === 2)
  assert.ok(a.last_activity)
  const text = JSON.stringify(list)
  assert.ok(!text.includes('Ana Prueba') && !text.includes('787-555-0111'), 'no trae nombres ni teléfonos de clientes')
})

test('piezas y servicios: la lista común se ve, lo del mecánico se guarda con su precio y no lo ve otro', async () => {
  const common = await one(A, "select count(*)::int n from catalog_items where mechanic_id is null")
  assert.ok(common.n >= 80, 'la lista común tiene piezas y servicios')
  await as(A, "select remember_catalog_item('part', 'Impeller Yamaha F200', 45)")
  await as(A, "select remember_catalog_item('part', 'impeller yamaha f200', 48)") // mismo nombre: actualiza, no duplica
  const mine = await as(A, "select name, last_price, use_count from catalog_items where mechanic_id is not null")
  assert.equal(mine.length, 1)
  assert.equal(Number(mine[0].last_price), 48)
  assert.equal(mine[0].use_count, 2)
  assert.equal((await one(B, "select count(*)::int n from catalog_items where mechanic_id is not null")).n, 0, 'B no ve la lista de A')
  assert.ok(await fails(() => as(A, "update catalog_items set last_price = 1 where mechanic_id is null returning id").then((r) => { if (r.length) throw new Error('cambió la común') ; throw new Error('no-op') })))
  assert.equal((await one(A, "select count(*)::int n from catalog_items where mechanic_id is null and last_price = 1")).n, 0, 'nadie cambia la lista común')
})

test('servicios: cuentan como mano de obra (IVU de mano de obra) y salen en el estimado', async () => {
  const wo3 = await one(A, `insert into work_orders(boat_id, labor_hours, labor_rate, charge_ivu_parts) values ('${boat}', 1, 80, false) returning id, public_token`)
  await as(A, `insert into work_order_parts(work_order_id, description, qty, unit_cost, kind) values ('${wo3.id}','Cambio de impeller',1,120,'service')`)
  await as(A, `insert into work_order_parts(work_order_id, description, qty, unit_cost, kind, supplied_by) values ('${wo3.id}','Impeller',1,45,'part','mechanic')`)
  const d = (await one(null, `select get_public_document('${wo3.public_token}') d`, 'anon')).d
  // mano de obra 80 + servicio 120 = 200 (con IVU); pieza 45 (sin IVU en piezas)
  assert.equal(Number(d.totals.labor), 200)
  assert.equal(Number(d.totals.parts), 45)
  assert.equal(Number(d.totals.ivu), 23)
  assert.equal(Number(d.totals.total), 268)
  assert.ok(d.parts.some((p) => p.kind === 'service' && p.description === 'Cambio de impeller'))
})

test('mantenimiento: el mecánico guarda "le toca en 6 meses" y otro mecánico no lo ve', async () => {
  const w = (await one(A, "select id from work_orders limit 1")).id
  await as(A, `insert into maintenance_schedules(boat_id, service_type, due_date, interval_months, work_order_id) values ('${boat}', 'Cambio de aceite e impeller', current_date + 180, 6, '${w}')`)
  const m = await one(A, `select interval_months, status from maintenance_schedules where work_order_id = '${w}'`)
  assert.equal(m.interval_months, 6)
  assert.equal(m.status, 'pending')
  assert.equal((await one(B, "select count(*)::int n from maintenance_schedules")).n, 0)
  assert.ok(await fails(() => as(B, `insert into maintenance_schedules(boat_id, service_type, due_date) values ('${boat}', 'x', current_date)`)))
})

test('directorio: cerrado no se ve; el mecánico no se aprueba solo; el admin aprueba y abre', async () => {
  await as(A, `update mechanics set listed = true, slug = 'taller-a', public_towns = '{Fajardo}', public_services = '{engine}', public_brands = '{Yamaha}', public_description = 'Fuera de borda' where profile_id = '${A}'`)
  await as(A, `update mechanics set approved = true where profile_id = '${A}'`) // no debe poder
  assert.equal((await one(A, `select approved from mechanics where profile_id = '${A}'`)).approved, false, 'el mecánico no se aprueba solo')
  // cerrado: nadie ve la lista; el mecánico sí ve su vista previa
  assert.equal((await one(null, `select directory_search() j`, 'anon')).j.length, 0)
  assert.equal((await one(null, `select directory_profile('taller-a') j`, 'anon')).j, null)
  assert.equal((await one(A, `select directory_profile('taller-a') j`)).j.name, 'Taller A')
  // cerrado: el público no puede pedir cita; el mismo mecánico sí (para probar)
  assert.ok(await fails(() => as(null, `select submit_directory_request('taller-a','Público','7875550001','x','','','hola','') j`, 'anon')), 'cerrado: el público no pide')
  assert.equal((await one(A, `select submit_directory_request('taller-a','Prueba Mía','7875550002','x','','','probando','') j`)).j.ok, true)
  assert.ok(await fails(() => as(B, `select submit_directory_request('taller-a','Otro','7875550003','x','','','hola','') j`)), 'cerrado: otro mecánico no pide')
  await as(A, `delete from service_requests where contact_name = 'Prueba Mía'`)
  assert.ok(await fails(() => as(A, `select admin_set_directory_open(true)`)), 'un mecánico no abre el directorio')
  assert.ok(await fails(() => as(A, `select admin_set_approved('${A}', true)`)))

  const admin = (await db.query(`select id from profiles where email = 'santiagoortizfrancisco@gmail.com'`)).rows[0].id
  await as(admin, `select admin_set_approved('${A}', true)`)
  await as(admin, `select admin_set_directory_open(true)`)
  const list = (await one(null, `select directory_search('Fajardo', 'engine', 'Yamaha') j`, 'anon')).j
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'Taller A')
  const text = JSON.stringify(list)
  assert.ok(!text.includes('Ana Prueba') && !text.includes('labor_rate') && !text.includes('ath_movil'), 'en público no salen clientes ni precios')
  assert.equal((await one(null, `select directory_search('Ponce') j`, 'anon')).j.length, 0, 'otro pueblo no sale')
  const adminList = (await one(admin, `select admin_directory_list() j`)).j
  assert.ok(adminList.some((x) => x.slug === 'taller-a' && x.approved))
  // Quitar: deja de salir; Aprobar otra vez: vuelve
  await as(admin, `select admin_set_approved('${A}', false)`)
  assert.equal((await one(null, `select directory_search() j`, 'anon')).j.length, 0, 'quitado no sale')
  assert.equal((await one(null, `select directory_profile('taller-a') j`, 'anon')).j, null)
  await as(admin, `select admin_set_approved('${A}', true)`)
  assert.equal((await one(null, `select directory_search() j`, 'anon')).j.length, 1)
})

test('directorio: un dueño de bote pide cita sin cuenta → al mecánico le llega con cliente y bote; límite contra spam', async () => {
  const r = (await one(null, `select submit_directory_request('taller-a','Pedro Nuevo','787-555-0999','Sea Ray Azul','Sea Ray','Marina Puerto Chico','No arranca','Esta semana') j`, 'anon')).j
  assert.equal(r.ok, true)
  const sr = await one(A, `select s.source, s.status, s.contact_phone, c.full_name, b.name boat from service_requests s join clients c on c.id = s.client_id join boats b on b.id = s.boat_id where s.source = 'directory'`)
  assert.equal(sr.status, 'new')
  assert.equal(sr.full_name, 'Pedro Nuevo')
  assert.equal(sr.boat, 'Sea Ray Azul')
  assert.equal((await one(B, `select count(*)::int n from service_requests`)).n, 0, 'otro mecánico no la ve')
  // el mismo teléfono reusa el cliente
  await as(null, `select submit_directory_request('taller-a','Pedro Nuevo','(787) 555-0999','Sea Ray Azul','Sea Ray','','Otra cosa','') j`, 'anon')
  assert.equal((await one(A, `select count(*)::int n from clients where full_name = 'Pedro Nuevo'`)).n, 1)
  await as(null, `select submit_directory_request('taller-a','Pedro Nuevo','7875550999','Sea Ray Azul','','','Tercera','') j`, 'anon')
  assert.ok(await fails(() => as(null, `select submit_directory_request('taller-a','Pedro Nuevo','787-555-0999','x','','','Cuarta','') j`, 'anon')), 'más de 3 en un día se bloquea')
  // robot (llena el campo escondido): no crea nada
  const before = (await one(A, `select count(*)::int n from service_requests`)).n
  await as(null, `select submit_directory_request('taller-a','Robot','7870000000','x','','','spam spam','', 'http://spam') j`, 'anon')
  assert.equal((await one(A, `select count(*)::int n from service_requests`)).n, before)
  // a un mecánico que no está en el directorio no se le puede pedir
  assert.ok(await fails(() => as(null, `select submit_directory_request('no-existe','Ana','7875551234','x','','','hola','') j`, 'anon')))
})

test('anuncios: solo el admin los crea; el público los ve y los clics se cuentan', async () => {
  assert.ok(await fails(() => as(A, `insert into ads(advertiser, image_path) values ('X', 'x.jpg')`)))
  const admin = (await db.query(`select id from profiles where email = 'santiagoortizfrancisco@gmail.com'`)).rows[0].id
  const ad = (await one(admin, `insert into ads(advertiser, image_path, link_url) values ('Marine Max', 'ads/mm.jpg', 'https://example.com') returning id`)).id
  const shown = (await one(null, `select ads_active() j`, 'anon')).j
  assert.equal(shown[0].advertiser, 'Marine Max')
  await as(null, `select ad_click('${ad}')`, 'anon')
  const row = await one(admin, `select clicks, views from ads where id = '${ad}'`)
  assert.equal(row.clicks, 1)
  assert.ok(row.views >= 1)
  assert.equal((await as(null, `select * from ads`, 'anon').catch(() => [])).length, 0, 'el público no lee la tabla')
})

test('paquetes: todos ven los 3 de ejemplo; cada mecánico guarda los suyos y otro no los ve ni los toca', async () => {
  const examples = await as(A, `select name, items from service_packages where mechanic_id is null order by name`)
  assert.equal(examples.length, 3, 'los ejemplos no se duplican al correr la migración otra vez')
  assert.ok(examples.every((p) => p.items.every((i) => i.price === null)), 'los ejemplos no traen precios')
  assert.ok(await fails(() => as(A, `update service_packages set name = 'x' where mechanic_id is null returning id`).then((r) => { if (!r.length) throw new Error('no cambió') })) , 'nadie cambia los ejemplos')

  const items = JSON.stringify([{ kind: 'service', name: 'Servicio de 100 horas', qty: 1, price: 250 }, { kind: 'part', name: 'Bujía', qty: 4, price: 9 }])
  const pkg = (await one(A, `insert into service_packages(mechanic_id, name, items) values ('${A}', '100 horas F150', '${items}') returning id`)).id
  assert.equal((await one(A, `select count(*)::int n from service_packages where mechanic_id = '${A}'`)).n, 1)
  assert.equal((await one(B, `select count(*)::int n from service_packages where id = '${pkg}'`)).n, 0, 'B no lo ve')
  assert.ok(await fails(() => as(B, `insert into service_packages(mechanic_id, name) values ('${A}', 'falso')`)), 'B no crea paquetes a nombre de A')
  assert.equal((await as(B, `delete from service_packages where id = '${pkg}' returning id`)).length, 0, 'B no lo borra')
  assert.equal((await as(null, `select * from service_packages`, 'anon').catch(() => [])).length, 0, 'sin cuenta no se ve nada')
})

test('color de la barra: los mecánicos nuevos salen en negro; el que escogió otro color se queda con el suyo', async () => {
  assert.equal((await one(A, `select brand_color from mechanics where profile_id = '${A}'`)).brand_color, '#0b1220')
  await as(B, `update mechanics set brand_color = '#b91c1c' where profile_id = '${B}'`)
  await db.exec(readFileSync(new URL('../supabase/migrations/0012_color_negro.sql', import.meta.url), 'utf8'))
  assert.equal((await one(B, `select brand_color from mechanics where profile_id = '${B}'`)).brand_color, '#b91c1c', 'el rojo que escogió se queda')
})

test('mensajes al desarrollador: el mecánico y alguien sin cuenta escriben; solo el admin los lee', async () => {
  assert.equal((await one(A, `select send_support_message('No me sale la factura', null, '2026-10-07', '/trabajos') j`)).j.ok, true)
  assert.ok(await fails(() => as(null, `select send_support_message('No puedo entrar', null) j`, 'anon')), 'sin cuenta tiene que dejar email o teléfono')
  assert.equal((await one(null, `select send_support_message('No puedo entrar', '787-555-0199') j`, 'anon')).j.ok, true)
  assert.ok(await fails(() => as(A, `insert into support_messages(message) values ('directo')`)), 'nadie escribe directo en la tabla')
  assert.equal((await as(A, `select * from support_messages`)).length, 0, 'un mecánico no lee los mensajes')
  assert.equal((await as(null, `select * from support_messages`, 'anon').catch(() => [])).length, 0)
  const admin = (await db.query(`select id from profiles where email = 'santiagoortizfrancisco@gmail.com'`)).rows[0].id
  const msgs = await as(admin, `select * from support_messages order by created_at`)
  assert.equal(msgs.length, 2)
  assert.equal(msgs[0].business, 'Taller A', 'trae el negocio del mecánico')
  assert.equal(msgs[1].contact, '787-555-0199')
  assert.equal((await one(admin, `select admin_unread_messages() n`)).n, 2)
  await as(admin, `update support_messages set read_at = now() where id = '${msgs[0].id}'`)
  assert.equal((await one(admin, `select admin_unread_messages() n`)).n, 1)
  assert.equal((await one(A, `select admin_unread_messages() n`)).n, 0, 'un mecánico ve 0')
  for (let i = 0; i < 4; i++) await as(A, `select send_support_message('mensaje ${i}')`)
  assert.ok(await fails(() => as(A, `select send_support_message('uno más')`)), 'máximo 5 por hora')
})

test('registro con aprobación: el nuevo queda por aprobar, no se aprueba solo, y el admin lo aprueba', async () => {
  const C = (await db.query(`insert into auth.users(email) values ('nuevo@registro.test') returning id`)).rows[0].id
  await as(C, `select set_my_role('mechanic','Mecánico Nuevo','787-555-0300','Ponce','Nuevo Marine')`)
  assert.equal((await one(C, `select access from profiles where id = '${C}'`)).access, 'pending')
  // No se aprueba solo (ni con update directo ni con la función del admin)
  await as(C, `update profiles set full_name = 'Otro' where id = '${C}'`).catch(() => {})
  assert.ok(await fails(() => as(C, `update profiles set access = 'approved' where id = '${C}'`)))
  assert.ok(await fails(() => as(C, `select admin_set_access('${C}', 'approved')`)))
  assert.equal((await one(C, `select access from profiles where id = '${C}'`)).access, 'pending')
  assert.ok(await fails(() => as(A, `select admin_pending_accounts()`)), 'un mecánico no ve la lista')

  const admin = (await db.query(`select id from profiles where email = 'santiagoortizfrancisco@gmail.com'`)).rows[0].id
  const list = (await one(admin, `select admin_pending_accounts() j`)).j
  assert.ok(list.some((x) => x.id === C && x.business_name === 'Nuevo Marine' && x.phone === '787-555-0300'))
  const before = (await one(admin, `select admin_pending_count() n`)).n
  assert.ok(before >= 1)
  await as(admin, `select admin_set_access('${C}', 'approved')`)
  assert.equal((await one(C, `select access from profiles where id = '${C}'`)).access, 'approved')
  assert.equal((await one(admin, `select admin_pending_count() n`)).n, before - 1)
})

test('avisos al teléfono: sin pg_net ni canal no frenan nada (registro, directorio y mensajes siguen funcionando)', async () => {
  await db.exec(`insert into app_settings (key, value) values ('ntfy_topic', '"canal-de-prueba"') on conflict (key) do update set value = excluded.value`)
  const D = (await db.query(`insert into auth.users(email) values ('otro@registro.test') returning id`)).rows[0].id
  await as(D, `select set_my_role('mechanic','Otro Nuevo',null,null,'Otro Marine')`)
  await as(D, `update mechanics set listed = true, slug = 'otro-marine' where profile_id = '${D}'`)
  assert.equal((await one(D, `select send_support_message('Hola, una prueba') j`)).j.ok, true)
  assert.ok(await fails(() => as(D, `select notify_admin('x', 'y')`)), 'nadie llama los avisos desde el app')
  await db.exec(`delete from app_settings where key = 'ntfy_topic'`)
})
