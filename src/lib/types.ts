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
  boats: Pick<Boat, 'id' | 'name' | 'location_type' | 'marina_name' | 'slip_number' | 'town' | 'lat' | 'lng' | 'location_notes'> & {
    clients: Pick<Client, 'id' | 'full_name' | 'phone'>
  }
}
