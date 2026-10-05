import { NavLink, Outlet, useNavigate } from 'react-router'
import { Bell, Calendar, LogOut, Menu, MessageSquareWarning, Repeat, Ship, Users, Wrench, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'

interface Tab {
  to: string
  label: string
  icon: LucideIcon
}

const MECHANIC_TABS: Tab[] = [
  { to: '/agenda', label: 'Agenda', icon: Calendar },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/trabajos', label: 'Trabajos', icon: Wrench },
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

  return (
    <div className="min-h-full">
      {/* Cabecera y pestañas fijas; la página baja con el dedo normal (más confiable en iPhone) */}
      <header className="safe-top sticky top-0 z-10 bg-navy-800 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-2">
          <img src="/logo.svg" alt="" className="h-9 w-9 rounded-lg" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-lg font-bold">MarinaPro PR</div>
            <div className="text-sm text-navy-100">
              {isMechanic ? 'Mecánico' : 'Dueño de bote'}
              {demo && <span className="ml-2 rounded-full bg-sun-400 px-2 text-xs font-bold text-navy-900">DEMO</span>}
            </div>
          </div>
          {demo && (
            <button
              onClick={() => { enterDemo(isMechanic ? 'client' : 'mechanic'); navigate('/') }}
              className="flex min-h-12 items-center gap-1 rounded-xl bg-sun-400 px-3 text-sm font-bold text-navy-900 active:bg-sun-500"
            >
              <Repeat size={18} /> Cambiar
            </button>
          )}
          <button onClick={signOut} aria-label="Salir" className="flex min-h-12 min-w-12 flex-col items-center justify-center rounded-xl text-xs font-semibold active:bg-navy-900">
            <LogOut size={22} /> Salir
          </button>
        </div>
      </header>

      <main className="pb-24">
        <div className="mx-auto max-w-xl px-4 py-5">
          <Outlet />
        </div>
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t-2 border-slate-200 bg-white">
        <div className="mx-auto grid max-w-xl grid-cols-4">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-semibold ${
                  isActive ? 'text-navy-800' : 'text-slate-500'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`rounded-full px-4 py-1 ${isActive ? 'bg-navy-100' : ''}`}>
                    <Icon size={26} strokeWidth={isActive ? 2.5 : 2} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
