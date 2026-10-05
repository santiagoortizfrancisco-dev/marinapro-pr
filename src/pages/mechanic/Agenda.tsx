import { Calendar } from 'lucide-react'
import { formatDate, formatLongDate } from '../../lib/format'
import { EmptyState, PageTitle } from '../../components/ui'

export default function Agenda() {
  const today = new Date()
  return (
    <>
      <PageTitle subtitle={`${formatLongDate(today)} · ${formatDate(today)}`}>Hoy</PageTitle>
      <EmptyState icon={Calendar} title="No tienes citas hoy" text="Aquí vas a ver las citas del día y de la semana, y crear, mover o cancelar citas." milestone="Llega en el Hito 3" />
    </>
  )
}
