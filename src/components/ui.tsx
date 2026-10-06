import { Children, isValidElement, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronLeft, ChevronRight, Loader2, Plus, type LucideIcon } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-navy-800 text-white active:bg-navy-900 disabled:bg-slate-400',
  secondary: 'border-2 border-navy-800 bg-white text-navy-800 active:bg-navy-50',
  ghost: 'text-navy-700 underline underline-offset-4',
  danger: 'border-2 border-red-700 bg-white text-red-700 active:bg-red-50',
}

/** Botón grande (mínimo 56 px) para usarlo con una mano en el muelle. */
export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-5 text-lg font-bold ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  )
}

/** Enlace con aspecto de botón (llamar, WhatsApp, mapas). */
export function LinkButton({ href, children, variant = 'secondary', external }: { href: string; children: ReactNode; variant?: ButtonVariant; external?: boolean }) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={`flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-base font-bold ${BUTTON_STYLES[variant]}`}
    >
      {children}
    </a>
  )
}

/**
 * Etiqueta + campo. Con un solo campo de texto se usa <label> (tocar el título enfoca el campo).
 * Con botones adentro (opciones, buscador, mapa) se usa <div>: en iPhone un <label> con botones
 * puede mandar el toque al primer campo en vez de al botón.
 */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const items = Children.toArray(children)
  const single = items.length === 1 && isValidElement(items[0]) && [Input, Select, Textarea].includes(items[0].type as never)
  const body = (
    <>
      <span className="mb-1 block text-base font-semibold text-slate-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-slate-500">{hint}</span>}
    </>
  )
  return single ? <label className="block">{body}</label> : <div role="group" aria-label={label} className="block">{body}</div>
}

const INPUT = 'block min-h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-lg focus:border-navy-600 focus:outline-none'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${INPUT} ${className}`} {...props} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${INPUT} ${className}`} {...props} />
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} className={`${INPUT} py-3 ${className}`} {...props} />
}

/** Sugerencias para un Input (list="id"). */
export function Suggestions({ id, values }: { id: string; values: readonly string[] }) {
  return (
    <datalist id={id}>
      {values.map((v) => <option key={v} value={v} />)}
    </datalist>
  )
}

/** Escoger una opción con botones grandes. */
export function Choice<T extends string | number>({ value, onChange, options, columns = 2 }: {
  value: T | null
  onChange: (v: T) => void
  options: readonly { value: T; label: string; hint?: string }[]
  columns?: 1 | 2 | 3
}) {
  const cols = columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-3' : 'grid-cols-2'
  return (
    <div className={`grid gap-2 ${cols}`}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-14 rounded-xl border-2 px-3 py-2 text-left text-base font-semibold ${
            value === o.value ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-300 bg-white text-slate-800'
          }`}
        >
          {o.label}
          {o.hint && <span className={`block text-sm font-normal ${value === o.value ? 'text-navy-100' : 'text-slate-500'}`}>{o.hint}</span>}
        </button>
      ))}
    </div>
  )
}

/** Escoger varias opciones (chips). */
export function MultiChoice({ value, onChange, options }: { value: string[]; onChange: (v: string[]) => void; options: readonly { value: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={`min-h-12 rounded-full border-2 px-4 text-base font-semibold ${on ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-300 bg-white text-slate-800'}`}
          >
            {on ? '✓ ' : ''}{o.label}
          </button>
        )
      })}
    </div>
  )
}

export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-extrabold text-navy-900">{children}</h1>
      {subtitle && <p className="mt-1 text-base text-slate-600">{subtitle}</p>}
    </div>
  )
}

/** Título con flecha para volver (pantallas de detalle y formularios). */
export function BackTitle({ children, subtitle, to }: { children: ReactNode; subtitle?: string; to?: string }) {
  const navigate = useNavigate()
  return (
    <div className="mb-5 flex items-start gap-2">
      <button
        type="button"
        aria-label="Volver"
        onClick={() => (to ? navigate(to) : navigate(-1))}
        className="-ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-navy-800 active:bg-navy-50"
      >
        <ChevronLeft size={30} />
      </button>
      <div className="min-w-0 pt-1">
        <h1 className="text-2xl font-extrabold leading-tight text-navy-900">{children}</h1>
        {subtitle && <p className="mt-1 text-base text-slate-600">{subtitle}</p>}
      </div>
    </div>
  )
}

