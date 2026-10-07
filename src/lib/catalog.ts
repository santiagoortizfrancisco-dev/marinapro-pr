/** Listas fijas de la app (etiquetas en español, códigos en inglés como en la base de datos). */

export type LocationType = 'water_slip' | 'dry_storage' | 'home' | 'trailer'
export const LOCATION_TYPES: { value: LocationType; label: string; hint: string }[] = [
  { value: 'water_slip', label: 'En el agua', hint: 'Marina y número de muelle' },
  { value: 'dry_storage', label: 'Guardería', hint: 'Marina y rack' },
  { value: 'home', label: 'En la casa', hint: 'Dirección' },
  { value: 'trailer', label: 'En trailer', hint: 'Dónde está el trailer' },
]

export const ENGINE_POSITIONS = [
  { value: 'single', label: 'Uno solo' },
  { value: 'port', label: 'Babor' },
  { value: 'starboard', label: 'Estribor' },
  { value: 'center', label: 'Centro' },
] as const

export const DRIVE_TYPES = [
  { value: 'outboard', label: 'Fuera de borda' },
  { value: 'inboard', label: 'Interno (inboard)' },
  { value: 'sterndrive', label: 'Pata (sterndrive)' },
  { value: 'jet', label: 'Jet' },
  { value: 'pod', label: 'Pod (IPS/Zeus)' },
] as const

export const FUELS = [
  { value: 'gas', label: 'Gasolina' },
  { value: 'diesel', label: 'Diesel' },
] as const

/** Todo lo que lleva un bote aparte del motor principal. */
export const EQUIPMENT_CATEGORIES = [
  { value: 'gps', label: 'GPS / Chartplotter' },
  { value: 'radar', label: 'Radar' },
  { value: 'sonar', label: 'Sonda / Fishfinder' },
  { value: 'vhf', label: 'Radio VHF' },
  { value: 'autopilot', label: 'Piloto automático' },
  { value: 'windlass', label: 'Windlass / Molinete' },
  { value: 'generator', label: 'Generador' },
  { value: 'batteries', label: 'Baterías' },
  { value: 'charger', label: 'Cargador / Inversor' },
  { value: 'bilge_pump', label: 'Bomba de achique' },
  { value: 'ac', label: 'Aire acondicionado' },
  { value: 'steering', label: 'Dirección (steering)' },
  { value: 'trim', label: 'Trim / Trim tabs' },
  { value: 'thruster', label: 'Bow thruster' },
  { value: 'watermaker', label: 'Desalinizadora' },
  { value: 'head', label: 'Inodoro marino' },
  { value: 'water_system', label: 'Agua / Calentador' },
  { value: 'lights', label: 'Luces' },
  { value: 'audio', label: 'Estéreo / Sonido' },
  { value: 'fuel_system', label: 'Tanques / Combustible' },
  { value: 'other', label: 'Otro' },
] as const
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number]['value']

/** Áreas de trabajo para una cita. */
export const WORK_AREAS = [
  { value: 'engine', label: 'Motores' },
  { value: 'electronics', label: 'Electrónica (GPS, radar, radio)' },
  { value: 'electrical', label: 'Electricidad y baterías' },
  { value: 'windlass', label: 'Windlass' },
  { value: 'generator', label: 'Generador' },
  { value: 'ac', label: 'Aire acondicionado' },
  { value: 'plumbing', label: 'Plomería y bombas' },
  { value: 'steering', label: 'Dirección y trim' },
  { value: 'hull', label: 'Casco y fibra' },
  { value: 'other', label: 'Otro' },
] as const

export const APPOINTMENT_STATUS = {
  requested: { label: 'Por confirmar', style: 'bg-amber-100 text-amber-900' },
  confirmed: { label: 'Confirmada', style: 'bg-emerald-100 text-emerald-900' },
  done: { label: 'Hecha', style: 'bg-slate-200 text-slate-800' },
  cancelled: { label: 'Cancelada', style: 'bg-red-100 text-red-800' },
} as const

export const DURATIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1½ horas' },
  { value: 120, label: '2 horas' },
  { value: 180, label: '3 horas' },
  { value: 240, label: '4 horas' },
  { value: 480, label: 'Todo el día' },
]

export const CONTACT_PREFS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'call', label: 'Llamada' },
  { value: 'email', label: 'Email' },
] as const

// Sugerencias para escribir rápido (se puede escribir cualquier otra cosa)
export const PR_MARINAS = [
  'Puerto del Rey', 'Villa Marina', 'Marina Puerto Chico', 'Club Náutico de San Juan', 'San Juan Bay Marina',
  'Cangrejos Yacht Club', 'Palmas del Mar', 'Marina de Salinas', 'Ponce Yacht & Fishing Club',
  'Club Náutico de Ponce', 'Marina Puerto Real', 'Club Náutico de Boquerón', 'Club Náutico de Arecibo',
]

