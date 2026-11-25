import type { KLineData, PeriodType } from 'klinecharts'
import type { Timeframe } from './types'

/**
 * Timeframes are written `<n><unit>`: m = minutes, h = hours, d = days,
 * w = weeks, M = months ("2m", "7h", "1d", "1w", "3M").
 */
export type TfUnit = 'm' | 'h' | 'd' | 'w' | 'M'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const WEEK = 7 * DAY

const UNIT: Record<TfUnit, { ms: number; period: PeriodType; label: string; one: string; many: string; max: number }> = {
  m: { ms: MIN, period: 'minute', label: 'm', one: 'minuto', many: 'minutos', max: 720 },
  h: { ms: HOUR, period: 'hour', label: 'H', one: 'hora', many: 'horas', max: 168 },
  d: { ms: DAY, period: 'day', label: 'D', one: 'día', many: 'días', max: 365 },
  w: { ms: WEEK, period: 'week', label: 'S', one: 'semana', many: 'semanas', max: 52 },
  M: { ms: 30 * DAY, period: 'month', label: 'M', one: 'mes', many: 'meses', max: 12 }
}

export const UNIT_ORDER: TfUnit[] = ['m', 'h', 'd', 'w', 'M']
export const UNIT_TITLE: Record<TfUnit, string> = { m: 'Minutos', h: 'Horas', d: 'Días', w: 'Semanas', M: 'Meses' }

export interface TfParts {
  n: number
  unit: TfUnit
}

export function partsOf(tf: Timeframe): TfParts {
  return { n: Number(tf.id.slice(0, -1)), unit: tf.id.slice(-1) as TfUnit }
}

export function makeTimeframe(n: number, unit: TfUnit): Timeframe {
  // 60m → 1H, 24H → 1D, 7D → 1S: one name for the same candle.
  if (unit === 'm' && n % 60 === 0) return makeTimeframe(n / 60, 'h')
  if (unit === 'h' && n % 24 === 0) return makeTimeframe(n / 24, 'd')
  if (unit === 'd' && n % 7 === 0) return makeTimeframe(n / 7, 'w')
  const u = UNIT[unit]
  return { id: `${n}${unit}`, label: `${n}${u.label}`, ms: n * u.ms, period: { type: u.period, span: n } }
}

/** "2 minutos", "1 hora"… */
export function longName(tf: Timeframe): string {
  const { n, unit } = partsOf(tf)
  return `${n} ${n === 1 ? UNIT[unit].one : UNIT[unit].many}`
}

const WORDS: Array<[RegExp, TfUnit]> = [
  [/^(m|min|mins|minuto|minutos)$/, 'm'],
  [/^(h|hr|hrs|hora|horas)$/i, 'h'],
  [/^(d|dia|dias|día|días)$/i, 'd'],
  [/^(s|w|sem|semana|semanas|week)$/i, 'w'],
  [/^(M|mes|meses|mo)$/, 'M']
]

/**
 * Reads what a person types: "2m", "m2", "7H", "H7", "2 días", "1S", "3M".
 * Lowercase "m" is minutes, uppercase "M" is months.
 */
export function parseTimeframe(text: string): Timeframe | { error: string } {
  const s = text.trim().replace(/\s+/g, '')
  const m = /^(\d+)([a-zA-Záí]+)$/.exec(s) ?? /^([a-zA-Záí]+)(\d+)$/.exec(s)
  if (!m) return { error: 'Escribe un número y una unidad, por ejemplo 2m, 7H, 2D, 1S o 3M.' }
  const [num, word] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]]
  const n = Number(num)
  const unit = WORDS.find(([re]) => re.test(word))?.[1]
  if (!unit) return { error: `No conozco la unidad "${word}". Usa m, H, D, S o M.` }
  if (n < 1) return { error: 'El número tiene que ser 1 o más.' }
  if (n > UNIT[unit].max) return { error: `Máximo ${UNIT[unit].max} ${UNIT[unit].many}.` }
  return makeTimeframe(n, unit)
}

export function timeframeById(id: string | null | undefined): Timeframe {
  const m = /^(\d+)([mhdwM])$/.exec(id ?? '')
  if (!m) return makeTimeframe(1, 'h')
  return makeTimeframe(Number(m[1]), m[2] as TfUnit)
}

// ---------------------------------------------------------------------------
// Building candles the exchange does not offer from smaller ones
// ---------------------------------------------------------------------------

const MONDAY = 4 * DAY // 1970-01-05 was a Monday

/** Start of the candle of `tf` that contains `ts`. */
export function bucketStart(tf: Timeframe, ts: number): number {
  const { n, unit } = partsOf(tf)
  if (unit === 'w') return Math.floor((ts - MONDAY) / (n * WEEK)) * n * WEEK + MONDAY
  if (unit === 'M') {
    const d = new Date(ts)
    const idx = Math.floor((d.getUTCFullYear() * 12 + d.getUTCMonth()) / n) * n
    return Date.UTC(Math.floor(idx / 12), idx % 12, 1)
  }
  return Math.floor(ts / tf.ms) * tf.ms
}

/**
 * The largest timeframe the exchange offers that fits a whole number of
 * times into `tf` and starts on the same boundaries.
 */
export function baseFor(tf: Timeframe, native: string[]): Timeframe | null {
  const { unit } = partsOf(tf)
  if (unit === 'w') return native.includes('1w') ? makeTimeframe(1, 'w') : native.includes('1d') ? makeTimeframe(1, 'd') : null
  if (unit === 'M') return native.includes('1M') ? makeTimeframe(1, 'M') : null
  const fits = native
    .map(id => timeframeById(id))
    .filter(b => partsOf(b).unit !== 'w' && partsOf(b).unit !== 'M' && b.ms < tf.ms && tf.ms % b.ms === 0)
    .sort((a, b) => b.ms - a.ms)
  return fits[0] ?? null
}

/** Merges ascending base candles into candles of `tf`. */
export function aggregate(tf: Timeframe, bars: KLineData[]): KLineData[] {
  const out: KLineData[] = []
  let cur: KLineData | null = null
  for (const b of bars) {
    const start = bucketStart(tf, b.timestamp)
    if (!cur || cur.timestamp !== start) {
      cur = { ...b, timestamp: start }
      out.push(cur)
      continue
    }
    cur.high = Math.max(cur.high, b.high)
    cur.low = Math.min(cur.low, b.low)
    cur.close = b.close
    cur.volume = (cur.volume ?? 0) + (b.volume ?? 0)
    if (b.turnover !== undefined) cur.turnover = (cur.turnover ?? 0) + b.turnover
  }
  return out
}

/** Every timeframe offered in the picker before the person adds their own. */
export const PRESETS: string[] = [
  '1m', '2m', '3m', '5m', '10m', '15m', '30m', '45m',
  '1h', '2h', '3h', '4h', '6h', '8h', '12h',
  '1d', '2d', '3d',
  '1w', '2w',
  '1M', '3M'
]

export const DEFAULT_TF_FAVORITES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w']
