import { useCallback, useEffect, useState } from 'react'

/** Carga datos (normalmente de Supabase) con estado de cargando / error y forma de recargar. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await run())
    } catch (e) {
      console.error(e)
      setError('No se pudo cargar. Revisa la conexión e intenta otra vez.')
    } finally {
      setLoading(false)
    }
  }, [run])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, loading, error, reload, setData }
}

/** Lanza el error de Supabase para que useLoad lo muestre. */
export function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}

/** '' -> null, para guardar campos vacíos como vacíos. */
export function blank(v: string): string | null {
  const t = v.trim()
  return t === '' ? null : t
}

export function num(v: string): number | null {
  const t = v.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
