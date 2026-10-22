import { useEffect } from 'react'
import { BellRing, CalendarDays, Camera, CheckCircle2, FileText, Gift, Globe, HandCoins, Palette, Receipt, ShieldCheck, Smartphone, Sparkles, Users, Wallet, Zap, type LucideIcon } from 'lucide-react'

const FB = 'https://www.facebook.com/profile.php?id=61595681820713'

/** Una pantalla del app dentro de un teléfono. */
function Phone({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`shrink-0 rounded-[2.2rem] bg-slate-900 p-2 shadow-2xl shadow-black/30 ${className}`}>
      <img src={src} alt={alt} className="block w-full rounded-[1.7rem]" />
    </div>
  )
}

function Feature({ icon: Icon, title, text, tone = 'bg-blue-50 text-blue-700' }: { icon: LucideIcon; title: string; text: string; tone?: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}><Icon size={26} /></span>
      <h3 className="mt-3 text-lg font-extrabold text-slate-900">{title}</h3>
      <p className="mt-1 text-base leading-snug text-slate-600">{text}</p>
    </div>
  )
}

const TRADES: { emoji: string; name: string; text: string }[] = [
  { emoji: '💅', name: 'Salones, uñas y spa', text: 'Citas por empleada, menú de servicios, propinas, comisiones, tarjetas de regalo y citas por internet.' },
  { emoji: '🚤', name: 'Mecánicos de botes', text: 'Botes y motores, marina y muelle, piezas, estimados, prueba en el agua y próximo servicio.' },
  { emoji: '🚗', name: 'Mecánica de autos', text: 'Carros con marca y modelo, piezas y mano de obra, estimados y cambio de aceite.' },
  { emoji: '❄️', name: 'Aire acondicionado', text: 'Equipos de cada cliente, mantenimientos y recordatorio de la próxima limpieza.' },
  { emoji: '🔧', name: 'Plomería', text: 'Propiedades de cada cliente, materiales, visitas y estimados que el cliente aprueba.' },
  { emoji: '⚡', name: 'Electricidad', text: 'Trabajos por propiedad, materiales, estimados y facturas con IVU.' },
  { emoji: '🛠️', name: 'Todo servicio en la calle', text: 'Si trabajas por cita y cobras por servicio, el app se adapta a tus palabras.' },
]

/**
 * Página informativa de FacturaFácil PR (pública, sin cuenta): qué hace el app,
 * cómo se adapta a cada negocio de servicio, y cómo probarlo.
 */
