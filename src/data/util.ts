import type { Category, Timeframe } from './types'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const TIMEFRAMES: Timeframe[] = [
  { id: '1m', label: '1m', ms: MIN, period: { type: 'minute', span: 1 } },
  { id: '5m', label: '5m', ms: 5 * MIN, period: { type: 'minute', span: 5 } },
  { id: '15m', label: '15m', ms: 15 * MIN, period: { type: 'minute', span: 15 } },
  { id: '30m', label: '30m', ms: 30 * MIN, period: { type: 'minute', span: 30 } },
  { id: '1h', label: '1H', ms: HOUR, period: { type: 'hour', span: 1 } },
  { id: '4h', label: '4H', ms: 4 * HOUR, period: { type: 'hour', span: 4 } },
  { id: '1d', label: '1D', ms: DAY, period: { type: 'day', span: 1 } },
  { id: '1w', label: '1S', ms: 7 * DAY, period: { type: 'week', span: 1 } }
]

export function timeframeById(id: string): Timeframe {
  return TIMEFRAMES.find(t => t.id === id) ?? TIMEFRAMES[4]
}

/** "0.01000000" -> 2, "1" -> 0, "0.5" -> 1 */
export function decimalsFromStep(step: string | number): number {
  const s = typeof step === 'number' ? step.toString() : step
  if (/e-/i.test(s)) return Number(s.split(/e-/i)[1]) || 0
  const dot = s.indexOf('.')
  if (dot < 0) return 0
  return s.slice(dot + 1).replace(/0+$/, '').length
}

export async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).host}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Classification of non-crypto markets by their base name
// ---------------------------------------------------------------------------

interface Known {
  category: Category
  name: string
  aliases?: string[]
}

