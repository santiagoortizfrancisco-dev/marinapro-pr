import { Link } from 'react-router'
import { Briefcase, ChevronRight } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { formatDate, formatMoney, formatTime } from '../lib/format'
import { PageTitle } from '../components/ui'

export default function More() {
  const { profile, session } = useAuth()
  const now = new Date()

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

      <p className="mt-8 text-center text-sm text-slate-500">MarinaPro PR · versión 0.1 (Hito 1)</p>
    </>
  )
}