export default function Landing() {
  useEffect(() => {
    document.title = 'FacturaFácil PR · Citas, facturas y cobros desde el celular'
  }, [])

  return (
    <div className="min-h-dvh overflow-x-hidden bg-slate-50 text-slate-900">
      {/* Arriba */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b1220]/95 text-white backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <img src="/logo-ff.svg" alt="" className="h-10 w-10 rounded-xl" />
          <span className="text-base font-extrabold sm:text-lg">FacturaFácil PR</span>
          <nav className="ml-auto flex items-center gap-2">
            <a href="#negocios" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-white/80 hover:text-white sm:block">Negocios</a>
            <a href="#funciones" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-white/80 hover:text-white sm:block">Qué hace</a>
            <a href="/" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-white/90 hover:text-white sm:block">Entrar</a>
            <a href="/demo" className="whitespace-nowrap rounded-full bg-[#f97316] px-4 py-2 text-sm font-extrabold text-white shadow-lg shadow-orange-900/30">Pruébalo gratis</a>
          </nav>
        </div>
      </header>

      {/* Portada */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#12307e] to-[#1d4ed8] text-white">
        <div aria-hidden="true" className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10" />
        <div aria-hidden="true" className="absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-orange-400/15" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 md:grid-cols-2 md:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-bold ring-1 ring-white/20">Hecho en Puerto Rico · en español</span>
            <h1 className="mt-4 text-[2.4rem] font-black leading-[1.05] tracking-tight sm:text-6xl">
              Tu negocio de servicio, <span className="text-orange-300">en el celular.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-blue-100 sm:text-xl">
              Citas, clientes, facturas con IVU y cobros por ATH Móvil. Sin libreta, sin papeles y sin bajar nada de la tienda.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="/demo" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#f97316] px-5 text-base font-extrabold text-white shadow-xl shadow-orange-900/30 hover:bg-orange-600 sm:w-auto sm:text-lg">
                <Sparkles size={22} /> Pruébalo gratis, sin registrarte
              </a>
              <a href="/" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-6 text-base font-bold text-white ring-1 ring-white/30 hover:bg-white/20 sm:w-auto sm:text-lg">
                Crear mi cuenta
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-blue-100 sm:text-base">
              {['Funciona en iPhone y Android', 'Facturas por WhatsApp', 'Solo tú ves tus clientes'].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><CheckCircle2 size={18} className="text-emerald-300" /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="flex justify-center gap-4 md:justify-end">
            <Phone src="/info/m1-inicio.webp" alt="Inicio del app para un mecánico" className="mt-10 w-36 sm:w-52" />
            <Phone src="/info/1-inicio.webp" alt="Inicio del app para un salón" className="w-40 sm:w-60" />
          </div>
        </div>
      </section>

      {/* Se adapta a tu negocio */}
      <section id="negocios" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <h2 className="text-center text-3xl font-black sm:text-4xl">Se adapta a <span className="text-blue-700">tu negocio</span></h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-lg text-slate-600">
          Al crear tu cuenta escoges a qué te dedicas y el app cambia sus palabras, sus pantallas y hasta sus colores para tu oficio.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TRADES.map((t) => (
            <div key={t.name} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="text-4xl">{t.emoji}</div>
              <h3 className="mt-2 text-xl font-extrabold">{t.name}</h3>
              <p className="mt-1 text-base text-slate-600">{t.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Lo que hace */}
      <section id="funciones" className="scroll-mt-20 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-black sm:text-4xl">Todo lo que necesitas, <span className="text-orange-500">nada que te enrede</span></h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-lg text-slate-600">Botones grandes y pocos pasos, para usarlo con una mano en medio del trabajo.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={CalendarDays} title="Citas y agenda" text="Mes y semana, cada cita con su cliente, la hora y lo que se va a hacer. Muévelas o cancélalas con un toque." />
            <Feature icon={Zap} title="Factura rápida" text="¿Terminaste un trabajo sin cita? Haz la factura en segundos y cobra en el momento." tone="bg-orange-50 text-orange-600" />
            <Feature icon={FileText} title="Estimados que el cliente aprueba" text="Le llega por WhatsApp, lo aprueba con un botón y te avisa. Queda guardado cuándo y qué aceptó." tone="bg-amber-50 text-amber-700" />
            <Feature icon={Smartphone} title="Cobra con ATH Móvil" text="También efectivo, cheque o tarjeta. Depósitos y pagos por partes: el app lleva el balance sola." tone="bg-orange-50 text-orange-600" />
            <Feature icon={Receipt} title="Facturas con IVU" text="Con tu logo, por WhatsApp o en PDF. El IVU se calcula solo y lo puedes quitar cuando no aplica." tone="bg-emerald-50 text-emerald-700" />
            <Feature icon={Wallet} title="Sabes quién te debe" text="Lo que te deben, la factura más nueva primero, y un botón para recordarle al cliente con cariño." tone="bg-red-50 text-red-600" />
            <Feature icon={BellRing} title="Próximo servicio" text="Al terminar, dices cuándo le toca volver. El app te avisa y le escribes con un toque." tone="bg-violet-50 text-violet-700" />
            <Feature icon={Camera} title="Fotos del trabajo" text="Antes y después (y la pieza vieja y la nueva). Quedan en el historial de cada cliente." tone="bg-sky-50 text-sky-700" />
            <Feature icon={Palette} title="Con tu marca" text="Tu logo, tu color y tus políticas salen en cada estimado y factura." tone="bg-pink-50 text-pink-600" />
          </div>
        </div>
      </section>

      {/* Salones */}
      <section className="bg-gradient-to-br from-pink-500 via-pink-600 to-fuchsia-800 py-16 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-2">
          <div>
            <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">💅 Para salones de belleza, uñas y spa</span>
            <h2 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">Todo tu salón en el celular</h2>
            <ul className="mt-6 space-y-3 text-lg">
              {[
                [Globe, 'Citas por internet: tu link para que tus clientas escojan su hora solas'],
                [BellRing, 'Recordatorio de la cita de mañana por WhatsApp con un toque'],
                [HandCoins, 'Cobra con propina y pide depósito para separar la cita'],
                [Users, 'Agenda y comisiones de cada empleada, por semana o por mes'],
                [Gift, 'Tarjetas de regalo: véndelas y úsalas al cobrar'],
              ].map(([Icon, t]) => {
                const I = Icon as LucideIcon
                return <li key={t as string} className="flex gap-3"><I className="mt-1 shrink-0 text-pink-200" size={22} /> <span>{t as string}</span></li>
              })}
            </ul>
          </div>
          <div className="flex justify-center gap-3 md:justify-end">
            <Phone src="/info/6-link.webp" alt="Link para pedir cita por internet" className="w-36 sm:w-52" />
            <Phone src="/info/3-cobrar.webp" alt="Cobrar con propina" className="mt-8 w-36 sm:w-52" />
            <Phone src="/info/5-empleadas.webp" alt="Comisiones de las empleadas" className="hidden w-52 lg:block" />
          </div>
        </div>
      </section>

      {/* Cómo empezar */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-black sm:text-4xl">Empieza en 1 minuto</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ['1', 'Crea tu cuenta', 'Tu nombre, tu negocio, tu teléfono y a qué te dedicas. Sin aprobaciones ni papeleo.'],
            ['2', 'Mira los ejemplos', 'Tu cuenta empieza con ejemplos de tu oficio para que veas cómo funciona. Los borras con un botón.'],
            ['3', 'Trabaja y cobra', 'Haz tus citas, manda tus facturas por WhatsApp y cobra por ATH Móvil.'],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-700 text-xl font-black text-white">{n}</span>
              <h3 className="mt-3 text-xl font-extrabold">{t}</h3>
              <p className="mt-1 text-base text-slate-600">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex justify-center gap-3">
          <Phone src="/info/2-cita.webp" alt="Hacer una cita" className="w-28 sm:w-48" />
          <Phone src="/info/4-factura.webp" alt="La factura que recibe el cliente" className="w-28 sm:w-48" />
          <Phone src="/info/m2-factura-rapida.webp" alt="Factura rápida" className="w-28 sm:w-48" />
        </div>
      </section>

      {/* Preguntas */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-black sm:text-4xl">Preguntas</h2>
          <div className="mt-8 space-y-3">
            {[
              ['¿Hay que bajar algo de la tienda?', 'No. Se abre en el navegador del celular y lo añades a tu pantalla como una app (en iPhone: Compartir → “Añadir a pantalla de inicio”).'],
              ['¿Funciona en iPhone y Android?', 'Sí, en los dos, y también en la computadora.'],
              ['¿Quién ve mis clientes y mis facturas?', 'Solo tú. Cada negocio ve lo suyo y nadie más.'],
              ['¿Mis clientes tienen que bajar algo?', 'No. Reciben la factura, el estimado o el link de citas por WhatsApp y lo abren sin cuenta.'],
              ['¿Cuánto cuesta?', 'Ahora mismo lo puedes usar gratis mientras lo pruebas.'],
              ['¿Lo puedo probar antes?', 'Sí: toca “Pruébalo gratis” y entras a un negocio de ejemplo sin registrarte.'],
            ].map(([q, a]) => (
              <details key={q} className="group rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <summary className="cursor-pointer list-none text-lg font-bold text-slate-900">{q}</summary>
                <p className="mt-2 text-base text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final */}
      <section className="bg-gradient-to-br from-[#0b1220] via-[#12307e] to-[#1d4ed8] py-16 text-center text-white">
        <div className="mx-auto max-w-3xl px-4">
          <ShieldCheck size={44} className="mx-auto text-orange-300" />
          <h2 className="mt-3 text-3xl font-black sm:text-5xl">Deja la libreta. Cobra más rápido.</h2>
          <p className="mt-3 text-lg text-blue-100">Pruébalo hoy con un negocio de ejemplo o crea tu cuenta en un minuto.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href="/demo" className="flex min-h-14 items-center gap-2 rounded-2xl bg-[#f97316] px-6 text-lg font-extrabold text-white shadow-xl shadow-orange-900/30 hover:bg-orange-600"><Sparkles size={22} /> Pruébalo gratis</a>
            <a href="/" className="flex min-h-14 items-center rounded-2xl bg-white/10 px-6 text-lg font-bold text-white ring-1 ring-white/30 hover:bg-white/20">Crear mi cuenta</a>
          </div>
        </div>
      </section>

      <footer className="bg-[#0b1220] py-8 text-center text-sm text-slate-400">
        <div className="flex items-center justify-center gap-2">
          <img src="/logo-ff.svg" alt="" className="h-6 w-6 rounded" />
          <span className="font-bold text-slate-200">FacturaFácil PR</span>
        </div>
        <p className="mt-2">Hecho en Puerto Rico · Powered by Francisco Santiago (Joy)</p>
        <p className="mt-2"><a href={FB} target="_blank" rel="noreferrer" className="font-semibold text-slate-200 underline">Síguenos en Facebook</a></p>
      </footer>
    </div>
  )
}
