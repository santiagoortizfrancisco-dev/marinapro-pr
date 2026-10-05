import { Users } from 'lucide-react'
import { EmptyState, PageTitle } from '../../components/ui'

export default function Clients() {
  return (
    <>
      <PageTitle>Clientes</PageTitle>
      <EmptyState icon={Users} title="Todavía no tienes clientes" text="Aquí vas a añadir clientes, sus botes (muelle, guardería, casa o trailer) y motores, y enviarles el link de invitación por WhatsApp." milestone="Llega en el Hito 2" />
    </>
  )
}
