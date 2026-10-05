export type Role = 'mechanic' | 'client'

export interface Profile {
  id: string
  role: Role | null
  full_name: string | null
  phone: string | null
  email: string | null
  town: string | null
}
