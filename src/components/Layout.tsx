import { NavLink, Outlet } from 'react-router'
import { Bell, Calendar, Ship, Menu, Users, Wrench, MessageSquareWarning, type LucideIcon } from 'lucide-react'
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
  const { profile, demo } = useAuth()
  const tabs = profile?.role === 'mechanic' ? MECHANIC_TABS : CLIENT_TABS

  return (
    <div className="flex h-full flex-col">
      <header className="safe-top bg-navy-800 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <img src="/logo.svg" alt="" className="h-9 w-9 rounded-lg" />
          <div className="flex-1 leading-tight">
            <div className="text-lg font-bold">MarinaPro PR</div>
            <div className="text-sm text-navy-100">{profile?.role === 'mechanic' ? 'Mecánico' : 'Dueño de bote'}</div>
          </div>
          {demo && <span className="rounded-full bg-sun-400 px-3 py-1 text-sm font-bold text-navy-900">DEMO</span>}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-4 py-5">
          <Outlet />
        </div>
      </main>

      <nav className="safe-bottom border-t-2 border-slate-200 bg-white">
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
