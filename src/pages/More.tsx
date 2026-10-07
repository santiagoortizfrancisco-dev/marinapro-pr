import { Link } from 'react-router'
import { Briefcase, ChevronRight, Globe, ListChecks, ShieldCheck } from 'lucide-react'
import { db } from '../lib/db'
import { useLoad } from '../lib/useLoad'
import { useAuth } from '../auth/AuthProvider'
import { formatDate, formatMoney, formatTime } from '../lib/format'
import { CARD, IconBadge, PageTitle } from '../components/ui'

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
        <Link to="/mas/negocio" className="mb-3 flex min-h-16 items-center gap-3 rounded-2xl bg-navy-800 px-3 py-2 text-white shadow-lg shadow-navy-900/20 transition active:scale-[0.99]">
          <IconBadge icon={Briefcase} tone="teal" />
          <span className="flex-1">
            <span className="block text-lg font-bold">Mi negocio</span>
            <span className="block text-sm text-navy-100">ATH Móvil, tarifa, IVU, facturas y garantía</span>
          </span>
          <ChevronRight />
        </Link>
      )}

      {profile?.role === 'mechanic' && (
        <Link to="/mas/catalogo" className={`${CARD} mb-3 flex min-h-16 items-center gap-3 px-3 py-2 text-navy-900 transition active:scale-[0.99]`}>
          <IconBadge icon={ListChecks} tone="amber" />
          <span className="flex-1">
            <span className="block text-lg font-bold">Mis piezas y servicios</span>
            <span className="block text-sm text-slate-600">Tus precios para no escribirlos cada vez</span>
          </span>
          <ChevronRight />
        </Link>
      )}

      {profile?.role === 'mechanic' && (
        <Link to="/mas/perfil-publico" className={`${CARD} mb-3 flex min-h-16 items-center gap-3 px-3 py-2 text-navy-900 transition active:scale-[0.99]`}>
          <IconBadge icon={Globe} tone="blue" />
          <span className="flex-1">
            <span className="block text-lg font-bold">Mi perfil público</span>
            <span className="block text-sm text-slate-600">Sal en el directorio y recibe citas nuevas</span>
          </span>
          <ChevronRight />
        </Link>
      )}

      {isAdmin && (
        <Link to="/mas/admin" className={`${CARD} mb-3 flex min-h-16 items-center gap-3 px-3 py-2 text-navy-900 transition active:scale-[0.99]`}>
          <IconBadge icon={ShieldCheck} tone="violet" />
          <span className="flex-1">
            <span className="block text-lg font-bold">Admin</span>
            <span className="block text-sm text-slate-600">Quién usa el app y cuánto</span>
          </span>
          <ChevronRight />
        </Link>
      )}

      <section className={`${CARD} mt-5 px-4`}>
        {row('Nombre', profile?.full_name)}
        {row('Email', profile?.email ?? session?.user.email)}
        {row('Teléfono', profile?.phone)}
        {row('Pueblo', profile?.town)}
        {row('Tipo de cuenta', profile?.role === 'mechanic' ? 'Mecánico' : 'Dueño de bote')}
      </section>

      <h2 className="mb-2 mt-6 text-lg font-bold text-navy-900">Formatos</h2>
      <section className={`${CARD} mt-5 px-4`}>
        {row('Fecha de hoy', formatDate(now))}
        {row('Hora (Puerto Rico)', formatTime(now))}
        {row('Ejemplo de dinero', formatMoney(1234.56))}
      </section>

      <p className="mt-8 text-center text-sm text-slate-500">Marine Mechanics PR · versión {__APP_VERSION__}</p>
    </>
  )
}
