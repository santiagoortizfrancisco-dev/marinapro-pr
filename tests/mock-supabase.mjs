// Supabase de PRUEBA para el bot (solo en tu computadora, puerto 54321).
// Guarda en memoria lo que el app escribe y contesta como Supabase, para probar las pantallas
// sin tocar los datos reales. /__reset lo deja como nuevo; /__state muestra lo que tiene.
import http from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.MOCK_PORT ?? 54321)
export const TEST_USER = 'jqr'
export const TEST_PASSWORD = 'prueba-del-bot'
const EMAIL = 'marinepropr+jqr@gmail.com'
const U = '11111111-1111-4111-8111-111111111111'
const NEW_EMAIL = 'nuevo@prueba.test'
const N = '22222222-2222-4222-8222-222222222222'

const prDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico' }).format(d)
const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

let db
let passwords = {}
let signups = {} // id -> { email, user_metadata }
function reset() {
  passwords = {}
  signups = {}
  const tomorrow = addDays(prDay(), 1)
  const now = new Date().toISOString()
  db = {
    profiles: [
      { id: U, role: 'mechanic', full_name: 'JQR Boat Repair', phone: '787-555-0100', email: EMAIL, town: 'Fajardo', access: 'approved', created_at: now },
      { id: N, role: null, full_name: null, phone: null, email: NEW_EMAIL, town: null, access: 'approved', created_at: now },
    ],
    mechanics: [{
      profile_id: U, business_name: 'JQR Boat Repair', ath_movil_number: '787-555-0100', labor_rate_hour: 85, ivu_rate: 0.115,
      ivu_on_labor: true, ivu_on_parts: true, warranty_days: 90, policies_text: 'Garantía de mano de obra: 90 días.', policies_version: 1,
      next_invoice_number: 1, logo_path: '/brands/jqr-boat-repair.jpg', brand_color: '#0b0b0f', created_at: now,
      listed: false, approved: false, slug: null, public_description: null, public_towns: [], public_services: [], public_brands: [], public_locations: [],
    }],
    settings: { directory_open: false },
    ads: [],
    clients: [{ id: 'c1', mechanic_id: U, profile_id: null, full_name: 'Ana Ejemplo', phone: '787-555-0111', email: null, town: 'Fajardo', address: null, preferred_contact: 'whatsapp', notes: null, created_at: now }],
    boats: [{
      id: 'b1', client_id: 'c1', name: 'La Tranquila', make: 'Grady-White', model: 'Freedom 255', year: 2018, length_ft: 25, hull_id: null,
      registration_number: 'PR-1234-AB', marbete_expires: null, hull_color: 'Blanco', location_type: 'water_slip', marina_name: 'Puerto del Rey',
      slip_number: 'C-42', town: 'Fajardo', lat: 18.2868, lng: -65.634, location_notes: 'Portón principal', notes: null, created_at: now,
    }],
    engines: [{ id: 'e1', boat_id: 'b1', position: 'port', make: 'Yamaha', model: 'F200', hp: 200, year: 2018, serial_number: '6AW-1', hours: 412.5, fuel: 'gas', drive_type: 'outboard', propeller: null, notes: null, created_at: now }],
    equipment: [{ id: 'q1', boat_id: 'b1', category: 'windlass', make: 'Lewmar', model: 'V700', serial_number: null, location_on_boat: 'Proa', installed_at: null, warranty_until: null, notes: null, created_at: now }],
    service_requests: [{ id: 'sr1', boat_id: 'b1', client_id: 'c1', description: 'El motor de babor no arranca en frío', urgency: 'normal', status: 'scheduled', media_paths: [], source: 'app', spam: false, created_at: now }],
    appointments: [{
      id: 'a1', mechanic_id: U, boat_id: 'b1', service_request_id: 'sr1', starts_at: new Date(`${tomorrow}T09:00:00-04:00`).toISOString(),
      duration_min: 180, status: 'confirmed', title: 'Diagnóstico motor', systems: ['engine'], notes: null, created_at: now,
    }],
    work_orders: [],
    work_order_parts: [],
    catalog_items: [
      { id: 'cat1', mechanic_id: null, kind: 'service', name: 'Cambio de impeller', category: 'Motor', last_price: null, use_count: 0 },
      { id: 'cat2', mechanic_id: null, kind: 'service', name: 'Servicio de 100 horas', category: 'Motor', last_price: null, use_count: 0 },
      { id: 'cat3', mechanic_id: null, kind: 'part', name: 'Impeller', category: 'Motor', last_price: null, use_count: 0 },
      { id: 'cat4', mechanic_id: null, kind: 'part', name: 'Filtro de aceite', category: 'Motor', last_price: null, use_count: 0 },
    ],
    support_messages: [],
    photos: [],
    invoices: [],
    maintenance_schedules: [],
    notifications: [],
  }
}
reset()

