import { Navigate, useParams } from 'react-router'
import { db } from '../../lib/db'
import { useLoad } from '../../lib/useLoad'
import JobPanel from '../../components/JobPanel'
import { Loading } from '../../components/ui'

/** Un trabajo con cita se ve dentro de su cita (todo en un solo sitio); sin cita, se ve solo. */
export default function JobDetail() {
  const { id } = useParams()
  const { data, loading } = useLoad(async () => {
    const { data } = await db().from('work_orders').select('appointment_id').eq('id', id!).maybeSingle()
    return (data as { appointment_id: string | null } | null)?.appointment_id ?? null
  }, [id])

  if (loading) return <Loading />
  if (data) return <Navigate to={`/citas/${data}`} replace />
  return <JobPanel woId={id!} />
}
