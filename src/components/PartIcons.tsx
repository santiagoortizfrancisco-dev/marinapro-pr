/** Íconos de piezas de motor dibujados a mano (líneas + relleno suave, en currentColor). */

interface P { size?: number; className?: string; strokeWidth?: number }

/** Bujía: terminal arriba, aislador de porcelana con aros, tuerca, rosca, electrodo y chispa. */
export function SparkPlugIcon({ size = 24, className = '', strokeWidth = 2 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {/* terminal */}
      <rect x="9.6" y="0.6" width="4.8" height="2.8" rx="0.8" fill="currentColor" />
      {/* aislador (porcelana) con sus aros */}
      <path d="M8.6 3.4h6.8l.9 6.2H7.7z" fill="currentColor" fillOpacity="0.14" />
      <path d="M8.3 5.5h7.4M8 7.6h8" />
      {/* tuerca (hexágono) */}
      <rect x="5.6" y="9.6" width="12.8" height="4" rx="0.8" fill="currentColor" />
      {/* rosca */}
      <path d="M7.8 13.6h8.4v4.8H7.8z" fill="currentColor" fillOpacity="0.14" />
      <path d="M7.8 15.1l8.4 1M7.8 16.8l8.4 1" />
      {/* electrodo */}
      <path d="M12 18.4v2.6h3.4" />
      {/* chispa */}
      <path d="M20.2 16.6l-1.8 2.6h2.2l-1.8 2.8" strokeWidth={strokeWidth * 0.9} />
    </svg>
  )
}

/** Pistón: corona con sus anillos, falda, pasador y la biela. */
export function PistonIcon({ size = 24, className = '', strokeWidth = 2 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5.5 2.5h13v9.5l-1.6 2.2H7.1L5.5 12z" fill="currentColor" fillOpacity="0.12" />
      <path d="M5.5 5.2h13M5.5 7.6h13" />
      <circle cx="12" cy="10.6" r="1.7" fill="currentColor" />
      <path d="M10.5 11.8l-1.5 7.4M13.5 11.8l1.5 7.4" />
      <rect x="6.6" y="19" width="10.8" height="3.8" rx="1.9" fill="currentColor" fillOpacity="0.12" />
    </svg>
  )
}

/** Hélice de tres aspas con su cubo. */
export function PropellerIcon({ size = 24, className = '', strokeWidth = 2 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 10.2C10.4 6.6 10.6 2.8 12.6 1.6c2 1.4 1.6 5.2-.6 8.6z" fill="currentColor" fillOpacity="0.14" />
      <path d="M13.6 13.1c3.9-.4 7.3 1.3 7.4 3.7-2.2 1.1-5.6-.5-7.4-3.7z" fill="currentColor" fillOpacity="0.14" />
      <path d="M10.4 13.1c-2.3 3.2-5.7 4.8-7.6 3.6.2-2.4 3.6-4 7.6-3.6z" fill="currentColor" fillOpacity="0.14" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    </svg>
  )
}

/** Manómetro (reloj de presión) con la aguja en lo alto: rápido. */
export function GaugeIcon({ size = 24, className = '', strokeWidth = 2 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="13" r="9.5" fill="currentColor" fillOpacity="0.12" />
      <path d="M5.2 13h1.6M17.2 13h1.6M7.2 7.9l1.1 1.1M16.8 7.9l-1.1 1.1M12 5.5v1.6" />
      <path d="M12 13l4.6-4.2" strokeWidth={strokeWidth * 1.2} />
      <circle cx="12" cy="13" r="1.8" fill="currentColor" />
      <path d="M8 19.5h8" />
    </svg>
  )
}
