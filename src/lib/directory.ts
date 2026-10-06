/** Directorio público de mecánicos: lo que se ve en público de cada uno. */
export interface PublicMechanic {
  slug: string
  name: string
  owner: string | null
  town: string | null
  phone: string | null
  logo_path: string | null
  brand_color: string | null
  description: string | null
  towns: string[]
  services: string[]
  brands: string[]
  locations: string[]
}

/** "JQR Boat Repair" -> "jqr-boat-repair" (la dirección de su perfil). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Marcas que más se buscan (las primeras salen arriba en el buscador). */
export const DIRECTORY_BRANDS = ['Yamaha', 'Mercury', 'Suzuki', 'Honda', 'Evinrude', 'Tohatsu', 'Volvo Penta', 'MerCruiser', 'Yanmar', 'Cummins', 'Caterpillar', 'Rotax (Sea-Doo)', 'Kawasaki']

/** Qué días le convienen al dueño del bote. */
export const WHEN_OPTIONS = [
  { value: 'Esta semana', label: 'Esta semana' },
  { value: 'La próxima semana', label: 'La próxima' },
  { value: 'Cuando pueda', label: 'Cuando pueda' },
] as const
