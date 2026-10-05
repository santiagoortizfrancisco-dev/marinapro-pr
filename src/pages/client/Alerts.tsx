import { Bell } from 'lucide-react'
import { EmptyState, PageTitle } from '../../components/ui'

export default function Alerts() {
  return (
    <>
      <PageTitle>Avisos</PageTitle>
      <EmptyState icon={Bell} title="No tienes avisos" text="Aquí te llegan los estimados para aprobar, citas confirmadas, facturas y recordatorios de mantenimiento." milestone="Llega en el Hito 4" />
    </>
  )
}
