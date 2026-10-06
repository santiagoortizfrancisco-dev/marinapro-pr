export type Role = 'mechanic' | 'client'

export interface Profile {
  id: string
  role: Role | null
  full_name: string | null
  phone: string | null
  email: string | null
  town: string | null
}

export interface Client {
  id: string
  mechanic_id: string
  full_name: string
  phone: string | null
  email: string | null
  town: string | null
  address: string | null
  preferred_contact: 'whatsapp' | 'call' | 'email'
  notes: string | null
}

export interface Boat {
  id: string
  client_id: string
  name: string
  make: string | null
  model: string | null
  year: number | null
  length_ft: number | null
  hull_id: string | null
  registration_number: string | null
  marbete_expires: string | null
  hull_color: string | null
  location_type: 'water_slip' | 'dry_storage' | 'home' | 'trailer'
  marina_name: string | null
  slip_number: string | null
  town: string | null
  lat: number | null
  lng: number | null
  location_notes: string | null
  notes: string | null
}

export interface Engine {
  id: string
  boat_id: string
  position: 'port' | 'starboard' | 'center' | 'single'
  make: string | null
  model: string | null
  hp: number | null
  year: number | null
  serial_number: string | null
  hours: number | null
  fuel: 'gas' | 'diesel'
  drive_type: 'outboard' | 'inboard' | 'sterndrive' | 'jet' | 'pod' | null
  propeller: string | null
  notes: string | null
}

export interface Equipment {
  id: string
  boat_id: string
  category: string
  make: string | null
  model: string | null
  serial_number: string | null
  location_on_boat: string | null
  installed_at: string | null
  warranty_until: string | null
  notes: string | null
}

export interface Appointment {
  id: string
  mechanic_id: string
  boat_id: string
  starts_at: string
  duration_min: number
  status: 'requested' | 'confirmed' | 'done' | 'cancelled'
  title: string | null
  systems: string[]
  notes: string | null
}

/** Cita con su bote y cliente (para la agenda). */
export interface AppointmentFull extends Appointment {
  /** Problema que reportó el cliente */
  service_requests: { description: string } | null
  boats: Pick<Boat, 'id' | 'name' | 'location_type' | 'marina_name' | 'slip_number' | 'town' | 'lat' | 'lng' | 'location_notes'> & {
    clients: Pick<Client, 'id' | 'full_name' | 'phone'>
  }
}

export interface Mechanic {
  profile_id: string
  business_name: string | null
  ath_movil_number: string | null
  labor_rate_hour: number
  ivu_rate: number
  ivu_on_labor: boolean
  ivu_on_parts: boolean
  warranty_days: number
  policies_text: string
  policies_version: number
  next_invoice_number: number
  logo_path: string | null
  brand_color: string
  // Directorio público
  listed?: boolean
  approved?: boolean
  slug?: string | null
  public_description?: string | null
  public_towns?: string[]
  public_services?: string[]
  public_brands?: string[]
  public_locations?: string[]
}

export type WorkOrderStatus = 'estimate' | 'approved' | 'waiting_parts' | 'in_progress' | 'sea_trial' | 'done' | 'invoiced' | 'paid'

export interface WorkOrder {
  id: string
  boat_id: string
  appointment_id: string | null
  public_token: string
  complaint: string | null
  diagnosis: string | null
  work_done: string | null
  status: WorkOrderStatus
  labor_hours: number
  labor_rate: number
  charge_ivu_labor: boolean
  charge_ivu_parts: boolean
  estimate_sent_at: string | null
  estimate_approved_at: string | null
  /** Quién aprobó: el cliente desde el link, o el mecánico a mano */
  estimate_approved_by: 'client' | 'mechanic' | null
  /** Cuándo el mecánico vio el aviso de que el cliente aprobó */
  approval_seen_at: string | null
  policies_accepted_version: number | null
  sea_trial_required: boolean
  sea_trial_done: boolean
  sea_trial_method: 'water' | 'hose_muffs' | 'not_allowed' | null
  sea_trial_notes: string | null
  completed_at: string | null
  created_at: string
}

export interface Part {
  id: string
  work_order_id: string
  /** pieza o servicio (precio fijo; cuenta como mano de obra) */
  kind: 'part' | 'service'
  description: string
  part_number: string | null
  qty: number
  unit_cost: number
  supplied_by: 'client' | 'mechanic'
  supplier: string | null
  eta: string | null
  received_at: string | null
}

export interface Photo {
  id: string
  work_order_id: string
  kind: 'before' | 'old_part' | 'new_part' | 'after'
  storage_path: string
  caption: string | null
  taken_at: string
}

export interface Invoice {
  id: string
  work_order_id: string
  number: string
  public_token: string
  labor_subtotal: number
  parts_subtotal: number
  ivu_amount: number
  total: number
  paid_at: string | null
  payment_method: 'ath_movil' | 'cash' | 'check' | 'other' | null
  sent_at: string | null
  created_at: string
}
