import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-navy-800 text-white active:bg-navy-900 disabled:bg-slate-400',
  secondary: 'border-2 border-navy-800 bg-white text-navy-800 active:bg-navy-50',
  ghost: 'text-navy-700 underline underline-offset-4',
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

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-base font-semibold text-slate-800">{label}</span>
      {children}
    </label>
  )
}

const INPUT = 'block min-h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-lg focus:border-navy-600 focus:outline-none'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${INPUT} ${className}`} {...props} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${INPUT} ${className}`} {...props} />
}

export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-extrabold text-navy-900">{children}</h1>
      {subtitle && <p className="mt-1 text-base text-slate-600">{subtitle}</p>}
    </div>
  )
}

/** Pantalla vacía con lo que viene en el próximo hito. */
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
