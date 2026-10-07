import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Bell, Calendar, LogOut, Menu, MessageSquareWarning, Receipt, Repeat, Ship, Users, Wrench, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import type { Role } from '../lib/types'
import { Sheet, Toast } from './Sheet'
import { BRAND_EVENT, logoUrl } from '../lib/brand'
import { db } from '../lib/db'
import { Button } from './ui'
import ApprovalAlerts from './ApprovalAlerts'
import RequestAlerts from './RequestAlerts'

const ROLE_LABEL: Record<Role, string> = { mechanic: 'Mecánico', client: 'Dueño de bote' }

/** Cada vista con su color para que se note dónde estás. */
const ROLE_STYLE: Record<Role, { bg: string; border: string; active: string; pill: string }> = {
  mechanic: { bg: 'bg-navy-800', border: 'border-navy-800', active: 'text-navy-800', pill: 'bg-navy-100' },
  client: { bg: 'bg-teal-800', border: 'border-teal-800', active: 'text-teal-800', pill: 'bg-teal-100' },
}

interface Tab {
  to: string
  label: string
  icon: LucideIcon
  /** Otras pantallas que cuentan como esta pestaña */
  also?: string[]
}

const MECHANIC_TABS: Tab[] = [
  { to: '/agenda', label: 'Agenda', icon: Calendar, also: ['/citas'] },
  { to: '/clientes', label: 'Clientes', icon: Users, also: ['/botes', '/motores', '/equipos'] },
  { to: '/trabajos', label: 'Cobros', icon: Receipt },
  { to: '/mas', label: 'Más', icon: Menu },
]

const CLIENT_TABS: Tab[] = [
  { to: '/botes', label: 'Mis botes', icon: Ship },
  { to: '/reportar', label: 'Reportar', icon: MessageSquareWarning },
  { to: '/avisos', label: 'Avisos', icon: Bell },
  { to: '/mas', label: 'Más', icon: Menu },
]

export default function Layout() {
  const { profile, demo, enterDemo, signOut } = useAuth()
  const isMechanic = profile?.role === 'mechanic'
  const tabs = isMechanic ? MECHANIC_TABS : CLIENT_TABS
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [sheet, setSheet] = useState<'switch' | 'signout' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Logo, nombre y color del negocio del mecánico
  const [brand, setBrand] = useState<{ name: string | null; logo: string | null; color: string | null }>({ name: null, logo: null, color: null })

  useEffect(() => {
    if (!isMechanic || demo || !profile) return
    const load = () =>
      db().from('mechanics').select('business_name, logo_path, brand_color').eq('profile_id', profile.id).single().then(({ data }) => {
        const m = data as { business_name: string | null; logo_path: string | null; brand_color: string | null } | null
        if (m) setBrand({ name: m.business_name, logo: logoUrl(m.logo_path), color: m.brand_color })
      })
    load()
    window.addEventListener(BRAND_EVENT, load)
    return () => window.removeEventListener(BRAND_EVENT, load)
  }, [isMechanic, demo, profile])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  function switchTo(role: Role) {
    setSheet(null)
    if (role === profile?.role) return
    enterDemo(role)
    navigate('/')
    window.scrollTo(0, 0)
    setToast(`Ahora estás viendo la app como ${ROLE_LABEL[role]}`)
  }

  const roleOption = (role: Role, Icon: LucideIcon, text: string) => {
    const current = profile?.role === role
    return (
      <button
        onClick={() => switchTo(role)}
        className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left ${current ? 'border-slate-300 bg-slate-100' : `${ROLE_STYLE[role].border} bg-white active:bg-slate-50`}`}
      >
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white ${ROLE_STYLE[role].bg}`}>
          <Icon size={26} />
        </span>
        <span className="flex-1">
          <span className="block text-lg font-bold text-slate-900">{ROLE_LABEL[role]}</span>
          <span className="block text-base text-slate-600">{text}</span>
        </span>
        {current && <span className="rounded-full bg-slate-300 px-2 py-1 text-xs font-bold text-slate-800">Estás aquí</span>}
      </button>
    )
  }

  const style = ROLE_STYLE[isMechanic ? 'mechanic' : 'client']

  return (
    <div className="min-h-full">
      {/* Cabecera y pestañas fijas; la página baja con el dedo normal (más confiable en iPhone) */}
      <header className={`safe-top sticky top-0 z-10 text-white ${brand.color ? '' : style.bg}`} style={brand.color ? { backgroundColor: brand.color } : undefined}>
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 pb-3 pt-3">
          {brand.logo ? (
            <img src={brand.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-black object-contain" />
          ) : (
            <img src="/logo.svg" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-bold uppercase tracking-wide text-white/85">
              Salt Boat Repair{demo && <span className="ml-2 rounded-full bg-sun-400 px-2 font-bold text-white">DEMO</span>}
            </div>
            <div className="text-[11px] leading-tight text-white/60">Powered by Francisco Santiago (Joy)</div>
            <div className="truncate text-lg font-bold">{brand.name || (isMechanic ? 'Mecánico' : 'Dueño de bote')}</div>
          </div>
          {demo && (
            <button
              onClick={() => setSheet('switch')}
              className="flex min-h-12 flex-col items-center justify-center rounded-xl bg-sun-400 px-2 text-xs font-bold text-white active:bg-sun-500"
            >
              <Repeat size={20} /> Cambiar
            </button>
          )}
          <button onClick={() => setSheet('signout')} className="flex min-h-12 min-w-12 flex-col items-center justify-center rounded-xl text-xs font-semibold active:bg-black/20">
            <LogOut size={22} /> Salir
          </button>
        </div>
      </header>

      <Sheet open={sheet === 'switch'} title="¿Cómo quieres ver la app?" onClose={() => setSheet(null)}>
        <div className="space-y-3">
          {roleOption('mechanic', Wrench, 'Agenda, clientes, trabajos y facturas')}
          {roleOption('client', Ship, 'Mis botes, reportar problemas y avisos')}
          <Button variant="ghost" onClick={() => setSheet(null)}>Cancelar</Button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'signout'} title="¿Seguro que quieres salir?" onClose={() => setSheet(null)}>
        <p className="mb-5 text-base text-slate-600">
          {demo ? 'Vas a volver a la pantalla de inicio del demo.' : 'Para volver a entrar vas a necesitar un código nuevo por email.'}
        </p>
        <div className="space-y-3">
          <Button onClick={() => { setSheet(null); signOut() }}><LogOut /> Sí, salir</Button>
          <Button variant="secondary" onClick={() => setSheet(null)}>Cancelar</Button>
        </div>
      </Sheet>

      <Toast message={toast} />

      {isMechanic && !demo && <ApprovalAlerts />}
      {isMechanic && !demo && <RequestAlerts />}

      <main className="pb-44">
        <div className="mx-auto max-w-xl px-4 py-5">
          <Outlet />
        </div>
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t-2 border-slate-200 bg-white">
        <div className="mx-auto grid max-w-xl grid-cols-4">
          {tabs.map(({ to, label, icon: Icon, also }) => {
            const extra = also?.some((p) => pathname.startsWith(p)) ?? false
            return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-semibold ${
                  isActive || extra ? style.active : 'text-slate-500'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`rounded-full px-4 py-1 ${isActive || extra ? style.pill : ''}`}>
                    <Icon size={26} strokeWidth={isActive || extra ? 2.5 : 2} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
