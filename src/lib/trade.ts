import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { db } from './db'

/** A qué se dedica el negocio: cambia las palabras del app y qué secciones salen. */
export type Trade = 'marine' | 'beauty' | 'ac' | 'plumbing' | 'electrical' | 'auto' | 'general'

export const TRADES: { value: Trade; label: string; emoji: string }[] = [
  { value: 'beauty', label: 'Uñas, salón y spa', emoji: '💅' },
  { value: 'marine', label: 'Botes y jet skis', emoji: '🚤' },
  { value: 'ac', label: 'Aire acondic.', emoji: '❄️' },
  { value: 'plumbing', label: 'Plomería', emoji: '🔧' },
  { value: 'electrical', label: 'Electricidad', emoji: '⚡' },
  { value: 'auto', label: 'Mecánica de autos', emoji: '🚗' },
  { value: 'general', label: 'Otro servicio', emoji: '🛠️' },
]

/** El nombre del app para todos (la puerta de entrada). Los de botes ven además su edición marina. */
export const APP_NAME = 'FacturaFácil PR'
export const APP_TAGLINE = 'Citas, facturas y cobros desde el celular'
export const APP_LOGO = '/logo-ff.svg'

export interface Words {
  trade: Trade
  /** Nombre del app que ve este negocio */
  appName: string
  appLogo: string
  /** Lo que se atiende: bote, carro, equipo, propiedad */
  item: string
  Item: string
  items: string
  Items: string
  /** "Bote nuevo" / "Propiedad nueva" */
  newItem: string
  /** "Sin bote todavía" */
  noItem: string
  /** "del bote" / "de la propiedad" */
  delItem: string
  /** "el bote" / "la propiedad" */
  elItem: string
  /** Marca / modelo / año tienen sentido (bote, carro, equipo; no una casa) */
  hasMakeModel: boolean
  /** "Bote de Ana" */
  itemOf: (name: string) => string
  /** Ejemplo para el nombre: "La Tranquila" / "Casa de la playa" */
  itemExample: string
  /** Secciones que solo tienen sentido en botes */
  engines: boolean
  seaTrial: boolean
  marina: boolean
  /** Quién trabaja: "mecánico" / "técnico" */
  worker: string
  /** Salón: el cliente es la persona (no hay bote, carro ni equipo), citas con servicios y empleadas */
  salon: boolean
  /** Palabra para el cliente: "cliente" / "clienta" */
  client: string
  Client: string
  clients: string
  Clients: string
}

const female = (w: string) => w === 'propiedad'

function build(trade: Trade, item: string, items: string, itemExample: string, worker: string): Words {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const marine = trade === 'marine'
  return {
    trade,
    appName: APP_NAME,
    appLogo: APP_LOGO,
    item,
    Item: cap(item),
    items,
    Items: cap(items),
    newItem: `${cap(item)} ${female(item) ? 'nueva' : 'nuevo'}`,
    noItem: `Sin ${item} todavía`,
    delItem: female(item) ? `de la ${item}` : `del ${item}`,
    elItem: female(item) ? `la ${item}` : `el ${item}`,
    hasMakeModel: item !== 'propiedad',
    itemOf: (name) => `${cap(item)} de ${name}`,
    itemExample,
    engines: marine,
    seaTrial: marine,
    marina: marine,
    worker,
    salon: trade === 'beauty',
    client: trade === 'beauty' ? 'clienta' : 'cliente',
    Client: trade === 'beauty' ? 'Clienta' : 'Cliente',
    clients: trade === 'beauty' ? 'clientas' : 'clientes',
    Clients: trade === 'beauty' ? 'Clientas' : 'Clientes',
  }
}

export function wordsFor(trade: Trade | null | undefined): Words {
  switch (trade) {
    case 'beauty': return build('beauty', 'clienta', 'clientas', 'Ana Martínez', 'estilista')
    case 'ac': return build('ac', 'equipo', 'equipos', 'Unidad de la sala (24,000 BTU)', 'técnico')
    case 'plumbing': return build('plumbing', 'propiedad', 'propiedades', 'Casa en Bayamón', 'plomero')
    case 'electrical': return build('electrical', 'propiedad', 'propiedades', 'Local comercial', 'electricista')
    case 'auto': return build('auto', 'carro', 'carros', 'Toyota Corolla 2018', 'mecánico')
    case 'general': return build('general', 'propiedad', 'propiedades', 'Casa de la familia Rivera', 'técnico')
    default: return build('marine', 'bote', 'botes', 'La Tranquila', 'mecánico')
  }
}

