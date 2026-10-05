import { Ship } from 'lucide-react'
import { EmptyState, PageTitle } from '../../components/ui'

export default function MyBoats() {
  return (
    <>
      <PageTitle>Mis botes</PageTitle>
      <EmptyState icon={Ship} title="Todavía no hay botes" text="Cuando tu mecánico te envíe la invitación, aquí vas a ver tus botes, motores, trabajos, fotos y facturas." milestone="Llega en el Hito 4" />
    </>
  )
}
