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
