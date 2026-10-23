import { useEffect, useRef } from 'react'

/** Confeti que cae unos segundos al abrir (para la tarjeta de regalo). Sin librerías. */
export default function Confetti({ seconds = 4 }: { seconds?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // Quien prefiere menos movimiento no ve la animación
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const W = (canvas.width = window.innerWidth)
    const H = (canvas.height = window.innerHeight)
    const colors = ['#ec4899', '#f472b6', '#fde047', '#a855f7', '#22d3ee', '#fb923c', '#ffffff']
    const bits = Array.from({ length: 160 }, () => ({
      x: Math.random() * W, y: -Math.random() * H, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3, r: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4,
      c: colors[Math.floor(Math.random() * colors.length)],
    }))
    const end = performance.now() + seconds * 1000
    let raf = 0
    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H)
      const fade = Math.max(0, Math.min(1, (end - t) / 800))
      for (const b of bits) {
        b.y += b.vy; b.x += b.vx; b.r += b.vr
        if (b.y > H && t < end - 800) { b.y = -20; b.x = Math.random() * W }
        ctx.save()
        ctx.globalAlpha = fade
        ctx.translate(b.x, b.y)
        ctx.rotate(b.r)
        ctx.fillStyle = b.c
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
        ctx.restore()
      }
      if (t < end) raf = requestAnimationFrame(draw)
      else ctx.clearRect(0, 0, W, H)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [seconds])
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-50" />
}
