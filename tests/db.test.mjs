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

/** Correr algo como el sistema (SQL Editor de Supabase: sin usuario, sin RLS). */
async function sys(query) {
  await db.exec(`reset role; select set_config('request.jwt.uid', '', false);`)
  return (await db.query(query)).rows
}

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
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, last_sign_in_at timestamptz, is_anonymous boolean not null default false, created_at timestamptz not null default now());
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
  for (const f of files) {
    // Supabase (desde el 30/oct/2026): las tablas NUEVAS ya no dan permisos solas; cada migración nueva
    // tiene que traer su GRANT. Las tablas de antes (0001–0016) ya los tienen en producción.
    if (f >= '0017') await db.exec('alter default privileges in schema public revoke all on tables from anon, authenticated')
    await db.exec(sql(`migrations/${f}`))
  }

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

test('registro sin aprobación: la cuenta nueva entra enseguida; el admin puede bloquearla y nadie se desbloquea solo', async () => {
  const C = (await db.query(`insert into auth.users(email) values ('nuevo@registro.test') returning id`)).rows[0].id
  await as(C, `select set_my_role('mechanic','Mecánico Nuevo','787-555-0300','Ponce','Nuevo Marine')`)
  assert.equal((await one(C, `select access from profiles where id = '${C}'`)).access, 'approved')
  assert.ok(await fails(() => as(C, `select admin_set_access('${C}', 'rejected')`)), 'solo el admin bloquea')
  assert.ok(await fails(() => as(A, `select admin_pending_accounts()`)), 'un mecánico no ve la lista')

  const admin = (await db.query(`select id from profiles where email = 'santiagoortizfrancisco@gmail.com'`)).rows[0].id
  await as(admin, `select admin_set_access('${C}', 'rejected')`)
  assert.equal((await one(C, `select access from profiles where id = '${C}'`)).access, 'rejected')
  await as(C, `update profiles set access = 'approved' where id = '${C}'`).catch(() => {})
  assert.equal((await one(C, `select access from profiles where id = '${C}'`)).access, 'rejected', 'no se desbloquea solo')
  await as(admin, `select admin_set_access('${C}', 'approved')`)
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

test('depósitos y abonos: el cliente paga por partes; al completar el total la factura queda Pagada sola; otro mecánico no ve los pagos', async () => {
  const w = (await one(A, `insert into work_orders(boat_id, labor_hours, labor_rate, charge_ivu_labor, charge_ivu_parts) values ('${boat}', 10, 100, false, false) returning id, public_token`))
  // Depósito antes de la factura
  await as(A, `insert into payments(work_order_id, amount, method) values ('${w.id}', 500, 'ath_movil')`)
  assert.ok(await fails(() => as(B, `insert into payments(work_order_id, amount) values ('${w.id}', 1)`)), 'otro mecánico no puede añadir pagos')
  assert.equal((await as(B, `select * from payments where work_order_id = '${w.id}'`)).length, 0, 'otro mecánico no ve los pagos')
  assert.ok(await fails(() => as(A, `insert into payments(work_order_id, amount) values ('${w.id}', 0)`)), 'un pago de $0 no se acepta')

  const inv = (await one(A, `select create_invoice('${w.id}') id`)).id
  let i = await one(A, `select total, paid_at from invoices where id = '${inv}'`)
  assert.equal(Number(i.total), 1000)
  assert.equal(i.paid_at, null, 'con $500 de $1,000 no está pagada')

  await as(A, `insert into payments(work_order_id, amount, method) values ('${w.id}', 200, 'cash')`)
  assert.equal((await one(A, `select paid_at from invoices where id = '${inv}'`)).paid_at, null)

  // La factura pública enseña los pagos
  const tok = (await one(A, `select public_token from invoices where id = '${inv}'`)).public_token
  const d = (await one(null, `select get_public_document('${tok}') d`, 'anon')).d
  assert.deepEqual(d.payments.map((p) => Number(p.amount)), [500, 200])

  // El balance
  await as(A, `insert into payments(work_order_id, amount, method) values ('${w.id}', 300, 'check')`)
  i = await one(A, `select paid_at, payment_method from invoices where id = '${inv}'`)
  assert.ok(i.paid_at, 'al saldar queda pagada')
  assert.equal(i.payment_method, 'check')
  assert.equal((await one(A, `select status from work_orders where id = '${w.id}'`)).status, 'paid')

  // Si se quita un pago por error, vuelve a deber
  await as(A, `delete from payments where work_order_id = '${w.id}' and amount = 300`)
  assert.equal((await one(A, `select paid_at from invoices where id = '${inv}'`)).paid_at, null)
  assert.equal((await one(A, `select status from work_orders where id = '${w.id}'`)).status, 'invoiced')
})

test('depósito que cubre todo: al hacer la factura sale Pagada', async () => {
  const w = (await one(A, `insert into work_orders(boat_id, labor_hours, labor_rate, charge_ivu_labor, charge_ivu_parts) values ('${boat}', 1, 100, false, false) returning id`)).id
  await as(A, `insert into payments(work_order_id, amount, method) values ('${w}', 100, 'cash')`)
  const inv = (await one(A, `select create_invoice('${w}') id`)).id
  assert.ok((await one(A, `select paid_at from invoices where id = '${inv}'`)).paid_at)
  assert.equal((await one(A, `select status from work_orders where id = '${w}'`)).status, 'paid')
})

test('tablas nuevas (Supabase desde 30/oct/2026): sin GRANT no se pueden usar; la de pagos sí tiene el suyo', async () => {
  await db.exec('alter default privileges in schema public revoke all on tables from anon, authenticated; create table public.zz_prueba (id int)')
  assert.ok(await fails(() => as(A, 'select * from zz_prueba')), 'una tabla nueva sin GRANT da "permission denied"')
  await db.exec('drop table public.zz_prueba')
  assert.ok((await as(A, 'select count(*)::int n from payments'))[0].n >= 0, 'payments tiene su GRANT')
})

test('link de prueba: el visitante anónimo recibe su propio taller de ejemplo, aprobado, sin ver lo de otros; no sale en Admin; se borra a los 7 días', async () => {
  const V = (await db.query(`insert into auth.users(is_anonymous) values (true) returning id`)).rows[0].id
  const W = (await db.query(`insert into auth.users(is_anonymous) values (true) returning id`)).rows[0].id
  await as(V, `select start_trial()`)
  await as(V, `select start_trial()`) // dos veces no duplica
  const p = await one(V, `select role, access, trial, full_name from profiles where id = '${V}'`)
  assert.deepEqual(p, { role: 'mechanic', access: 'approved', trial: true, full_name: 'Taller de Prueba' })
  assert.equal((await one(V, `select count(*)::int n from clients`)).n, 3, 've solo sus 3 clientes de ejemplo')
  assert.equal((await one(V, `select count(*)::int n from appointments`)).n, 2)
  const inv = await as(V, `select number, paid_at is not null as paid from invoices order by number`)
  assert.deepEqual(inv.map((i) => i.paid), [false, true], 'una factura con balance y una pagada')
  assert.equal((await one(V, `select count(*)::int n from payments`)).n, 2)

  // Otro visitante no ve lo del primero, y el primero no ve a los mecánicos reales
  await as(W, `select start_trial()`)
  assert.equal((await one(W, `select count(*)::int n from clients`)).n, 3)
  assert.equal((await one(V, `select count(*)::int n from clients where mechanic_id = '${A}'`)).n, 0)
  assert.equal((await one(A, `select count(*)::int n from clients where mechanic_id = '${V}'`)).n, 0)

  // Un usuario normal no puede usar start_trial ni aprobarse solo
  assert.ok(await fails(() => as(B, `select start_trial()`)))
  assert.equal((await one(B, `select trial from profiles where id = '${B}'`)).trial, false, 'un usuario normal no se vuelve prueba')

  // Admin no cuenta las pruebas como mecánicos
  await db.exec(`insert into app_admins(email) values ('a@prueba.test') on conflict do nothing`)
  const ov = (await one(A, `select admin_overview() j`)).j
  assert.ok(!ov.some((m) => m.id === V || m.id === W))
  assert.equal((await one(A, `select admin_trial_count() j`)).j.last_7_days, 2)

  // A los 7 días se borra todo lo de la prueba
  await db.exec(`update auth.users set created_at = now() - interval '8 days' where id = '${V}'`)
  assert.equal((await one(null, `select purge_old_trials() n`, 'postgres')).n, 1)
  assert.equal((await db.query(`select count(*)::int n from clients where mechanic_id = '${V}'`)).rows[0].n, 0)
  assert.equal((await db.query(`select count(*)::int n from clients where mechanic_id = '${W}'`)).rows[0].n, 3, 'la prueba nueva sigue')
})

test('FacturaFácil: cada negocio dice a qué se dedica; los de antes quedan como botes; la prueba arma el oficio escogido', async () => {
  assert.equal((await one(A, `select business_type from mechanics where profile_id = '${A}'`)).business_type, 'marine')
  await sys(`update mechanics set business_type = 'plumbing' where profile_id = '${A}'`)
  assert.equal((await one(A, `select business_type from mechanics where profile_id = '${A}'`)).business_type, 'plumbing')
  assert.ok(await fails(() => as(A, `update mechanics set business_type = 'piloto' where profile_id = '${A}'`)), 'solo los oficios de la lista')
  await sys(`update mechanics set business_type = 'marine' where profile_id = '${A}'`)

  const V = (await db.query(`insert into auth.users(is_anonymous) values (true) returning id`)).rows[0].id
  await as(V, `select start_trial('ac')`)
  assert.equal((await one(V, `select business_type from mechanics where profile_id = '${V}'`)).business_type, 'ac')
  const items = (await as(V, `select name from boats order by name`)).map((r) => r.name)
  assert.ok(items.includes('Unidad de la sala (24,000 BTU)'))
  assert.equal((await one(V, `select count(*)::int n from engines`)).n, 0, 'sin motores fuera de botes')
  const tok = (await one(V, `select public_token from invoices limit 1`)).public_token
  assert.equal((await one(null, `select get_public_document('${tok}') d`, 'anon')).d.business.business_type, 'ac')
})

test('salón: menú de uñas con duración, empleadas solo del negocio, propina en el pago y prueba de salón', async () => {
  // El menú de salón se carga una vez (uñas primero) y no se duplica
  await as(A, `select seed_beauty_services('${A}')`)
  await as(A, `select seed_beauty_services('${A}')`)
  const s = await one(A, `select count(*)::int n, min(duration_min) mn from catalog_items where mechanic_id = '${A}' and category = 'Uñas'`)
  assert.equal(s.n, 9)
  assert.ok(await fails(() => as(B, `select seed_beauty_services('${A}')`)), 'otro no le carga el menú')

  // Empleadas: cada negocio ve las suyas
  const st = (await one(A, `insert into staff (mechanic_id, name, commission_rate) values ('${A}', 'Yari', 0.4) returning id`)).id
  assert.equal((await as(B, `select * from staff`)).length, 0)
  assert.ok(await fails(() => as(B, `insert into staff (mechanic_id, name) values ('${A}', 'Intrusa')`)))
  assert.ok(await fails(() => as(A, `update staff set commission_rate = 1.5 where id = '${st}'`)), 'comisión entre 0% y 100%')

  // Estimados se pueden apagar
  await sys(`update mechanics set use_estimates = false, business_type = 'beauty' where profile_id = '${A}'`)
  assert.deepEqual(await one(A, `select use_estimates, business_type from mechanics where profile_id = '${A}'`), { use_estimates: false, business_type: 'beauty' })
  await sys(`update mechanics set use_estimates = true, business_type = 'marine' where profile_id = '${A}'`)

  // Prueba de salón
  const V = (await db.query(`insert into auth.users(is_anonymous) values (true) returning id`)).rows[0].id
  await as(V, `select start_trial('beauty')`)
  const m = await one(V, `select business_type, use_estimates from mechanics where profile_id = '${V}'`)
  assert.deepEqual(m, { business_type: 'beauty', use_estimates: false })
  assert.equal((await one(V, `select count(*)::int n from staff`)).n, 2)
  assert.equal((await one(V, `select count(*)::int n from appointments where staff_id is not null`)).n, 8)
  assert.ok(Number((await one(V, `select sum(tip) t from payments`)).t) > 0, 'propinas de ejemplo')
})

test('políticas del salón: al hacerse salón le tocan las de salón (no garantía de mecánico); las que escribió el negocio no se tocan', async () => {
  const pol = async () => (await one(A, `select policies_text p, warranty_days d from mechanics where profile_id = '${A}'`))
  await sys(`update mechanics set business_type = 'beauty' where profile_id = '${A}'`)
  assert.match((await pol()).p, /24 horas/)
  assert.doesNotMatch((await pol()).p, /piezas|agua|mecánico/i)
  await sys(`update mechanics set business_type = 'marine' where profile_id = '${A}'`)
  assert.match((await pol()).p, /Garantía de mano de obra/)
  assert.equal((await pol()).d, 90)

  await as(A, `update mechanics set policies_text = 'Mis reglas propias' where profile_id = '${A}'`)
  await sys(`update mechanics set business_type = 'beauty' where profile_id = '${A}'`)
  assert.equal((await pol()).p, 'Mis reglas propias')
  await sys(`update mechanics set business_type = 'marine', policies_text = default_policies() where profile_id = '${A}'`)
})

test('el tipo de negocio se escoge una sola vez: después solo el administrador lo cambia', async () => {
  const C = (await db.query(`insert into auth.users(email) values ('salon@nuevo.test') returning id`)).rows[0].id
  await as(C, `select set_my_role('mechanic','Salón Nuevo','787-555-0900','Salinas','Salón Nuevo')`)
  await as(C, `update mechanics set business_type = 'beauty', business_type_set = true where profile_id = '${C}'`)
  assert.deepEqual(await one(C, `select business_type, business_type_set from mechanics where profile_id = '${C}'`), { business_type: 'beauty', business_type_set: true })
  assert.ok(await fails(() => as(C, `update mechanics set business_type = 'marine' where profile_id = '${C}'`)), 'ya no lo puede cambiar')
  await as(C, `update mechanics set business_type_set = false where profile_id = '${C}'`)
  assert.ok(await fails(() => as(C, `update mechanics set business_type = 'marine' where profile_id = '${C}'`)), 'ni quitándole el candado')
  await as(C, `update mechanics set business_name = 'Salón Nuevo PR' where profile_id = '${C}'`)
  assert.equal((await one(C, `select business_name from mechanics where profile_id = '${C}'`)).business_name, 'Salón Nuevo PR', 'lo demás sí se cambia')

  const admin = (await db.query(`select id from profiles where email = 'santiagoortizfrancisco@gmail.com'`)).rows[0].id
  await as(admin, `update mechanics set business_type = 'marine' where profile_id = '${admin}'`)
  await as(admin, `update mechanics set business_type = 'beauty' where profile_id = '${admin}'`)
  assert.equal((await one(admin, `select business_type from mechanics where profile_id = '${admin}'`)).business_type, 'beauty', 'el administrador sí lo cambia')
})

test('citas por internet: la clienta ve el menú y las horas (sin nombres), pide la cita y queda "pedida"; no se monta encima ni fuera de horario', async () => {
  const allDay = `'{"0":["08:00","20:00"],"1":["08:00","20:00"],"2":["08:00","20:00"],"3":["08:00","20:00"],"4":["08:00","20:00"],"5":["08:00","20:00"],"6":["08:00","20:00"]}'`
  await sys(`update mechanics set booking_on = true, booking_slug = 'salon-a', booking_hours = ${allDay}::jsonb where profile_id = '${A}'`)
  await sys(`update mechanics set booking_on = false, booking_slug = 'salon-b' where profile_id = '${B}'`)
  await as(A, `select seed_beauty_services('${A}')`)

  const page = (await one(null, `select booking_page('Salon-A') d`, 'anon')).d
  assert.ok(page.services.length >= 10, 'el menú del salón')
  assert.equal((await one(null, `select booking_page('salon-b') d`, 'anon')).d, null, 'si el salón no lo prendió, no sale')
  const seen = await as(null, `select count(*)::int n from clients`, 'anon').catch(() => [{ n: 0 }])
  assert.equal(seen[0].n, 0, 'un visitante no ve las clientas')

  const at = `((current_date + 3) + time '10:00') at time zone 'America/Puerto_Rico'`
  const svc = page.services.find((s) => s.name === 'Pedicura').id
  const id = (await one(null, `select booking_request('salon-a', 'Lola Web', '787-555-1212', array['${svc}']::uuid[], null, ${at}, 'color rojo') id`, 'anon')).id
  const ap = (await sys(`select a.status, a.source, a.title, a.duration_min, c.full_name, c.mechanic_id from appointments a join boats b on b.id = a.boat_id join clients c on c.id = b.client_id where a.id = '${id}'`))[0]
  assert.deepEqual(ap, { status: 'requested', source: 'online', title: 'Pedicura', duration_min: 45, full_name: 'Lola Web', mechanic_id: A })

  const busy = (await one(null, `select booking_busy('salon-a', (current_date + 3)) d`, 'anon')).d
  assert.equal(busy.length >= 1, true)
  assert.ok(!JSON.stringify(busy).includes('Lola'), 'las horas ocupadas no dicen quién')

  let st = (await sys(`select id from staff where mechanic_id = '${A}' and active limit 1`))[0]?.id
  if (!st) st = (await sys(`insert into staff (mechanic_id, name) values ('${A}', 'Yari') returning id`))[0].id
  assert.ok(await fails(() => as(null, `select booking_request('salon-a', 'Otra', '787-555-3434', array['${svc}']::uuid[], '${st}', ${at})`, 'anon')), 'esa hora ya se cogió')
  assert.ok(await fails(() => as(null, `select booking_request('salon-a', 'Otra', '787-555-3434', array['${svc}']::uuid[], null, ((current_date + 3) + time '22:00') at time zone 'America/Puerto_Rico')`, 'anon')), 'cerrado a esa hora')
  assert.ok(await fails(() => as(null, `select booking_request('salon-a', 'Otra', '787-555-3434', array['${svc}']::uuid[], null, now() - interval '1 day')`, 'anon')), 'en el pasado no')
  assert.ok(await fails(() => as(null, `select booking_request('salon-b', 'Otra', '787-555-3434', array['${svc}']::uuid[], null, ${at})`, 'anon')), 'salón apagado')
  await sys(`update mechanics set booking_on = false where profile_id = '${A}'`)
})

test('tarjetas de regalo: solo las ve su negocio; pagar con la tarjeta le resta, no deja pasarse del balance y borrar el pago se lo devuelve', async () => {
  const card = (await as(A, `insert into gift_cards (mechanic_id, code, amount, balance, recipient_name) values ('${A}', 'REGALO-1111', 50, 50, 'Mamá') returning id`))[0].id
  assert.equal((await one(B, `select count(*)::int n from gift_cards`)).n, 0, 'otro negocio no la ve')
  assert.ok(await fails(() => as(B, `insert into gift_cards (mechanic_id, code, amount, balance) values ('${A}', 'X-1', 10, 10)`)), 'ni la crea a nombre de otro')

  const w = (await sys(`select w.id from work_orders w join boats b on b.id = w.boat_id join clients c on c.id = b.client_id where c.mechanic_id = '${A}' limit 1`))[0].id
  const pay = (await as(A, `insert into payments (work_order_id, amount, method, gift_card_id) values ('${w}', 30, 'other', '${card}') returning id`))[0].id
  assert.equal(Number((await one(A, `select balance from gift_cards where id = '${card}'`)).balance), 20)
  assert.ok(await fails(() => as(A, `insert into payments (work_order_id, amount, method, gift_card_id) values ('${w}', 25, 'other', '${card}')`)), 'no le quedan $25')
  await as(A, `delete from payments where id = '${pay}'`)
  assert.equal(Number((await one(A, `select balance from gift_cards where id = '${card}'`)).balance), 50, 'se le devuelve')
})

test('registro: la cuenta nueva empieza con ejemplos de su oficio (se borran con un botón) y al admin le llega el registro con nombre, oficio, email y teléfono', async () => {
  const C = (await db.query(`insert into auth.users(email) values ('glow@salon.test') returning id`)).rows[0].id
  await as(C, `select set_my_role('mechanic','Gloria Rivera','787-555-0888','Salinas','Glow Studio')`)
  await as(C, `update mechanics set business_type = 'beauty', business_type_set = true, use_estimates = false where profile_id = '${C}'`)

  // Al admin: queda el registro con sus datos
  const admin = (await sys(`select id from profiles where email = 'santiagoortizfrancisco@gmail.com'`))[0].id
  assert.ok(await fails(() => as(C, `select admin_new_signups()`)), 'solo el admin ve los registros')
  assert.ok(Number((await one(admin, `select admin_unseen_signups() n`)).n) >= 1)
  const list = (await one(admin, `select admin_new_signups() d`)).d
  assert.deepEqual((({ full_name, business_name, business_type, email, phone }) => ({ full_name, business_name, business_type, email, phone }))(list.find((s) => s.email === 'glow@salon.test')),
    { full_name: 'Gloria Rivera', business_name: 'Glow Studio', business_type: 'beauty', email: 'glow@salon.test', phone: '787-555-0888' })
  await as(admin, `select admin_mark_signups_seen()`)
  assert.equal(Number((await one(admin, `select admin_unseen_signups() n`)).n), 0)
  assert.equal(Number((await one(C, `select admin_unseen_signups() n`)).n), 0, 'a los demás les sale 0')

  // Ejemplos de salón: clientas, empleadas, citas y cobros; se borran con un botón
  await as(C, `select load_examples()`)
  assert.equal((await one(C, `select count(*)::int n from clients where is_example`)).n, 4)
  assert.equal((await one(C, `select count(*)::int n from staff where is_example`)).n, 2)
  assert.ok((await one(C, `select count(*)::int n from invoices`)).n >= 4)
  await as(C, `select load_examples()`) // otra vez no duplica
  assert.equal((await one(C, `select count(*)::int n from clients`)).n, 4)
  await as(C, `insert into clients (mechanic_id, full_name) values ('${C}', 'Clienta de verdad')`)
  await as(C, `select clear_examples()`)
  assert.deepEqual((await as(C, `select full_name from clients`)).map((r) => r.full_name), ['Clienta de verdad'])
  assert.equal((await one(C, `select count(*)::int n from staff`)).n, 0)
  assert.equal((await one(C, `select count(*)::int n from invoices`)).n, 0)
  assert.equal((await one(C, `select next_invoice_number n from mechanics where profile_id = '${C}'`)).n, 1)
})

test('pedir información (página /info): un visitante sin cuenta deja nombre y email (sin teléfono); solo el admin los ve; no se puede llenar de basura', async () => {
  await as(null, `select request_info('Lola Curiosa', 'Lola@Test.pr', 'Salón / uñas / spa', '¿Cuánto cuesta?')`, 'anon')
  assert.ok(await fails(() => as(null, `select request_info('L', 'lola@test.pr')`, 'anon')), 'nombre muy corto')
  assert.ok(await fails(() => as(null, `select request_info('Lola', 'no-es-email')`, 'anon')), 'email malo')
  await as(null, `select request_info('Lola Curiosa', 'lola@test.pr')`, 'anon')
  await as(null, `select request_info('Lola Curiosa', 'lola@test.pr')`, 'anon')
  assert.ok(await fails(() => as(null, `select request_info('Lola Curiosa', 'lola@test.pr')`, 'anon')), 'máximo 3 por email al día')
  const seen = await as(null, `select count(*)::int n from info_requests`, 'anon').catch(() => [{ n: 0 }])
  assert.equal(seen[0].n, 0, 'el visitante no ve la lista')
  const D = (await sys(`insert into auth.users(email) values ('curioso@mecanico.test') returning id`))[0].id
  assert.ok(await fails(() => as(D, `select admin_info_requests()`)), 'otro usuario no la ve')
  assert.equal(Number((await one(D, `select admin_unseen_info() n`)).n), 0)

  const admin = (await sys(`select id from profiles where email = 'santiagoortizfrancisco@gmail.com'`))[0].id
  const list = (await one(admin, `select admin_info_requests() d`)).d
  assert.equal(list.length, 3)
  assert.deepEqual([list.at(-1).email, list.at(-1).message], ['lola@test.pr', '¿Cuánto cuesta?'])
  assert.equal(Number((await one(admin, `select admin_unseen_info() n`)).n), 3)
  await as(admin, `select admin_mark_info_seen()`)
  assert.equal(Number((await one(admin, `select admin_unseen_info() n`)).n), 0)
})

test('piscinas: es un oficio más; la prueba y los ejemplos traen piscinas', async () => {
  const V = (await db.query(`insert into auth.users(is_anonymous) values (true) returning id`)).rows[0].id
  await as(V, `select start_trial('pool')`)
  assert.equal((await one(V, `select business_type from mechanics where profile_id = '${V}'`)).business_type, 'pool')
  assert.ok((await as(V, `select name from boats`)).map((r) => r.name).includes('Piscina del condominio'))

  const P = (await db.query(`insert into auth.users(email) values ('aqua@piscinas.test') returning id`)).rows[0].id
  await as(P, `select set_my_role('mechanic','Pedro Aqua','787-555-0999','Dorado','Aqua Pools')`)
  await as(P, `update mechanics set business_type = 'pool', business_type_set = true where profile_id = '${P}'`)
  await as(P, `select load_examples()`)
  assert.equal((await one(P, `select count(*)::int n from boats where name like 'Piscina%'`)).n, 3)
  const admin = (await sys(`select id from profiles where email = 'santiagoortizfrancisco@gmail.com'`))[0].id
  assert.ok((await one(admin, `select admin_new_signups() d`)).d.some((s) => s.business_type === 'pool' && s.email === 'aqua@piscinas.test'))
})

test('link de la cita: la clienta ve su cita y estimado sin cuenta, acepta, y dice que envió el depósito', async () => {
  const ap = (await sys(`select a.id from appointments a where a.mechanic_id = '${A}' and a.status <> 'cancelled' limit 1`))[0].id
  await sys(`update appointments set deposit_asked = 20 where id = '${ap}'`)
  const page = (await one(null, `select cita_public('${ap}') d`, 'anon')).d
  assert.equal(Number(page.deposit), 20)
  assert.ok(page.business && page.client, 'enseña el salón y el nombre')
  assert.equal(page.client_ok_at, null)
  await as(null, `select cita_reply('${ap}')`, 'anon')
  const after = (await sys(`select client_ok_at, deposit_reported_at from appointments where id = '${ap}'`))[0]
  assert.ok(after.client_ok_at && after.deposit_reported_at, 'quedó aceptada y con depósito reportado')
  assert.equal((await one(null, `select cita_public('00000000-0000-4000-8000-000000000000') d`, 'anon')).d, null, 'otra cita no existe')
})

test('guardería: precios de ejemplo, contrato por bote, cobros sueltos y "Facturar el mes" (una vez por mes, vence, atraso)', async () => {
  const G = (await db.query(`insert into auth.users(email) values ('marina@guarderia.test') returning id`)).rows[0].id
  await as(G, `select set_my_role('mechanic','Luis Marina','787-555-0777','Fajardo','Marina del Este')`)
  await as(G, `update mechanics set business_type = 'storage', business_type_set = true, storage_late_fee = 25 where profile_id = '${G}'`)
  await as(G, `select seed_storage_rates('${G}')`)
  await as(G, `select seed_storage_rates('${G}')`)
  assert.equal((await one(G, `select count(*)::int n from storage_rates`)).n, 9, 'la lista de ejemplo sale una sola vez')
  assert.ok(await fails(() => as(B, `select seed_storage_rates('${G}')`)), 'otro no le llena la lista')

  const cl = (await one(G, `insert into clients (mechanic_id, full_name, phone) values ('${G}', 'Carlos Vega', '787-555-0778') returning id`)).id
  const bt = (await one(G, `insert into boats (client_id, name, length_ft) values ('${cl}', 'Sea Ray', 24) returning id`)).id
  const rack = (await one(G, `select id from storage_rates where name like 'Guardería en seco%'`)).id
  const k = (await one(G, `insert into storage_contracts (mechanic_id, boat_id, rate_id, space_label, monthly_price, start_date) values ('${G}', '${bt}', '${rack}', 'Rack A-12', 288, '2026-09-15') returning id`)).id
  await as(G, `insert into storage_charges (mechanic_id, boat_id, description, qty, unit_price, charged_on) values ('${G}', '${bt}', 'Uso de rampa', 2, 15, '2026-10-05')`)
  await as(G, `insert into storage_charges (mechanic_id, boat_id, description, qty, unit_price, charged_on) values ('${G}', '${bt}', 'Lavado del bote', 1, 40, '2026-11-02')`)

  assert.equal((await one(G, `select storage_bill_month('2026-10-01') n`)).n, 1)
  assert.equal((await one(G, `select storage_bill_month('2026-10-01') n`)).n, 0, 'el mismo mes no se factura dos veces')
  const inv = await one(G, `select i.labor_subtotal + i.parts_subtotal as total, i.due_date, i.public_token from storage_bills sb join invoices i on i.work_order_id = sb.work_order_id where sb.contract_id = '${k}' and sb.month = '2026-10-01'`)
  assert.equal(Number(inv.total), 318, 'renta 288 + 2 usos de rampa (el lavado de noviembre se queda para noviembre)')
  assert.ok(inv.due_date, 'tiene fecha de vencimiento')
  assert.equal(String((await one(null, `select invoice_due_date('${inv.public_token}') d`, 'anon')).d), String(inv.due_date))
  assert.equal((await one(G, `select count(*)::int n from storage_charges where work_order_id is null`)).n, 1)

  // Si la de octubre se pasó de la fecha sin pagar, noviembre lleva el cargo por atraso
  await sys(`update invoices set due_date = '2026-01-01' where public_token = '${inv.public_token}'`)
  assert.equal((await one(G, `select storage_bill_month('2026-11-01') n`)).n, 1)
  const nov = await one(G, `select i.labor_subtotal + i.parts_subtotal as total from storage_bills sb join invoices i on i.work_order_id = sb.work_order_id where sb.month = '2026-11-01'`)
  assert.equal(Number(nov.total), 288 + 40 + 25)

  assert.equal((await as(A, `select * from storage_contracts`)).length, 0, 'otro negocio no ve los contratos')
  assert.equal((await as(A, `select * from storage_charges`)).length, 0)
  assert.equal((await as(A, `select * from storage_bills`)).length, 0)
  assert.equal((await one(A, `select storage_bill_month('2026-10-01') n`)).n, 0, 'ni los factura')
})

test('guardería: zonas y espacios numerados; nunca dos botes en el mismo espacio; salir al agua reserva su espacio', async () => {
  const G = (await sys(`select profile_id from mechanics where business_name = 'Marina del Este'`))[0].profile_id
  const patio = (await one(G, `insert into storage_zones (mechanic_id, name, kind) values ('${G}', 'Patio A', 'land') returning id`)).id
  const muelle = (await one(G, `insert into storage_zones (mechanic_id, name, kind) values ('${G}', 'Muelle C', 'water') returning id`)).id
  assert.equal((await one(G, `select storage_add_spots('${patio}', 'A-', 1, 5) n`)).n, 5)
  assert.equal((await one(G, `select storage_add_spots('${patio}', 'A-', 4, 3) n`)).n, 1, 'los que ya existen no se repiten (A-6 es el único nuevo)')
  assert.equal((await one(G, `select storage_add_spots('${muelle}', 'C-', 1, 2) n`)).n, 2)
  assert.ok(await fails(() => as(B, `select storage_add_spots('${patio}', 'X-', 1, 2)`)), 'otro no le crea espacios')
  const spot = async (z, l) => (await one(G, `select id from storage_spots where zone_id = '${z}' and label = '${l}'`)).id
  const a1 = await spot(patio, 'A-1'), a2 = await spot(patio, 'A-2'), c1 = await spot(muelle, 'C-1')

  const cl = (await one(G, `select id from clients where full_name = 'Carlos Vega'`)).id
  const b2 = (await one(G, `insert into boats (client_id, name, length_ft) values ('${cl}', 'Boston Whaler', 21) returning id`)).id
  const k1 = (await one(G, `select id from storage_contracts where status = 'active' limit 1`)).id
  await as(G, `update storage_contracts set spot_id = '${a1}' where id = '${k1}'`)
  await assert.rejects(as(G, `insert into storage_contracts (mechanic_id, boat_id, monthly_price, spot_id) values ('${G}', '${b2}', 200, '${a1}')`), /ya está ocupado por Sea Ray/)
  const k2 = (await one(G, `insert into storage_contracts (mechanic_id, boat_id, monthly_price, spot_id) values ('${G}', '${b2}', 200, '${a2}') returning id`)).id

  // Sale al agua: A-1 queda reservado para él y ocupa C-1 mientras tanto; nadie más puede usar ni A-1 ni C-1
  await as(G, `update storage_contracts set away_since = now(), away_spot_id = '${c1}' where id = '${k1}'`)
  await assert.rejects(as(G, `update storage_contracts set spot_id = '${a1}' where id = '${k2}'`), /ocupado/)
  await assert.rejects(as(G, `update storage_contracts set away_since = now(), away_spot_id = '${c1}' where id = '${k2}'`), /ocupado/)
  // Vuelve: el muelle se libera solo
  await as(G, `update storage_contracts set away_since = null where id = '${k1}'`)
  assert.equal((await one(G, `select away_spot_id from storage_contracts where id = '${k1}'`)).away_spot_id, null)
  await as(G, `update storage_contracts set away_since = now(), away_spot_id = '${c1}' where id = '${k2}'`)

  // Fuera de servicio: no se le puede asignar un bote nuevo; terminar el contrato libera el espacio
  const a3 = await spot(patio, 'A-3')
  await as(G, `update storage_spots set status = 'out_of_service' where id = '${a3}'`)
  await assert.rejects(as(G, `update storage_contracts set spot_id = '${a3}' where id = '${k2}'`), /fuera de servicio/)
  await as(G, `update storage_contracts set status = 'ended' where id = '${k2}'`)
  assert.equal((await one(G, `select away_spot_id from storage_contracts where id = '${k2}'`)).away_spot_id, null)
  await as(G, `insert into storage_contracts (mechanic_id, boat_id, monthly_price, spot_id) values ('${G}', '${b2}', 200, '${a2}')`)

  assert.equal((await as(B, `select * from storage_zones`)).length, 0, 'otro negocio no ve las zonas')
  assert.equal((await as(B, `select * from storage_spots`)).length, 0)
})

test('guardería sencilla: precio por zona, la renta dice el mes y el espacio, y empieza con reglas de guardería', async () => {
  const G = (await sys(`select profile_id from mechanics where business_name = 'Marina del Este'`))[0].profile_id
  assert.ok(!(await one(G, `select policies_text from mechanics where profile_id = '${G}'`)).policies_text.startsWith('Garantía de mano de obra'), 'ya no tiene la garantía de mecánico')
  const z = (await one(G, `insert into storage_zones (mechanic_id, name, kind, price, per_foot) values ('${G}', 'Patio B', 'land', 12, true) returning price, per_foot`))
  assert.equal(Number(z.price), 12)
  assert.equal(z.per_foot, true)
  assert.equal((await one(G, `select storage_bill_month('2026-12-01') n`)).n >= 1, true)
  const line = (await one(G, `select p.description from storage_bills sb join work_order_parts p on p.work_order_id = sb.work_order_id where sb.month = '2026-12-01' and p.description like 'Renta%' limit 1`)).description
  assert.match(line, /^Renta de diciembre 2026 · .+ · \d+ pies$/)
  const N = (await db.query(`insert into auth.users(email) values ('nueva@guarderia.test') returning id`)).rows[0].id
  await as(N, `select set_my_role('mechanic','Nueva','787-555-0001','Salinas','Guardería Nueva')`)
  await as(N, `update mechanics set business_type = 'storage', business_type_set = true where profile_id = '${N}'`)
  assert.match((await one(N, `select policies_text from mechanics where profile_id = '${N}'`)).policies_text, /seguro vigente/)
})
