import { useState } from 'react'
import { Hourglass, LogOut, RefreshCw, XCircle } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import ContactSheet from '../components/ContactSheet'
import { Button } from '../components/ui'

/** Se registró, pero todavía no lo aprueban (o lo rechazaron). No puede usar el app todavía. */
export default function PendingApproval() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [checking, setChecking] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const rejected = profile?.access === 'rejected'

  async function check() {
    setChecking(true)
    await refreshProfile()
    setChecking(false)
  }

  return (
    <div className="flex min-h-full flex-col bg-navy-900">
      <div className="safe-top px-6 pb-8 pt-12 text-center text-white">
        <img src="/logo.svg" alt="" className="mx-auto h-20 w-20 rounded-2xl" />
        <h1 className="mt-4 text-[1.7rem] font-extrabold leading-tight">Salt Marine Repair</h1>
        <p className="text-xs text-white/60">Powered by Francisco Santiago (Joy)</p>
      </div>
      <div className="safe-bottom flex-1 rounded-t-3xl bg-white px-6 py-8">
        <div className="mx-auto max-w-md space-y-5 text-center">
          {rejected ? (
            <>
              <XCircle size={56} className="mx-auto text-red-600" />
              <h2 className="text-2xl font-extrabold text-navy-900">Tu cuenta no fue aprobada</h2>
              <p className="text-base text-slate-600">Si crees que es un error, escríbenos y lo revisamos.</p>
            </>
          ) : (
            <>
              <Hourglass size={56} className="mx-auto text-navy-700" />
              <h2 className="text-2xl font-extrabold text-navy-900">¡Gracias, {profile?.full_name?.split(' ')[0] ?? 'mecánico'}!</h2>
              <p className="text-lg text-slate-700">Tu cuenta está <b>en revisión</b>. Cuando la aprobemos, abre el app otra vez y ya puedes empezar.</p>
              <Button onClick={check} disabled={checking}><RefreshCw size={20} /> {checking ? 'Revisando…' : 'Ya me aprobaron: revisar'}</Button>
            </>
          )}
          <Button variant="secondary" onClick={() => setContactOpen(true)}>Escribirnos</Button>
          <Button variant="ghost" onClick={signOut}><LogOut size={20} /> Salir</Button>
        </div>
      </div>
      <ContactSheet open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  )
}