export const BOAT_MAKES = [
  'Boston Whaler', 'Grady-White', 'Contender', 'Yellowfin', 'Robalo', 'Sea Ray', 'Regal', 'Intrepid', 'Everglades',
  'Mako', 'Key West', 'Sea Hunt', 'Scout', 'Pursuit', 'Bertram', 'Hatteras', 'Sea Fox', 'Wellcraft', 'Fountain',
  'Cigarette', 'Sportsman', 'Pathfinder', 'Bayliner', 'Chaparral', 'Formula', 'Cobia', 'Hydra-Sports', 'SeaVee',
  'Pro-Line', 'Parker', 'Carolina Skiff', 'Tidewater', 'Sailfish', 'Edgewater', 'Jupiter', 'Invincible', 'Midnight Express',
  'Cobalt', 'Four Winns', 'Glastron', 'Crownline', 'Monterey', 'Larson', 'Hurricane', 'Bennington', 'Nautique', 'MasterCraft',
  'Viking', 'Cabo', 'Azimut', 'Sunseeker', 'Sea-Doo', 'Yamaha (bote jet)', 'Beneteau', 'Jeanneau', 'Lagoon', 'Leopard',
]

export const ENGINE_MAKES = [
  'Yamaha', 'Mercury', 'Suzuki', 'Honda', 'Evinrude', 'Tohatsu', 'Volvo Penta', 'MerCruiser', 'Yanmar', 'Cummins',
  'Caterpillar', 'MAN', 'Detroit Diesel', 'Rotax (Sea-Doo)', 'Kawasaki', 'Indmar', 'PCM', 'Crusader', 'Ilmor', 'Westerbeke',
  'Perkins', 'John Deere', 'Volvo Penta IPS', 'Seven Marine',
]

export const EQUIPMENT_MAKES = [
  'Garmin', 'Raymarine', 'Simrad', 'Lowrance', 'Furuno', 'Humminbird', 'Icom', 'Standard Horizon', 'Lewmar', 'Quick',
  'Maxwell', 'Kohler', 'Onan', 'Westerbeke', 'Fischer Panda', 'Dometic', 'Marine Air', 'Victron', 'ProMariner',
  'Rule', 'Johnson Pump', 'Jabsco', 'SeaStar', 'Lenco', 'Bennett', 'Side-Power', 'Fusion', 'JL Audio', 'Optima',
]

export function labelOf<T extends { value: string | number; label: string }>(list: readonly T[], value: unknown): string {
  return list.find((x) => x.value === value)?.label ?? String(value ?? '')
}

export const WORK_ORDER_STATUS = {
  estimate: { label: 'Estimado', style: 'bg-amber-100 text-amber-900' },
  approved: { label: 'Aprobado', style: 'bg-sky-100 text-sky-900' },
  waiting_parts: { label: 'Esperando piezas', style: 'bg-orange-100 text-orange-900' },
  in_progress: { label: 'Trabajando', style: 'bg-blue-100 text-blue-900' },
  sea_trial: { label: 'Prueba en el agua', style: 'bg-cyan-100 text-cyan-900' },
  done: { label: 'Terminado', style: 'bg-emerald-100 text-emerald-900' },
  invoiced: { label: 'Facturado', style: 'bg-violet-100 text-violet-900' },
  paid: { label: 'Pagado', style: 'bg-slate-200 text-slate-800' },
} as const

/** Estados que el mecánico escoge a mano (Facturado y Pagado los pone la factura). */
export const WORK_STEPS = (['estimate', 'approved', 'waiting_parts', 'in_progress', 'sea_trial', 'done'] as const).map((value) => ({
  value,
  label: WORK_ORDER_STATUS[value].label,
}))

export const SEA_TRIAL_METHODS = [
  { value: 'water', label: 'En el agua' },
  { value: 'hose_muffs', label: 'Con orejeras (hose muffs)' },
  { value: 'not_allowed', label: 'El cliente no la permitió' },
] as const

export const PHOTO_KINDS = [
  { value: 'before', label: 'Antes' },
  { value: 'old_part', label: 'Pieza vieja' },
  { value: 'new_part', label: 'Pieza nueva' },
  { value: 'after', label: 'Después' },
] as const

export const PAYMENT_METHODS = [
  { value: 'ath_movil', label: 'ATH Móvil' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'check', label: 'Cheque' },
  { value: 'other', label: 'Tarjeta u otro' },
] as const
