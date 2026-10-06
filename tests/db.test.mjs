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
  for (const f of ['0003_mecanico_completo.sql', '0004_trabajos_factura.sql', '0005_aprobar_estimado.sql']) await db.exec(sql(`migrations/${f}`))
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