// ------------------------------------------------------------------------------------------
// Valores por defecto al crear (como en las migraciones)
const DEFAULTS = {
  clients: () => ({ profile_id: null, email: null, town: null, address: null, preferred_contact: 'whatsapp', notes: null }),
  boats: () => ({ make: null, model: null, year: null, length_ft: null, hull_id: null, registration_number: null, marbete_expires: null, hull_color: null, location_type: 'water_slip', marina_name: null, slip_number: null, town: null, lat: null, lng: null, location_notes: null, notes: null }),
  appointments: () => ({ duration_min: 60, status: 'requested', title: null, systems: [], notes: null, service_request_id: null }),
  service_requests: () => ({ urgency: 'normal', status: 'new', media_paths: [], source: 'app', spam: false, contact_name: null, contact_phone: null, preferred_when: null, boat_location: null }),
  ads: () => ({ link_url: null, active: true, clicks: 0, views: 0 }),
  work_orders: () => ({
    appointment_id: null, public_token: randomUUID(), complaint: null, diagnosis: null, work_done: null, status: 'estimate', labor_hours: 0, labor_rate: 0,
    charge_ivu_labor: true, charge_ivu_parts: true, estimate_sent_at: null, estimate_approved_at: null, estimate_approved_by: null, approval_seen_at: null,
    policies_accepted_version: null, sea_trial_required: true, sea_trial_done: false, sea_trial_method: null, sea_trial_notes: null, completed_at: null,
  }),
  maintenance_schedules: () => ({ engine_id: null, due_hours: null, last_notified_at: null, status: 'pending', interval_months: null, work_order_id: null, notes: null }),
  service_packages: () => ({ items: [], use_count: 0 }),
  work_order_parts: () => ({ kind: 'part', part_number: null, qty: 1, unit_cost: 0, supplied_by: 'mechanic', supplier: null, eta: null, received_at: null }),
}

// Relaciones que el app pide con select(... tabla(...))
function withRelations(table, row) {
  const r = { ...row }
  const boat = (id) => {
    const b = db.boats.find((x) => x.id === id)
    return b && { ...b, clients: db.clients.find((c) => c.id === b.client_id) ?? null }
  }
  if (table === 'clients') r.boats = db.boats.filter((b) => b.client_id === row.id)
  if (table === 'service_requests') r.boats = db.boats.find((b) => b.id === row.boat_id) ?? null
  if (table === 'boats') r.clients = db.clients.find((c) => c.id === row.client_id) ?? null
  if (table === 'appointments') {
    r.boats = boat(row.boat_id)
    r.service_requests = db.service_requests.find((s) => s.id === row.service_request_id) ?? null
  }
  if (table === 'maintenance_schedules') r.boats = boat(row.boat_id)
  if (table === 'work_orders') {
    r.work_order_parts = db.work_order_parts.filter((p) => p.work_order_id === row.id)
    r.boats = boat(row.boat_id)
    r.invoices = db.invoices.filter((i) => i.work_order_id === row.id)
  }
  return r
}

