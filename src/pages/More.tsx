import { Link } from 'react-router'
import { Briefcase, ChevronRight, Globe, ListChecks, ShieldCheck } from 'lucide-react'
import { db } from '../lib/db'
import { useLoad } from '../lib/useLoad'
import { useAuth } from '../auth/AuthProvider'
import { formatDate, formatMoney, formatTime } from '../lib/format'
import { PageTitle } from '../components/ui'

export default function More() {
  const { profile, session } = useAuth()
  const now = new Date()
  // El enlace de Admin solo le sale al dueño del app
  const { data: isAdmin } = useLoad(async () => {
    const { data } = await db().rpc('is_app_admin')
    return data === true
  }, [])

  const row = (label: string, value: string | null | undefined) => (
    <div className="flex justify-between gap-4 border-b border-slate-200 py-3 last:border-0">
      <span className="text-base text-slate-600">{label}</span>
      <span className="text-right text-base font-semibold text-slate-900">{value || '—'}</span>
    </div>
  )

  return (
    <>
      <PageTitle>Más</PageTitle>

      {profile?.role === 'mechanic' && (
        <Link to="/mas/negocio" className="mb-5 flex min-h-16 items-center gap-3 rounded-2xl bg-navy-800 px-4 text-white active:bg-navy-900">
          <Briefcase size={26} />
          <span className="flex-1">
            <span className="block text-lg font-bold">Mi negocio</span>
            <span className="block text-sm text-navy-100">ATH Móvil, tarifa, IVU, facturas y garantía</span>
          </span>
          <ChevronRight />
        </Link>
      )}

      {profile?.role === 'mechanic' && (
        <Link to="/mas/catalogo" className="mb-5 flex min-h-16 items-center gap-3 rounded-2xl border-2 border-navy-800 px-4 text-navy-900 active:bg-navy-50">
          <ListChecks size={26} />
          <span className="flex-1">
            <span className="block text-lg font-bold">Mis piezas y servicios</span>
            <span className="block text-sm text-slate-600">Tus precios y paquetes, para no escribirlos cada vez</span>
          </span>
          <ChevronRight />
        </Link>
      )}

      {profile?.role === 'mechanic' && (
        <Link to="/mas/perfil-publico" className="mb-5 flex min-h-16 items-center gap-3 rounded-2xl border-2 border-navy-800 px-4 text-navy-900 active:bg-navy-50">
          <Globe size={26} />
          <span className="flex-1">
            <span className="block text-lg font-bold">Mi perfil público</span>
            <span className="block text-sm text-slate-600">Sal en el directorio y recibe citas nuevas</span>
          </span>
          <ChevronRight />
        </Link>
      )}

      {isAdmin && (
        <Link to="/mas/admin" className="mb-5 flex min-h-16 items-center gap-3 rounded-2xl border-2 border-navy-800 px-4 text-navy-900 active:bg-navy-50">
          <ShieldCheck size={26} />
          <span className="flex-1">
            <span className="block text-lg font-bold">Admin</span>
            <span className="block text-sm text-slate-600">Quién usa el app y cuánto</span>
          </span>
          <ChevronRight />
        </Link>
      )}

      <section className="rounded-2xl border-2 border-slate-200 px-4">
        {row('Nombre', profile?.full_name)}
        {row('Email', profile?.email ?? session?.user.email)}
        {row('Teléfono', profile?.phone)}
        {row('Pueblo', profile?.town)}
        {row('Tipo de cuenta', profile?.role === 'mechanic' ? 'Mecánico' : 'Dueño de bote')}
      </section>

      <h2 className="mb-2 mt-6 text-lg font-bold text-navy-900">Formatos</h2>
      <section className="rounded-2xl border-2 border-slate-200 px-4">
        {row('Fecha de hoy', formatDate(now))}
        {row('Hora (Puerto Rico)', formatTime(now))}
        {row('Ejemplo de dinero', formatMoney(1234.56))}
      </section>

      <p className="mt-8 text-center text-sm text-slate-500">Marine Mechanics PR · versión {__APP_VERSION__}</p>
    </>
  )
}
