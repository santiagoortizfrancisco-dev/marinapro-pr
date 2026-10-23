import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Check, CheckCircle2, ChevronDown, Plus, Search, UserPlus, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { db } from '../../lib/db'
import { formatDate, formatMoney, formatTime, prDay, prRange, prTime, prToISO, todayPR } from '../../lib/format'
import { clientRecordId, loadSalonMenu, loadStaff, minutesLabel, type SalonService, type Staff } from '../../lib/salon'
import { blank } from '../../lib/useLoad'
import { BackTitle, Button, Field, Input, Loading } from '../../components/ui'
import TimeSelect from '../../components/TimeSelect'
import { useDraft } from '../../lib/draft'
import DraftBanner from '../../components/DraftBanner'

/** Tarjeta blanca con su número de paso: así la cita se llena de arriba a abajo. */
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-[0_8px_30px_-18px_rgba(157,23,77,0.45)] ring-1 ring-pink-100">
      <h2 className="mb-3 flex items-center gap-2.5 text-lg font-extrabold text-slate-900">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-600 text-base text-white">{n}</span>
        <span className="flex-1">{title}</span>
        {hint && <span className="text-sm font-semibold text-slate-400">{hint}</span>}
      </h2>
      {children}
    </section>
  )
}

/** Inicial del nombre, para los circulitos. */
const initial = (name: string) => name.trim().charAt(0).toUpperCase()

interface ClientRow { id: string; full_name: string; phone: string | null }