// Filtros de PostgREST que usa el app: eq, neq, is, in, not.in, gte, lt
function matches(row, params) {
  for (const [col, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(col)) continue
    const v = row[col]
    const [op, ...rest] = raw.split('.')
    const arg = rest.join('.')
    const list = () => arg.replace(/^\(|\)$/g, '').split(',')
    if (op === 'eq' && String(v) !== arg) return false
    if (op === 'neq' && String(v) === arg) return false
    if (op === 'is' && !(arg === 'null' ? v == null : String(v) === arg)) return false
    if (op === 'in' && !list().includes(String(v))) return false
    if (op === 'not' && rest[0] === 'in' && rest.slice(1).join('.').replace(/^\(|\)$/g, '').split(',').includes(String(v))) return false
    if (op === 'not' && rest[0] === 'is' && rest[1] === 'null' && v == null) return false
    if (op === 'ilike' && String(v ?? '').toLowerCase() !== arg.replace(/%/g, '').toLowerCase()) return false
    if (op === 'lte' && !(v != null && String(v) <= arg)) return false
    if (op === 'gte' && !(String(v) >= arg)) return false
    if (op === 'lt' && !(String(v) < arg)) return false
  }
  return true
}

// ------------------------------------------------------------------------------------------
const r2 = (n) => Math.round(n * 100) / 100
function totals(wo) {
  const m = db.mechanics[0]
  const mine = db.work_order_parts.filter((p) => p.work_order_id === wo.id)
  const services = mine.filter((p) => p.kind === 'service').reduce((s, p) => s + Number(p.qty) * Number(p.unit_cost), 0)
  const labor = r2(Number(wo.labor_hours) * Number(wo.labor_rate) + services)
  const parts = r2(mine.filter((p) => p.kind !== 'service' && p.supplied_by === 'mechanic').reduce((s, p) => s + Number(p.qty) * Number(p.unit_cost), 0))
  const ivu = r2(((wo.charge_ivu_labor ? labor : 0) + (wo.charge_ivu_parts ? parts : 0)) * m.ivu_rate)
  return { labor, parts, ivu, total: r2(labor + parts + ivu), ivu_rate: m.ivu_rate }
}

function publicDoc(token) {
  const inv = db.invoices.find((i) => i.public_token === token)
  const wo = inv ? db.work_orders.find((w) => w.id === inv.work_order_id) : db.work_orders.find((w) => w.public_token === token)
  if (!wo) return null
  const t = totals(wo)
  const boat = db.boats.find((b) => b.id === wo.boat_id)
  const client = db.clients.find((c) => c.id === boat.client_id)
  const m = db.mechanics[0]
  const p = db.profiles[0]
  return {
    kind: inv ? 'invoice' : 'estimate', number: inv?.number ?? null, date: inv?.created_at ?? new Date().toISOString(), paid_at: inv?.paid_at ?? null, payment_method: inv?.payment_method ?? null,
    business: { name: m.business_name, owner: p.full_name, phone: p.phone, email: null, town: p.town, ath_movil: m.ath_movil_number, logo_path: m.logo_path, brand_color: m.brand_color },
    client: { name: client.full_name },
    boat: { name: boat.name, make: boat.make, model: boat.model, year: boat.year, marina: boat.marina_name, slip: boat.slip_number, town: boat.town },
    work: { complaint: wo.complaint, diagnosis: wo.diagnosis, work_done: wo.work_done, status: wo.status, approved_at: wo.estimate_approved_at, sea_trial_required: wo.sea_trial_required, sea_trial_done: wo.sea_trial_done, sea_trial_method: wo.sea_trial_method, sea_trial_notes: wo.sea_trial_notes },
    parts: db.work_order_parts.filter((x) => x.work_order_id === wo.id),
    totals: inv
      ? { labor_hours: inv.labor_hours, labor_rate: inv.labor_rate, labor: inv.labor_subtotal, parts: inv.parts_subtotal, ivu: inv.ivu_amount, ivu_rate: inv.ivu_rate, ivu_on_labor: inv.ivu_on_labor, ivu_on_parts: inv.ivu_on_parts, total: inv.total }
      : { labor_hours: wo.labor_hours, labor_rate: wo.labor_rate, ...t, ivu_on_labor: wo.charge_ivu_labor, ivu_on_parts: wo.charge_ivu_parts },
    warranty_days: m.warranty_days, policies: m.policies_text,
  }
}

