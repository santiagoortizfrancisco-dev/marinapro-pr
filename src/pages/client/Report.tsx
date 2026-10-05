import { MessageSquareWarning } from 'lucide-react'
import { EmptyState, PageTitle } from '../../components/ui'

export default function Report() {
  return (
    <>
      <PageTitle>Reportar un problema</PageTitle>
      <EmptyState icon={MessageSquareWarning} title="Cuéntale a tu mecánico qué pasa" text="Aquí vas a describir el problema, añadir fotos o video y pedir una cita." milestone="Llega en el Hito 4" />
    </>
  )
}
