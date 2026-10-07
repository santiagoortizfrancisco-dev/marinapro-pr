import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Mail } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/** Marco de las páginas públicas: barra arriba, contenido y pie con "¿Eres mecánico?". */
export default function PublicShell({ children }: { children: ReactNode }) {
  // El mecánico (con sesión) lo abre desde el app: en el iPhone no hay botón de atrás
  const [inApp, setInApp] = useState(false)
  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setInApp(Boolean(data.session)))
  }, [])

  return (
    <div className="min-h-full bg-slate-50">
      <header className="safe-top bg-navy-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/mecanicos" className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-10 w-10 rounded-xl" />
            <span className="text-lg font-extrabold leading-tight">Salt Boat Repair</span>
          </Link>
          {inApp && (
            <a href="/mas" className="ml-auto flex min-h-11 items-center gap-1 rounded-xl bg-white px-3 text-sm font-bold text-navy-800">
              <ArrowLeft size={18} /> Volver al app
            </a>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-10">{children}</main>
      <footer className="safe-bottom border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-6 text-center">
          <p className="text-base font-bold text-navy-900">¿Eres mecánico de botes?</p>
          <p className="mt-1 text-sm text-slate-600">Maneja tus citas, trabajos y facturas en un solo app, y sal en este directorio.</p>
          <a href="mailto:marinepropr@gmail.com?subject=Quiero%20unirme%20a%20Salt%20Boat%20Repair" className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-navy-800 px-5 text-base font-bold text-navy-800">
            <Mail size={18} /> Escríbenos
          </a>
          <p className="mt-5 text-xs text-slate-400">© {new Date().getFullYear()} Salt Boat Repair · Puerto Rico</p>
        </div>
      </footer>
    </div>
  )
}
