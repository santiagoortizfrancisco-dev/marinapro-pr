import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import Login from './pages/Login'
import ChooseRole from './pages/ChooseRole'
import More from './pages/More'
import Agenda from './pages/mechanic/Agenda'
import Clients from './pages/mechanic/Clients'
import Jobs from './pages/mechanic/Jobs'
import MyBoats from './pages/client/MyBoats'
import Report from './pages/client/Report'
import Alerts from './pages/client/Alerts'

export default function App() {
  const { loading, session, profile, demo } = useAuth()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-navy-800">
        <img src="/logo.svg" alt="" className="h-24 w-24 animate-pulse" />
      </div>
    )
  }

  if (!session && !demo) return <Login />
  if (!profile?.role) return <ChooseRole />

  if (profile.role === 'mechanic') {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/clientes" element={<Clients />} />
          <Route path="/trabajos" element={<Jobs />} />
          <Route path="/mas" element={<More />} />
          <Route path="*" element={<Navigate to="/agenda" replace />} />
        </Route>
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/botes" element={<MyBoats />} />
        <Route path="/reportar" element={<Report />} />
        <Route path="/avisos" element={<Alerts />} />
        <Route path="/mas" element={<More />} />
        <Route path="*" element={<Navigate to="/botes" replace />} />
      </Route>
    </Routes>
  )
}
