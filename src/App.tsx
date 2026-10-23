import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import Login from './pages/Login'
import ChooseRole from './pages/ChooseRole'
import PendingApproval from './pages/PendingApproval'
import StartTrial from './pages/StartTrial'
import { TradeProvider } from './lib/trade'
import More from './pages/More'
import Agenda from './pages/mechanic/Agenda'
import AppointmentForm from './pages/mechanic/AppointmentForm'
import AppointmentDetail from './pages/mechanic/AppointmentDetail'
import Clients from './pages/mechanic/Clients'
import ClientForm from './pages/mechanic/ClientForm'
import ClientDetail from './pages/mechanic/ClientDetail'
import BoatForm from './pages/mechanic/BoatForm'
import BoatDetail from './pages/mechanic/BoatDetail'
import EngineForm from './pages/mechanic/EngineForm'
import EquipmentForm from './pages/mechanic/EquipmentForm'
import Jobs from './pages/mechanic/Jobs'
import JobNew from './pages/mechanic/JobNew'
import JobDetail from './pages/mechanic/JobDetail'
import BusinessSettings from './pages/mechanic/BusinessSettings'
import Admin from './pages/mechanic/Admin'
import Catalog from './pages/mechanic/Catalog'
import PublicDoc from './pages/PublicDoc'
import Directory from './pages/public/Directory'
import MechanicProfile from './pages/public/MechanicProfile'
import PublicProfileSettings from './pages/mechanic/PublicProfileSettings'
import RequestDetail from './pages/mechanic/RequestDetail'
import PasswordSettings from './pages/mechanic/PasswordSettings'
import QuickInvoice from './pages/mechanic/QuickInvoice'
import Invoices from './pages/mechanic/Invoices'
import SalonAppointmentForm from './pages/mechanic/SalonAppointmentForm'
import StaffPage from './pages/mechanic/StaffPage'
import BookingSettings from './pages/mechanic/BookingSettings'
import GiftCards from './pages/mechanic/GiftCards'
import SalonBooking from './pages/public/SalonBooking'
import Landing from './pages/public/Landing'
import GiftCardPublic from './pages/public/GiftCardPublic'
import { useWords } from './lib/trade'

/** La cita: la de salón (servicios y empleada) o la de servicio en la calle. */
function ApptForm() {
  return useWords().salon ? <SalonAppointmentForm /> : <AppointmentForm />
}
import Home from './pages/mechanic/Home'
import AppLock from './components/AppLock'
import MyBoats from './pages/client/MyBoats'
import Report from './pages/client/Report'
import Alerts from './pages/client/Alerts'

export default function App() {
  const { loading, session, profile, demo } = useAuth()
  const { pathname } = useLocation()

  // Estimado / factura y directorio de mecánicos: se abren sin cuenta
  if (pathname.startsWith('/d/') || pathname === '/mecanicos' || pathname.startsWith('/mecanicos/') || pathname.startsWith('/reservar/') || pathname === '/info' || pathname.startsWith('/regalo/')) {
    return (
      <Routes>
        <Route path="/d/:token" element={<PublicDoc />} />
        <Route path="/mecanicos" element={<Directory />} />
        <Route path="/mecanicos/:slug" element={<MechanicProfile />} />
        <Route path="/reservar/:slug" element={<SalonBooking />} />
        <Route path="/info" element={<Landing />} />
        <Route path="/regalo/:id" element={<GiftCardPublic />} />
      </Routes>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-navy-800">
        <img src="/logo.svg" alt="" className="h-24 w-24 animate-pulse" />
      </div>
    )
  }

  // Link de prueba: entra sin registro a un taller de ejemplo
  if (pathname === '/demo' || pathname === '/prueba') return <StartTrial />
  if (session?.user.is_anonymous && !profile?.role) return <StartTrial />

  if (!session && !demo) return <Login />
  if (!profile?.role) return <ChooseRole />
  if (!demo && profile.access && profile.access !== 'approved') return <PendingApproval />

  if (profile.role === 'mechanic') {
    return (
      <TradeProvider>
      <AppLock>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/inicio" element={<Home />} />
          <Route path="/facturas" element={<Invoices />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/citas/nueva" element={<ApptForm />} />
          <Route path="/citas/:id" element={<AppointmentDetail />} />
          <Route path="/citas/:id/editar" element={<ApptForm />} />
          <Route path="/clientes" element={<Clients />} />
          <Route path="/clientes/nuevo" element={<ClientForm />} />
          <Route path="/clientes/:id" element={<ClientDetail />} />
          <Route path="/clientes/:id/editar" element={<ClientForm />} />
          <Route path="/botes/nuevo" element={<BoatForm />} />
          <Route path="/botes/:id" element={<BoatDetail />} />
          <Route path="/botes/:id/editar" element={<BoatForm />} />
          <Route path="/botes/:boatId/motores/nuevo" element={<EngineForm />} />
          <Route path="/motores/:id/editar" element={<EngineForm />} />
          <Route path="/botes/:boatId/equipos/nuevo" element={<EquipmentForm />} />
          <Route path="/equipos/:id/editar" element={<EquipmentForm />} />
          <Route path="/trabajos" element={<Jobs />} />
          <Route path="/trabajos/nuevo" element={<JobNew />} />
          <Route path="/cobrar" element={<QuickInvoice />} />
          <Route path="/trabajos/:id" element={<JobDetail />} />
          <Route path="/mas/negocio" element={<BusinessSettings />} />
          <Route path="/mas/admin" element={<Admin />} />
          <Route path="/mas/catalogo" element={<Catalog />} />
          <Route path="/mas/empleadas" element={<StaffPage />} />
          <Route path="/mas/reservas" element={<BookingSettings />} />
          <Route path="/mas/regalos" element={<GiftCards />} />
          <Route path="/mas/perfil-publico" element={<PublicProfileSettings />} />
          <Route path="/mas/clave" element={<PasswordSettings />} />
          <Route path="/solicitudes/:id" element={<RequestDetail />} />
          <Route path="/mas" element={<More />} />
          <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Route>
      </Routes>
      </AppLock>
      </TradeProvider>
    )
  }

  // Fase 2: app del cliente (por ahora solo pantallas de muestra)
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
