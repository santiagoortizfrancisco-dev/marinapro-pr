/** Íconos de salón dibujados a mano (líneas + relleno suave, en currentColor). */

interface P { size?: number; className?: string; strokeWidth?: number }

/** Pintura de uñas: tapa alta, cuello y el pomo con su brillo. */
export function NailPolishIcon({ size = 24, className = '', strokeWidth = 2 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {/* tapa */}
      <rect x="9.5" y="1.5" width="5" height="7.5" rx="1" fill="currentColor" />
      {/* cuello */}
      <path d="M8.5 9h7v2h-7z" />
      {/* pomo */}
      <path d="M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5V20a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 20v-7.5A1.5 1.5 0 0 1 6.5 11z" fill="currentColor" fillOpacity="0.18" />
      {/* brillo */}
      <path d="M8.5 14v4" strokeWidth={strokeWidth * 0.9} />
    </svg>
  )
}

/** Mano con las uñas pintadas. */
export function NailsHandIcon({ size = 24, className = '', strokeWidth = 2 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {/* dedos */}
      <path d="M7 13V6.5a1.5 1.5 0 0 1 3 0V12M10 11.5V4.5a1.5 1.5 0 0 1 3 0V11.5M13 11.5V5.5a1.5 1.5 0 0 1 3 0V12.5M16 12.5V8.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3.6 15.5a1.6 1.6 0 0 1 2.6-1.9L7 14.5" />
      {/* uñas pintadas */}
      <rect x="7.6" y="5" width="1.8" height="2.2" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="10.6" y="3" width="1.8" height="2.2" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="13.6" y="4" width="1.8" height="2.2" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="16.6" y="7" width="1.8" height="2.2" rx="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}