const KEY = 'tipo-de-negocio'
const TradeContext = createContext<{ words: Words; setTrade: (t: Trade) => void }>({ words: wordsFor('marine'), setTrade: () => {} })

/** Carga una sola vez a qué se dedica el negocio (y lo recuerda en el teléfono para que no parpadee). */
export function TradeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [trade, setTradeState] = useState<Trade>(() => {
    try { return (localStorage.getItem(KEY) as Trade) || 'marine' } catch { return 'marine' }
  })
  const setTrade = (t: Trade) => {
    setTradeState(t)
    try { localStorage.setItem(KEY, t) } catch { /* sin memoria: no pasa nada */ }
  }
  useEffect(() => {
    const uid = session?.user.id
    if (!uid) return
    db().from('mechanics').select('business_type').eq('profile_id', uid).maybeSingle().then(({ data }) => {
      const t = (data as { business_type?: Trade } | null)?.business_type
      if (t) setTrade(t)
    })
  }, [session?.user.id])
  return createElement(TradeContext.Provider, { value: { words: wordsFor(trade), setTrade } }, children)
}

/** Las palabras de este negocio. */
export function useWords(): Words {
  return useContext(TradeContext).words
}

/** Para cambiar el tipo de negocio desde Mi negocio (el app se ajusta enseguida). */
export function useSetTrade() {
  return useContext(TradeContext).setTrade
}

/** Trabajos típicos de cada oficio (sugerencias al escribir) y un ejemplo de problema. */
export const JOB_IDEAS: Record<Trade, string[]> = {
  beauty: ['Uñas acrílicas (set completo)', 'Relleno de acrílico', 'Uñas de gel (set)', 'Manicura con gel', 'Pedicura', 'Pedicura spa', 'Corte de dama', 'Blower', 'Tinte', 'Masaje relajante (60 min)', 'Facial'],
  marine: [
    'Servicio de 100 horas', 'Cambio de aceite y filtros', 'Diagnóstico', 'Cambio de impeller', 'Cambio de bujías',
    'Servicio de pata (lower unit)', 'Revisión eléctrica', 'Instalación de GPS / electrónica', 'Reparación de windlass',
    'Servicio de generador', 'Servicio de aire acondicionado', 'Cambio de baterías', 'Reparación de bomba de achique',
    'Servicio de dirección hidráulica', 'Prueba en el agua',
  ],
  ac: ['Mantenimiento de unidad', 'Limpieza de unidad', 'No enfría', 'Recarga de gas', 'Instalación de mini split', 'Cambio de capacitor', 'Diagnóstico', 'Reparación de salidero de agua'],
  plumbing: ['Salidero', 'Destape', 'Instalación de inodoro', 'Calentador de agua', 'Cambio de llave', 'Reparación de tubería', 'Diagnóstico', 'Cisterna / bomba de agua'],
  electrical: ['Breaker se dispara', 'Instalación de abanico', 'Instalación de tomacorriente', 'Revisión del panel', 'Instalación de lámparas', 'Generador / planta', 'Diagnóstico', 'Certificación eléctrica'],
  auto: ['Cambio de aceite', 'Frenos', 'Diagnóstico (scanner)', 'Batería', 'Alineación y balanceo', 'Aire acondicionado del carro', 'Suspensión', 'Afinamiento'],
  general: ['Visita y diagnóstico', 'Reparación', 'Instalación', 'Mantenimiento', 'Estimado'],
}

export const PROBLEM_EXAMPLE: Record<Trade, string> = {
  beauty: 'Lo que pidió la clienta (largo, color, diseño…)',
  marine: 'El motor de babor no arranca en frío',
  ac: 'La unidad de la sala no enfría',
  plumbing: 'Salidero debajo del fregadero',
  electrical: 'El breaker de la cocina se dispara',
  auto: 'Los frenos chillan al parar',
  general: 'Lo que le dijo el cliente',
}