function plain(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function defaultTime(day: string, hora: string | null): string {
  if (hora) return hora
  if (day !== todayPR()) return '09:00'
  const [h, m] = prTime(new Date()).split(':').map(Number)
  return m < 30 ? `${String(h).padStart(2, '0')}:30` : `${String(Math.min(h + 1, 23)).padStart(2, '0')}:00`
}

/**
 * Cita de salón (uñas, pelo, spa): la clienta, los servicios (el app suma el tiempo y el precio),
 * con quién y cuándo. Al guardar, la cita ya trae su cuenta lista para cobrar.
 */
export default function SalonAppointmentForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  // "Cobrar ahora": la clienta ya está aquí; la cita queda para este momento y se va directo a cobrar
  const now = !id && params.get('ahora') === '1'
  const startDay = params.get('dia') ?? todayPR()
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [menu, setMenu] = useState<SalonService[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [clientId, setClientId] = useState<string | null>(params.get('clienta'))
  const [newClient, setNewClient] = useState<{ full_name: string; phone: string } | null>(null)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [extras, setExtras] = useState<string[]>([])
  const [billed, setBilled] = useState(false)
  // Servicios: una pestaña por tipo (Uñas, Pelo, Spa), los más pedidos primero; al terminar se cierra en una línea
  const [cat, setCat] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [listOpen, setListOpen] = useState<boolean | null>(null)
  const [staffId, setStaffId] = useState<string | null>(params.get('empleada'))
  const [day, setDay] = useState(startDay)
  const [time, setTime] = useState(now ? prTime(new Date()) : defaultTime(startDay, params.get('hora')))
  const [notes, setNotes] = useState('')
  // Tiempo: según los servicios (o 1 hora), o el que ella escoja
  const [length, setLength] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Borrador: si sale a mitad y vuelve, sigue donde lo dejó (solo cita nueva, sin venir de un hueco de la agenda)
  const draft = useDraft(!id && [...params.keys()].length === 0 ? 'draft:cita-nueva' : null,
    { clientId, newClient, picked, day, time, notes, length },
    (d) => { setClientId(d.clientId); setNewClient(d.newClient); setPicked(d.picked); setDay(d.day); setTime(d.time); setNotes(d.notes); setLength(d.length) })
  const [sameDay, setSameDay] = useState<{ id: string; starts_at: string; duration_min: number; staff_id: string | null; boats: { name: string } | null }[]>([])

  useEffect(() => {
    ;(async () => {
      const uid = session!.user.id
      const [c, m, st] = await Promise.all([
        db().from('clients').select('id, full_name, phone').order('full_name'),
        loadSalonMenu(uid),
        loadStaff(),
      ])
      setMenu(m)
      setStaff(st)
      if (id) {
        const { data: ap } = await db().from('appointments').select('starts_at, staff_id, notes, boat_id, title, boats(client_id)').eq('id', id).single()
        const a = ap as unknown as { starts_at: string; staff_id: string | null; notes: string | null; title: string | null; boats: { client_id: string } } | null
        if (a) {
          setClientId(a.boats.client_id)
          setDay(prDay(a.starts_at))
          setTime(prTime(a.starts_at))
          setStaffId(a.staff_id)
          setNotes(a.notes ?? '')
          const names = (a.title ?? '').split(' + ')
          setPicked(m.filter((x) => names.includes(x.name)).map((x) => x.id))
          setExtras(names.filter((n) => n && !m.some((x) => x.name === n)))
          const { data: wo } = await db().from('work_orders').select('status').eq('appointment_id', id).limit(1)
          setBilled(['invoiced', 'paid'].includes(((wo ?? [])[0]?.status as string) ?? ''))
        }
      } else if (!params.get('empleada') && st.length === 1) {
        setStaffId(st[0].id)
      }
      setClients((c.data ?? []) as ClientRow[])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Lo que ya hay ese día (para no montar dos citas a la misma hora con la misma empleada)
  useEffect(() => {
    if (!day) return
    const [start, end] = prRange(day, 1)
    db().from('appointments').select('id, starts_at, duration_min, staff_id, boats(name)').gte('starts_at', start).lt('starts_at', end).neq('status', 'cancelled').order('starts_at')
      .then(({ data }) => setSameDay(((data ?? []) as unknown as typeof sameDay).filter((x) => x.id !== id)))
  }, [day, id])

  const chosen = clients?.find((c) => c.id === clientId) ?? null
  const results = useMemo(() => {
    const term = plain(search.trim())
    if (!clients || !term) return []
    const digits = term.replace(/\D/g, '')
    return clients.filter((c) => plain(c.full_name).includes(term) || (digits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digits))).slice(0, 6)
  }, [clients, search])

  const selected = menu.filter((m) => picked.includes(m.id))
  const fromServices = selected.reduce((t, s) => t + (s.duration_min ?? 30), 0)
  const minutes = length ?? (fromServices || 60)
  const price = selected.reduce((t, s) => t + Number(s.last_price ?? 0), 0)
  const categories = [...new Set(menu.map((m) => m.category ?? 'Otros'))]
  const tab = cat ?? categories[0] ?? null
  // Los más pedidos primero; si todavía no hay historial, se ven todos los de la pestaña
  const inTab = menu.filter((m) => (m.category ?? 'Otros') === tab).sort((x, y) => Number(y.use_count ?? 0) - Number(x.use_count ?? 0))
  const hasUsage = inTab.some((m) => Number(m.use_count ?? 0) > 0)
  const shown = showAll || !hasUsage ? inTab : inTab.slice(0, 6)
  // Al cambiar una cita que ya tiene servicios, empieza cerrado en una línea
  const open = listOpen ?? false
  const busyThen = sameDay.filter((x) => !staffId || !x.staff_id || x.staff_id === staffId)

  function toggle(sid: string) {
    setPicked((p) => (p.includes(sid) ? p.filter((x) => x !== sid) : [...p, sid]))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    // Lo único que hace falta: quién y a qué hora
    if (!chosen && !(newClient && newClient.full_name.trim().length > 1)) return setError('Escoge la clienta o toca “Clienta nueva”.')
    if (!day || !time) return setError('Pon el día y la hora.')
    setBusy(true)
    setError('')
    try {
      const uid = session!.user.id
      let cid = chosen?.id ?? ''
      let name = chosen?.full_name ?? ''
      if (!chosen && newClient && newClient.full_name.trim()) {
        name = newClient.full_name.trim()
        const c = await db().from('clients').insert({ mechanic_id: uid, full_name: name, phone: blank(newClient.phone) }).select('id').single()
        if (c.error) throw c.error
        cid = (c.data as { id: string }).id
      }
      const recordId = await clientRecordId(cid, name)
      const title = [...selected.map((s) => s.name), ...extras].join(' + ') || null
      const row = { boat_id: recordId, staff_id: staffId, starts_at: prToISO(day, time), duration_min: Math.max(15, minutes), notes: blank(notes), ...(billed ? {} : { title }) }
      let apptId = id
      if (id) {
        const u = await db().from('appointments').update(row).eq('id', id)
        if (u.error) throw u.error
      } else {
        const a = await db().from('appointments').insert({ ...row, mechanic_id: uid, status: 'confirmed', systems: [] }).select('id').single()
        if (a.error) throw a.error
        apptId = (a.data as { id: string }).id
      }

      // Su cuenta: los servicios con su precio, lista para cobrar (si ya se cobró, no se toca)
      const { data: wos } = await db().from('work_orders').select('id, status').eq('appointment_id', apptId!).limit(1)
      let woId = (wos ?? [])[0]?.id as string | undefined
      const locked = ['invoiced', 'paid'].includes(((wos ?? [])[0]?.status as string) ?? '')
      // Ya tiene factura: la cuenta no se toca, pero si se cambió la clienta, la factura pasa a ella
      if (locked && woId) await db().from('work_orders').update({ boat_id: recordId, staff_id: staffId }).eq('id', woId)
      if (!locked) {
        const now = new Date().toISOString()
        if (woId) {
          await db().from('work_orders').update({ boat_id: recordId, staff_id: staffId, complaint: title }).eq('id', woId)
        } else {
          const w = await db().from('work_orders').insert({
            boat_id: recordId, appointment_id: apptId, staff_id: staffId, complaint: title, status: 'approved',
            labor_hours: 0, labor_rate: 0, sea_trial_required: false, estimate_approved_at: now, estimate_approved_by: 'mechanic', approval_seen_at: now,
          }).select('id').single()
          if (w.error) throw w.error
          woId = (w.data as { id: string }).id
        }
        const had = woId ? (((await db().from('work_order_parts').select('id, description').eq('work_order_id', woId)).data ?? []) as { id: string; description: string }[]) : []
        const keep = new Set(selected.map((s) => s.name))
        const gone = had.filter((x) => !keep.has(x.description) && menu.some((m) => m.name === x.description)).map((x) => x.id)
        if (gone.length) await db().from('work_order_parts').delete().in('id', gone)
        const fresh = selected.filter((s) => !had.some((x) => x.description === s.name))
        const p = fresh.length === 0 ? { error: null } : await db().from('work_order_parts').insert(fresh.map((s) => ({
          work_order_id: woId, kind: 'service', description: s.name, qty: 1, unit_cost: Number(s.last_price ?? 0), supplied_by: 'mechanic',
        })))
        if (p.error) throw p.error
      }
      draft.clear()
      if (id) navigate(`/citas/${id}?cambio=1`, { replace: true })
      else navigate(`/citas/${apptId}${now ? '?cobrar=1' : ''}`, { replace: true })
    } catch (err) {
      console.error(err)
      setError('No se pudo guardar. Revisa la señal e intenta otra vez.')
      setBusy(false)
    }
  }

  if (!clients) return <Loading />

  return (
    <>
      <BackTitle>{id ? 'Cambiar cita' : now ? 'Cobrar ahora' : 'Cita nueva'}</BackTitle>
      {draft.restored && <DraftBanner onReset={() => { draft.clear(); window.location.reload() }} />}
      <form onSubmit={save} className="space-y-4">
        {/* 1. La clienta */}
        <Step n={1} title={now ? '¿A quién le cobras?' : '¿Quién viene?'}>
          {chosen ? (
            <div className="flex min-h-16 items-center gap-3 rounded-2xl bg-pink-50 px-3 py-2">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pink-600 text-lg font-extrabold text-white">{initial(chosen.full_name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold text-slate-900">{chosen.full_name}</span>
                {chosen.phone && <span className="block text-sm text-slate-600">{chosen.phone}</span>}
              </span>
              <button type="button" onClick={() => setClientId(null)} aria-label="Cambiar clienta" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 active:bg-pink-100"><X /></button>
            </div>
          ) : newClient ? (
            <div className="space-y-2 rounded-2xl bg-pink-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-pink-900">Clienta nueva</span>
                <button type="button" onClick={() => setNewClient(null)} aria-label="Cancelar clienta nueva" className="flex h-10 w-10 items-center justify-center text-slate-500"><X /></button>
              </div>
              <Input autoComplete="off" value={newClient.full_name} onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })} placeholder="Nombre *" />
              <Input type="tel" inputMode="tel" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder="Teléfono / WhatsApp" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input type="search" aria-label="Buscar clienta" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o teléfono" className="pl-12" />
              </div>
              {search.trim() && results.length === 0 && <p className="px-1 text-base font-bold text-slate-700">No encontré a “{search.trim()}”.</p>}
              <button type="button" onClick={() => setNewClient({ full_name: /\d/.test(search) ? '' : search, phone: /\d/.test(search) ? search : '' })}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-pink-50 text-base font-bold text-pink-700 active:bg-pink-100">
                <UserPlus size={20} /> {search.trim() && !/\d/.test(search) ? `Clienta nueva: ${search.trim()}` : 'Clienta nueva'}
              </button>
              {results.map((c) => (
                <button key={c.id} type="button" onClick={() => setClientId(c.id)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-slate-50 px-3 text-left active:bg-pink-50">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-100 font-extrabold text-pink-700">{initial(c.full_name)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-base font-bold text-slate-900">{c.full_name}</span>{c.phone && <span className="block text-sm text-slate-600">{c.phone}</span>}</span>
                </button>
              ))}
            </div>
          )}
        </Step>

        {/* 2. Los servicios: pestañas por tipo, botones en dos columnas; al escoger queda en una línea */}
        <Step n={2} title="¿Qué se va a hacer?" hint="opcional">
          {billed ? (
            <p className="rounded-2xl bg-amber-50 p-3 text-base text-amber-900">Esta cita ya tiene factura. Los servicios y precios se cambian en <b>La cuenta</b> de la cita.</p>
          ) : !open && selected.length === 0 ? (
            <button type="button" onClick={() => setListOpen(true)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pink-50 text-lg font-bold text-pink-700 ring-1 ring-pink-200 active:bg-pink-100"><Plus size={22} /> Escoger servicios</button>
          ) : !open ? (
            <div className="rounded-2xl bg-pink-50 p-3 ring-1 ring-pink-200" aria-label="Resumen de la cita">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-pink-600" />
                <span className="min-w-0 flex-1 text-base font-extrabold text-slate-900">{selected.map((x) => x.name).join(' + ')}</span>
              </div>
              <div className="mt-1 pl-8 text-base text-slate-700">{minutesLabel(fromServices)}{price > 0 ? ` · ${formatMoney(price)}` : ''}</div>
              <button type="button" onClick={() => setListOpen(true)} className="mt-2 min-h-11 w-full rounded-xl bg-white text-base font-bold text-pink-700 ring-1 ring-pink-200">Cambiar o añadir otro</button>
            </div>
          ) : (
            <>
              {categories.length > 1 && (
                <div className="mb-3 flex gap-2" role="tablist" aria-label="Tipo de servicio">
                  {categories.map((c) => (
                    <button key={c} type="button" role="tab" aria-selected={tab === c} onClick={() => { setCat(c); setShowAll(false) }}
                      className={`min-h-11 flex-1 rounded-full text-base font-bold ${tab === c ? 'bg-pink-600 text-white' : 'bg-pink-50 text-pink-800'}`}>{c}</button>
                  ))}
                </div>
              )}
              <div role="group" aria-label="Servicios" className="grid grid-cols-2 gap-2">
                {shown.map((m) => {
                  const on = picked.includes(m.id)
                  return (
                    <button key={m.id} type="button" onClick={() => toggle(m.id)} aria-pressed={on}
                      className={`relative flex min-h-16 flex-col justify-center rounded-2xl px-3 py-2 text-left transition ${on ? 'bg-pink-600 text-white' : 'bg-slate-50 text-slate-900 ring-1 ring-slate-200 active:bg-pink-50'}`}>
                      {on && <Check size={18} strokeWidth={3} className="absolute right-2 top-2" />}
                      <span className="pr-5 text-base font-bold leading-tight">{m.name}</span>
                      <span className={`text-sm ${on ? 'text-pink-100' : 'text-slate-500'}`}>{[m.duration_min ? minutesLabel(m.duration_min) : null, m.last_price != null ? formatMoney(Number(m.last_price)) : null].filter(Boolean).join(' · ')}</span>
                    </button>
                  )
                })}
              </div>
              {inTab.length > shown.length && (
                <button type="button" onClick={() => setShowAll(true)} className="mt-2 min-h-11 w-full text-base font-bold text-pink-700">Ver todos ({inTab.length})</button>
              )}
              {selected.length > 0 ? (
                <div className="mt-3 flex items-center gap-2 rounded-2xl bg-pink-600 py-2 pl-4 pr-2 text-white" aria-label="Resumen de la cita">
                  <span className="min-w-0 flex-1 text-base font-extrabold">{selected.length} {selected.length === 1 ? 'servicio' : 'servicios'} · {minutesLabel(fromServices)}{price > 0 && <> · {formatMoney(price)}</>}</span>
                  <button type="button" onClick={() => setListOpen(false)} className="min-h-11 shrink-0 rounded-xl bg-white px-4 text-base font-extrabold text-pink-700">Listo ✓</button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Si no sabes todavía, déjalo así. El precio lo pones al cobrar.</p>
              )}
            </>
          )}
        </Step>

        {/* 3. Con quién: los circulitos de colores de cada empleada */}
        {staff.length > 0 && (
          <Step n={3} title="¿Con quién?" hint="opcional">
            <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
              {staff.map((s) => {
                const on = staffId === s.id
                return (
                  <button key={s.id} type="button" onClick={() => setStaffId(on ? null : s.id)} aria-pressed={on} aria-label={s.name}
                    className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-2xl py-1">
                    <span className="relative flex h-14 w-14 items-center justify-center rounded-full text-xl font-extrabold transition"
                      style={on ? { backgroundColor: s.color, color: '#fff', boxShadow: `0 0 0 3px #fff, 0 0 0 6px ${s.color}` } : { backgroundColor: `${s.color}22`, color: s.color }}>
                      {initial(s.name)}
                      {on && <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white" style={{ color: s.color }}><Check size={16} strokeWidth={3} /></span>}
                    </span>
                    <span className={`max-w-full truncate text-sm ${on ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-600'}`}>{s.name}</span>
                  </button>
                )
              })}
            </div>
          </Step>
        )}

        {/* 4. Cuándo (en "Cobrar ahora" es este momento) */}
        {!now && (
          <Step n={staff.length > 0 ? 4 : 3} title="¿Cuándo?">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Día *">
                <Input type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
              </Field>
              <Field label="Hora *">
                <TimeSelect aria-label="Hora" required value={time} onChange={setTime} />
              </Field>
            </div>
            {busyThen.length > 0 && (
              <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-base text-amber-900">
                <b>{staffId ? `${staff.find((s) => s.id === staffId)?.name ?? ''} ya tiene ese día:` : 'Ese día ya hay:'}</b>
                <ul className="mt-1">{busyThen.map((x) => <li key={x.id}>{formatTime(x.starts_at)} a {formatTime(new Date(new Date(x.starts_at).getTime() + x.duration_min * 60000))} · {x.boats?.name}</li>)}</ul>
              </div>
            )}
          </Step>
        )}

        {/* Lo demás, guardado para que no estorbe */}
        <details className="group rounded-3xl bg-white px-4 ring-1 ring-pink-100">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between text-base font-bold text-slate-700">
            Nota y tiempo <span className="flex items-center gap-1 text-sm font-semibold text-slate-400">opcional <ChevronDown size={18} className="transition group-open:rotate-180" /></span>
          </summary>
          <div className="space-y-4 pb-4">
            <Field label="Nota" hint="Largo, color, diseño, lo que pidió">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Almendrado largo, color nude" />
            </Field>
            <Field label="¿Cuánto tiempo?">
              <select aria-label="¿Cuánto tiempo?" value={length ?? ''} onChange={(e) => setLength(e.target.value ? Number(e.target.value) : null)}
                className="block min-h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-lg">
                <option value="">{fromServices ? `Según los servicios (${minutesLabel(fromServices)})` : '1 hora'}</option>
                {[15, 30, 45, 60, 90, 120, 150, 180, 240].map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
              </select>
            </Field>
          </div>
        </details>

        <div className="sticky bottom-[calc(4.4rem+env(safe-area-inset-bottom))] z-10 -mx-4 bg-white/95 px-4 py-2 backdrop-blur">
          {error && <p className="mb-2 rounded-xl bg-red-100 p-3 text-base font-semibold text-red-800">{error}</p>}
          <button type="submit" disabled={busy} className="flex min-h-14 w-full flex-col items-center justify-center rounded-2xl bg-pink-600 px-3 py-1 text-white shadow-lg shadow-pink-900/20 active:bg-pink-700 disabled:opacity-60">
            <span className="text-lg font-extrabold leading-tight">{busy ? 'Guardando…' : id ? 'Guardar cambios' : now ? 'Seguir a cobrar' : 'Guardar cita'}</span>
            <span className="max-w-full truncate text-sm font-semibold text-pink-100">{[chosen?.full_name ?? newClient?.full_name?.trim() ?? null, now ? 'Ahora' : day && time ? `${formatDate(prToISO(day, time)).slice(0, 5)} · ${formatTime(prToISO(day, time))}` : null, selected.length ? minutesLabel(minutes) : null].filter(Boolean).join(' · ')}</span>
          </button>
        </div>
        <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancelar</Button>
      </form>
    </>
  )
}