/** Tarjeta que lleva a otra pantalla. */
export function RowLink({ to, title, subtitle, right, icon: Icon }: { to: string; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; icon?: LucideIcon }) {
  return (
    <Link to={to} className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 active:bg-slate-50">
      {Icon && <Icon size={26} className="shrink-0 text-navy-700" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-lg font-bold text-slate-900">{title}</div>
        {subtitle && <div className="truncate text-base text-slate-600">{subtitle}</div>}
      </div>
      {right}
      <ChevronRight size={22} className="shrink-0 text-slate-400" />
    </Link>
  )
}

/** Encabezado de sección con botón para añadir. */
export function SectionHeader({ title, addTo, addLabel }: { title: string; addTo?: string; addLabel?: string }) {
  return (
    <div className="mb-2 mt-7 flex items-center justify-between gap-2">
      <h2 className="text-xl font-extrabold text-navy-900">{title}</h2>
      {addTo && (
        <Link to={addTo} className="flex min-h-12 items-center gap-1 rounded-xl bg-navy-50 px-3 text-base font-bold text-navy-800 active:bg-navy-100">
          <Plus size={20} /> {addLabel ?? 'Añadir'}
        </Link>
      )}
    </div>
  )
}

/** Datos en filas "etiqueta: valor" (solo muestra los que tienen valor). */
export function InfoList({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (shown.length === 0) return null
  return (
    <dl className="rounded-2xl border-2 border-slate-200 bg-white px-4">
      {shown.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 border-b border-slate-200 py-3 last:border-0">
          <dt className="text-base text-slate-600">{label}</dt>
          <dd className="text-right text-base font-semibold text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Loading() {
  return (
    <div className="flex justify-center py-12 text-navy-700">
      <Loader2 size={36} className="animate-spin" />
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="space-y-3 rounded-xl bg-red-100 p-4 text-base font-semibold text-red-800">
      <p>{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Intentar otra vez</Button>}
    </div>
  )
}

/** El botón principal de cada pantalla: grande, centrado y encima de las pestañas, para que se vea enseguida. */
export function Fab({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="fixed bottom-[5.5rem] right-4 z-10 flex min-h-16 items-center gap-2 whitespace-nowrap rounded-full bg-sun-400 px-8 text-xl font-extrabold text-navy-900 shadow-xl ring-4 ring-white active:bg-sun-500"
    >
      <Plus size={28} strokeWidth={3} /> {label}
    </Link>
  )
}

/** Pantalla vacía. */
export function EmptyState({ icon: Icon, title, text, milestone }: { icon: LucideIcon; title: string; text: string; milestone?: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 px-6 py-10 text-center">
      <Icon size={48} className="mx-auto text-navy-600" />
      <h2 className="mt-3 text-xl font-bold text-slate-900">{title}</h2>
      <p className="mt-2 text-base text-slate-600">{text}</p>
      {milestone && <p className="mt-4 inline-block rounded-full bg-sun-400 px-3 py-1 text-sm font-bold text-navy-900">{milestone}</p>}
    </div>
  )
}

/** Barra de guardar al final de un formulario. */
export function FormActions({ busy, saveLabel = 'Guardar', error, onCancel }: { busy: boolean; saveLabel?: string; error?: string; onCancel?: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="space-y-3 pt-4">
      {error && <p className="rounded-xl bg-red-100 p-4 text-base font-semibold text-red-800">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : saveLabel}</Button>
      <Button type="button" variant="ghost" onClick={onCancel ?? (() => navigate(-1))}>Cancelar</Button>
    </div>
  )
}

/** Casilla grande de sí / no. */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-2 text-left ${checked ? 'border-navy-800 bg-navy-50' : 'border-slate-300 bg-white'}`}
    >
      <span className={`flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition ${checked ? 'bg-navy-800' : 'bg-slate-300'}`}>
        <span className={`h-6 w-6 rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : ''}`} />
      </span>
      <span className="flex-1">
        <span className="block text-base font-semibold text-slate-900">{label}</span>
        {hint && <span className="block text-sm text-slate-500">{hint}</span>}
      </span>
    </button>
  )
}

/** Etiqueta de estado (cita, trabajo). */
export function Pill({ label, style }: { label: string; style: string }) {
  return <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${style}`}>{label}</span>
}