let caller = U
const adminOnly = () => { if (caller !== U) throw Object.assign(new Error('Solo para el administrador'), { status: 400 }) }
function publicCard(m) {
  const p = db.profiles.find((x) => x.id === m.profile_id)
  return { slug: m.slug, name: m.business_name ?? p.full_name, owner: p.full_name, town: p.town, phone: p.phone, logo_path: m.logo_path, brand_color: m.brand_color,
    description: m.public_description, towns: m.public_towns, services: m.public_services, brands: m.public_brands, locations: m.public_locations }
}
const count = (list, fn) => list.filter(fn).length
const RPC = {
  // En el Supabase de prueba, el admin es el usuario jqr (U); el mecánico nuevo (N) no
  is_app_admin: () => caller === U,
  admin_overview: () => {
    if (caller !== U) throw Object.assign(new Error('Solo para el administrador'), { status: 400 })
    return db.profiles.map((p) => {
      const m = db.mechanics.find((x) => x.profile_id === p.id)
      const myClients = db.clients.filter((c) => c.mechanic_id === p.id).map((c) => c.id)
      const myBoats = db.boats.filter((b) => myClients.includes(b.client_id)).map((b) => b.id)
      return {
        id: p.id, email: p.email, full_name: p.full_name, business_name: m?.business_name ?? null, created_at: p.created_at,
        last_sign_in_at: p.id === U ? new Date().toISOString() : null,
        clients: myClients.length, boats: myBoats.length,
        appointments: count(db.appointments, (a) => a.mechanic_id === p.id),
        work_orders: count(db.work_orders, (w) => myBoats.includes(w.boat_id)),
        invoices: count(db.invoices, (i) => i.mechanic_id === p.id),
        paid_total: db.invoices.filter((i) => i.mechanic_id === p.id && i.paid_at).reduce((t, i) => t + Number(i.total), 0),
        last_activity: myClients.length ? new Date().toISOString() : null,
      }
    })
  },
  set_my_role: ({ p_role, p_full_name, p_phone, p_town, p_business_name }) => {
    const p = db.profiles.find((x) => x.id === caller)
    if (p.role) throw Object.assign(new Error('El rol ya fue escogido'), { status: 400 })
    Object.assign(p, { role: p_role, full_name: p_full_name, phone: p_phone, town: p_town })
    db.mechanics.push({ ...db.mechanics[0], profile_id: caller, business_name: p_business_name ?? p_full_name, ath_movil_number: null, labor_rate_hour: 0, logo_path: null, brand_color: '#0b3b5c', next_invoice_number: 1 })
    return null
  },
  get_public_document: ({ p_token }) => publicDoc(p_token),

  // --- Directorio (como 0009_directorio.sql)
  directory_is_open: () => db.settings.directory_open,
  admin_set_directory_open: ({ p_open }) => { adminOnly(); db.settings.directory_open = p_open; return null },
  admin_set_approved: ({ p_mechanic, p_approved }) => { adminOnly(); const m = db.mechanics.find((x) => x.profile_id === p_mechanic); if (m) m.approved = p_approved; return null },
  admin_directory_list: () => {
    adminOnly()
    return db.mechanics.filter((m) => m.listed || m.approved).map((m) => {
      const p = db.profiles.find((x) => x.id === m.profile_id)
      return { id: m.profile_id, name: m.business_name ?? p.full_name, email: p.email, slug: m.slug, listed: m.listed, approved: m.approved, towns: m.public_towns, services: m.public_services }
    })
  },
  directory_search: ({ p_town, p_service, p_brand }) => {
    if (!db.settings.directory_open && caller !== U) return []
    return db.mechanics.filter((m) => m.listed && m.approved && m.slug
      && (!p_town || m.public_towns.includes(p_town)) && (!p_service || m.public_services.includes(p_service)) && (!p_brand || m.public_brands.includes(p_brand))).map(publicCard)
  },
  directory_profile: ({ p_slug }) => {
    const m = db.mechanics.find((x) => (x.slug ?? '').toLowerCase() === String(p_slug).toLowerCase())
    if (!m) return null
    return (db.settings.directory_open && m.listed && m.approved) || caller === m.profile_id || caller === U ? publicCard(m) : null
  },
  submit_directory_request: (a) => {
    if (a.p_website) return { ok: true }
    const phone = String(a.p_phone ?? '').replace(/D/g, '')
    if (String(a.p_name ?? '').trim().length < 2 || phone.length < 7 || String(a.p_problem ?? '').trim().length < 3) throw Object.assign(new Error('Faltan datos'), { status: 400 })
    const m = db.mechanics.find((x) => (x.slug ?? '').toLowerCase() === String(a.p_slug).toLowerCase() && ((x.listed && x.approved && db.settings.directory_open) || caller === U || caller === x.profile_id))
    if (!m) throw Object.assign(new Error('Ese mecánico no está disponible'), { status: 400 })
    const digits = (v) => String(v ?? '').replace(/D/g, '')
    let c = db.clients.find((x) => x.mechanic_id === m.profile_id && digits(x.phone) === phone)
    if (!c) { c = { ...DEFAULTS.clients(), id: randomUUID(), mechanic_id: m.profile_id, full_name: a.p_name.trim(), phone: a.p_phone.trim(), notes: 'Llegó por el directorio', created_at: new Date().toISOString() }; db.clients.push(c) }
    let b = db.boats.find((x) => x.client_id === c.id && x.name.toLowerCase() === String(a.p_boat ?? '').trim().toLowerCase())
    if (!b) { b = { ...DEFAULTS.boats(), id: randomUUID(), client_id: c.id, name: String(a.p_boat ?? '').trim() || 'Bote', make: a.p_boat_make || null, location_notes: a.p_location || null, created_at: new Date().toISOString() }; db.boats.push(b) }
    db.service_requests.push({ ...DEFAULTS.service_requests(), id: randomUUID(), boat_id: b.id, client_id: c.id, description: a.p_problem.trim(), status: 'new', source: 'directory', contact_name: a.p_name.trim(), contact_phone: a.p_phone.trim(), preferred_when: a.p_when, boat_location: a.p_location || null, created_at: new Date().toISOString() })
    return { ok: true }
  },
  send_support_message: ({ p_message, p_contact, p_version, p_page }) => {
    if (String(p_message ?? '').trim().length < 3) throw Object.assign(new Error('Escribe tu mensaje'), { status: 400 })
    if (caller === 'anon' && String(p_contact ?? '').trim().length < 5) throw Object.assign(new Error('Escribe tu email o teléfono'), { status: 400 })
    const prof = db.profiles.find((x) => x.id === caller)
    const mech = db.mechanics.find((x) => x.profile_id === caller)
    db.support_messages.push({ id: randomUUID(), user_id: prof?.id ?? null, name: prof?.full_name ?? null, business: mech?.business_name ?? null, email: prof?.email ?? null, phone: prof?.phone ?? null,
      contact: p_contact || null, message: String(p_message).trim(), app_version: p_version, page: p_page, created_at: new Date().toISOString(), read_at: null })
    return { ok: true }
  },
  admin_pending_accounts: () => {
    adminOnly()
    return db.profiles.filter((x) => x.access === 'pending' || x.access === 'rejected').map((x) => ({
      id: x.id, full_name: x.full_name, business_name: db.mechanics.find((m) => m.profile_id === x.id)?.business_name ?? null,
      email: x.email, phone: x.phone, town: x.town, access: x.access, created_at: x.created_at,
    }))
  },
  admin_set_access: ({ p_user, p_access }) => { adminOnly(); const x = db.profiles.find((y) => y.id === p_user); if (x) x.access = p_access; return null },
  admin_pending_count: () => (caller === U ? db.profiles.filter((x) => x.access === 'pending').length : 0),
  admin_unread_messages: () => (caller === U ? db.support_messages.filter((m) => !m.read_at).length : 0),
  ads_active: () => (db.settings.directory_open || caller === U ? db.ads.filter((x) => x.active).map(({ id, advertiser, image_path, link_url }) => ({ id, advertiser, image_path, link_url })) : []),
  ad_click: ({ p_id }) => { const ad = db.ads.find((x) => x.id === p_id); if (ad) ad.clicks++; return null },
  approve_estimate: ({ p_token }) => {
    const wo = db.work_orders.find((w) => w.public_token === p_token)
    if (!wo) throw Object.assign(new Error('No existe ese estimado'), { status: 400 })
    if (!wo.estimate_approved_at && !db.invoices.some((i) => i.work_order_id === wo.id)) {
      Object.assign(wo, { estimate_approved_at: new Date().toISOString(), estimate_approved_by: 'client', approval_seen_at: null, policies_accepted_version: 1, status: wo.status === 'estimate' ? 'approved' : wo.status })
    }
    return { approved_at: wo.estimate_approved_at, approved_by: wo.estimate_approved_by }
  },
  remember_catalog_item: ({ p_kind, p_name, p_price }) => {
    const name = String(p_name).trim()
    const found = db.catalog_items.find((c) => c.mechanic_id === caller && c.kind === p_kind && c.name.toLowerCase() === name.toLowerCase())
    if (found) Object.assign(found, { last_price: p_price ?? found.last_price, use_count: found.use_count + 1 })
    else db.catalog_items.push({ id: randomUUID(), mechanic_id: caller, kind: p_kind, name, category: null, last_price: p_price ?? null, use_count: 1 })
    return null
  },
  create_invoice: ({ p_wo }) => {
    const wo = db.work_orders.find((w) => w.id === p_wo)
    if (!wo) throw Object.assign(new Error('No autorizado'), { status: 400 })
    const t = totals(wo)
    const fields = { labor_subtotal: t.labor, parts_subtotal: t.parts, ivu_amount: t.ivu, total: t.total, ivu_rate: t.ivu_rate, labor_hours: wo.labor_hours, labor_rate: wo.labor_rate, ivu_on_labor: wo.charge_ivu_labor, ivu_on_parts: wo.charge_ivu_parts }
    const existing = db.invoices.find((i) => i.work_order_id === wo.id)
    if (existing) return Object.assign(existing, fields).id
    const m = db.mechanics[0]
    const inv = { id: randomUUID(), work_order_id: wo.id, mechanic_id: U, number: String(m.next_invoice_number).padStart(4, '0'), public_token: randomUUID(), sent_at: null, paid_at: null, payment_method: null, created_at: new Date().toISOString(), ...fields }
    m.next_invoice_number++
    db.invoices.push(inv)
    if (wo.status !== 'paid') wo.status = 'invoiced'
    return inv.id
  },
}