const KNOWN: Record<string, Known> = {
  // Indices (and index ETFs)
  XYZ100: { category: 'index', name: 'Sigue al Nasdaq-100', aliases: ['NASDAQ', 'NAS100', 'US100', 'NDX', 'NQ', 'USTEC'] },
  SP500: { category: 'index', name: 'Sigue al S&P 500', aliases: ['SPX500', 'US500', 'ES', 'S&P'] },
  QQQ: { category: 'index', name: 'ETF Nasdaq-100 (QQQ)', aliases: ['NASDAQ', 'NAS100', 'US100'] },
  SPY: { category: 'index', name: 'ETF S&P 500 (SPY)', aliases: ['US500', 'S&P'] },
  IWM: { category: 'index', name: 'ETF Russell 2000 (IWM)', aliases: ['RUSSELL', 'US2000'] },
  JP225: { category: 'index', name: 'Japón 225', aliases: ['NIKKEI', 'JPN225'] },
  KR200: { category: 'index', name: 'Corea 200', aliases: ['KOSPI'] },
  KODEX200: { category: 'index', name: 'ETF Corea 200 (KODEX)', aliases: ['KOSPI'] },
  NIFTY: { category: 'index', name: 'India Nifty 50', aliases: ['NIFTY50', 'INDIA'] },
  IBOV: { category: 'index', name: 'Brasil Ibovespa', aliases: ['BOVESPA'] },
  DXY: { category: 'index', name: 'Índice del dólar', aliases: ['USDX', 'DOLAR'] },
  VIX: { category: 'index', name: 'Índice de volatilidad', aliases: ['VOLATILIDAD'] },
  EWY: { category: 'index', name: 'ETF Corea del Sur (EWY)' },
  EWJ: { category: 'index', name: 'ETF Japón (EWJ)' },
  EWZ: { category: 'index', name: 'ETF Brasil (EWZ)' },
  EWT: { category: 'index', name: 'ETF Taiwán (EWT)' },
  // Metals
  XAU: { category: 'metal', name: 'Oro', aliases: ['XAUUSD', 'GOLD', 'ORO'] },
  GOLD: { category: 'metal', name: 'Oro', aliases: ['XAUUSD', 'XAU', 'ORO'] },
  XAG: { category: 'metal', name: 'Plata', aliases: ['XAGUSD', 'SILVER', 'PLATA'] },
  SILVER: { category: 'metal', name: 'Plata', aliases: ['XAGUSD', 'XAG', 'PLATA'] },
  XPT: { category: 'metal', name: 'Platino', aliases: ['XPTUSD', 'PLATINUM', 'PLATINO'] },
  PLATINUM: { category: 'metal', name: 'Platino', aliases: ['XPTUSD', 'XPT', 'PLATINO'] },
  XPD: { category: 'metal', name: 'Paladio', aliases: ['XPDUSD', 'PALLADIUM', 'PALADIO'] },
  PALLADIUM: { category: 'metal', name: 'Paladio', aliases: ['XPDUSD', 'XPD', 'PALADIO'] },
  COPPER: { category: 'metal', name: 'Cobre', aliases: ['HG', 'COBRE', 'XCUUSD'] },
  ALUMINIUM: { category: 'metal', name: 'Aluminio', aliases: ['ALUMINUM', 'ALUMINIO'] },
  // Energy
  CL: { category: 'energy', name: 'Petróleo WTI', aliases: ['WTI', 'USOIL', 'OIL', 'PETROLEO'] },
  BZ: { category: 'energy', name: 'Petróleo Brent', aliases: ['BRENT', 'UKOIL', 'PETROLEO'] },
  BRENTOIL: { category: 'energy', name: 'Petróleo Brent', aliases: ['BRENT', 'UKOIL', 'BZ', 'PETROLEO'] },
  NATGAS: { category: 'energy', name: 'Gas natural', aliases: ['NG', 'GAS'] },
  TTF: { category: 'energy', name: 'Gas natural europeo (TTF)', aliases: ['GAS'] },
  HO: { category: 'energy', name: 'Heating oil', aliases: ['DIESEL'] },
  URANIUM: { category: 'energy', name: 'Uranio', aliases: ['URANIO'] },
  // Agriculture
  CORN: { category: 'agri', name: 'Maíz', aliases: ['MAIZ'] },
  WHEAT: { category: 'agri', name: 'Trigo', aliases: ['TRIGO'] },
  // FX
  EUR: { category: 'fx', name: 'EUR/USD', aliases: ['EURUSD'] },
  GBP: { category: 'fx', name: 'GBP/USD', aliases: ['GBPUSD'] },
  JPY: { category: 'fx', name: 'USD/JPY', aliases: ['USDJPY'] },
  KRW: { category: 'fx', name: 'USD/KRW', aliases: ['USDKRW'] },
  EURUSD: { category: 'fx', name: 'EUR/USD', aliases: ['EUR'] },
  GBPUSD: { category: 'fx', name: 'GBP/USD', aliases: ['GBP'] },
  USDJPY: { category: 'fx', name: 'USD/JPY', aliases: ['JPY'] },
  USDBRL: { category: 'fx', name: 'USD/BRL', aliases: ['BRL'] }
}

export function classify(base: string, fallback: Category): Known {
  return KNOWN[base.toUpperCase()] ?? { category: fallback, name: base }
}

export const CATEGORY_LABEL: Record<Category, string> = {
  crypto: 'Cripto',
  index: 'Índices',
  metal: 'Metales',
  energy: 'Energía',
  agri: 'Agro',
  fx: 'Forex',
  stock: 'Acciones'
}

// ---------------------------------------------------------------------------
// WebSocket that reconnects by itself until closed on purpose
// ---------------------------------------------------------------------------

export class LiveSocket {
  private ws: WebSocket | null = null
  private closed = false
  private retry = 0
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private url: string,
    private onOpen: (ws: WebSocket) => void,
    private onMessage: (data: unknown) => void,
    private ping?: { message: string; everyMs: number }
  ) {
    this.connect()
  }

  private connect(): void {
    if (this.closed) return
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.onOpen(ws)
      if (this.ping) {
        const { message, everyMs } = this.ping
        this.pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(message), everyMs)
      }
    }
    ws.onmessage = ev => {
      try {
        this.onMessage(JSON.parse(ev.data as string))
      } catch {
        /* ignore non-JSON frames */
      }
    }
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer)
      this.pingTimer = null
      if (this.closed) return
      const delay = Math.min(10_000, 1000 * 2 ** this.retry++)
      this.reconnectTimer = setTimeout(() => this.connect(), delay)
    }
    ws.onerror = () => ws.close()
  }

  close(): void {
    this.closed = true
    if (this.pingTimer) clearInterval(this.pingTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}
