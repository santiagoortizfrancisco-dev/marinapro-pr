/** PINs que cualquiera adivina (111111, 123456, 654321…). */
export function weakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true
  return '0123456789012345'.includes(pin) || '9876543210987654'.includes(pin)
}

/** Deja solo números y máximo 6 (para el campo del PIN). */
export const onlyPin = (v: string) => v.replace(/\D/g, '').slice(0, 6)