// ------------------------------------------------------------------------------------------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const userFor = (id) => (signups[id] ? { ...USER, id, ...signups[id] } : { ...USER, id, email: id === N ? NEW_EMAIL : EMAIL })
const USER = { id: U, email: EMAIL, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() }
function session(id = U) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  return { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, exp, role: 'authenticated', aud: 'authenticated' })}.x`, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `r-${id}`, user: userFor(id) }
}

http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    return res.end()
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const url = new URL(req.url, 'http://x')
    const send = (code, obj) => {
      res.writeHead(code, { ...cors, 'Content-Type': 'application/json' })
      res.end(obj === undefined ? '' : JSON.stringify(obj))
    }
    const json = () => (body ? JSON.parse(body) : {})
    const wantsOne = (req.headers.accept ?? '').includes('vnd.pgrst.object')
    try {
      const payload = (req.headers.authorization ?? '').split('.')[1]
      const sub = payload ? JSON.parse(Buffer.from(payload, 'base64url').toString()).sub : null
      caller = sub === N || sub === U || signups[sub] ? sub : 'anon' // sin sesión = visitante del directorio
    } catch {
      caller = 'anon'
    }
    try {
      // --- ayuda para el bot
      if (url.pathname === '/__reset') { reset(); return send(200, { ok: true }) }
      if (url.pathname === '/__state') return send(200, db)

      // --- entrar
      if (url.pathname === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') === 'password') {
          const { email, password } = json()
          if (email === NEW_EMAIL && password === (passwords[N] ?? TEST_PASSWORD)) return send(200, session(N))
          const su = Object.entries(signups).find(([, u]) => u.email === String(email).toLowerCase())
          if (su && passwords[su[0]] === password) return send(200, session(su[0]))
          return email === EMAIL && password === (passwords[U] ?? TEST_PASSWORD) ? send(200, session()) : send(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
        }
        const rt = String(json().refresh_token ?? '').slice(2)
        return send(200, session(rt === N || signups[rt] ? rt : U))
      }
      if (url.pathname === '/auth/v1/signup') {
        const { email, password, data } = json()
        const e = String(email).toLowerCase()
        if (e === EMAIL || e === NEW_EMAIL || Object.values(signups).some((u) => u.email === e)) return send(422, { code: 'user_already_exists', error_code: 'user_already_exists', msg: 'User already registered' })
        const id = randomUUID()
        signups[id] = { email: e, user_metadata: data ?? {} }
        passwords[id] = password
        db.profiles.push({ id, role: null, full_name: null, phone: null, email: e, town: null, access: 'pending', created_at: new Date().toISOString() })
        return send(200, session(id))
      }
      if (url.pathname === '/auth/v1/user') {
        if (req.method === 'PUT' && json().password) passwords[caller] = json().password
        return send(200, userFor(caller))
      }
      if (url.pathname.startsWith('/auth/v1/')) return send(200, {})

      // --- funciones
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const fn = RPC[url.pathname.slice('/rest/v1/rpc/'.length)]
        return fn ? send(200, fn(json())) : send(404, { message: 'no existe' })
      }

      // --- tablas
      const table = url.pathname.replace('/rest/v1/', '')
      const rows = Array.isArray(db[table]) ? db[table] : null
      if (!rows) return send(404, { message: `tabla ${table}` })
      const params = [...url.searchParams.entries()]
      const found = rows.filter((r) => matches(r, params))
      const out = (list) => {
        const shaped = list.map((r) => withRelations(table, r))
        if (wantsOne) return shaped.length === 1 ? send(200, shaped[0]) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
        return send(200, shaped)
      }

      if (req.method === 'GET') {
        let list = found
        const order = url.searchParams.get('order')
        if (order) {
          const [col, dir] = order.split('.')
          list = [...list].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (dir === 'desc' ? -1 : 1))
        }
        const limit = url.searchParams.get('limit')
        return out(limit ? list.slice(0, Number(limit)) : list)
      }
      if (req.method === 'POST') {
        const items = [].concat(json()).map((item) => ({ ...(DEFAULTS[table]?.() ?? {}), id: randomUUID(), created_at: new Date().toISOString(), ...item }))
        rows.push(...items)
        return out(items)
      }
      if (req.method === 'PATCH') {
        const patch = json()
        found.forEach((r) => Object.assign(r, patch))
        return out(found)
      }
      if (req.method === 'DELETE') {
        db[table] = rows.filter((r) => !found.includes(r))
        return out(found)
      }
      send(405, {})
    } catch (e) {
      send(e.status ?? 500, { message: e.message })
    }
  })
}).listen(PORT, () => console.log(`Supabase de prueba en http://localhost:${PORT}`))

