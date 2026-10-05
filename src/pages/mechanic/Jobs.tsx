import { Wrench } from 'lucide-react'
import { EmptyState, PageTitle } from '../../components/ui'

export default function Jobs() {
  return (
    <>
      <PageTitle>Trabajos</PageTitle>
      <EmptyState icon={Wrench} title="No hay trabajos abiertos" text="Aquí vas a hacer estimados, pedir la aprobación del cliente, anotar piezas, tomar fotos y hacer la prueba en el agua." milestone="Llega en el Hito 4" />
    </>
  )
}
