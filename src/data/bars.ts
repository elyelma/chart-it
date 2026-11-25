import type { KLineData } from 'klinecharts'
import { adapterOf } from './registry'
import { aggregate, baseFor, bucketStart } from './timeframes'
import type { Market, Timeframe } from './types'

/**
 * Candles for any timeframe. When the exchange offers it, they come straight
 * from the exchange; otherwise they are built from a smaller timeframe it
 * does offer (2m from 1m, 7H from 1H, 2S from 1S…).
 */

const PAGE = 1000
/** Most base candles fetched in one go (5 requests at most). */
const MAX_BASE = 5000

/** Base candles of the newest built candle, to keep it live. */
const tails = new Map<string, KLineData[]>()
const key = (m: Market, tf: Timeframe) => `${m.id}|${tf.id}`

export function isBuilt(m: Market, tf: Timeframe): boolean {
  return !adapterOf(m.source).intervals[tf.id]
}

export async function loadBars(m: Market, tf: Timeframe, before: number | null, limit: number): Promise<KLineData[]> {
  const adapter = adapterOf(m.source)
  if (adapter.intervals[tf.id]) return adapter.getBars(m, tf, before, limit)

  const base = baseFor(tf, Object.keys(adapter.intervals))
  if (!base) throw new Error(`${adapter.label} no ofrece velas para construir ${tf.label}.`)
  const wanted = Math.min(MAX_BASE, Math.ceil((tf.ms / base.ms) * limit))

  let raw: KLineData[] = []
  let cursor = before
  let exhausted = false
  while (raw.length < wanted) {
    const page = await adapter.getBars(m, base, cursor, PAGE)
    const older = raw.length ? page.filter(b => b.timestamp < raw[0].timestamp) : page
    if (older.length === 0) {
      exhausted = true
      break
    }
    raw = older.concat(raw)
    cursor = raw[0].timestamp
  }

  const bars = aggregate(tf, raw)
  // The oldest candle may be missing its first part: drop it, the next page brings it whole.
  if (!exhausted && bars.length > 1 && raw[0].timestamp !== bucketStart(tf, raw[0].timestamp)) bars.shift()

  if (before === null && bars.length) {
    const lastStart = bars[bars.length - 1].timestamp
    tails.set(key(m, tf), raw.filter(b => b.timestamp >= lastStart))
  }
  return bars
}

export function subscribeBars(m: Market, tf: Timeframe, onBar: (bar: KLineData) => void): () => void {
  const adapter = adapterOf(m.source)
  if (adapter.intervals[tf.id]) return adapter.subscribe(m, tf, onBar)

  const base = baseFor(tf, Object.keys(adapter.intervals))
  if (!base) return () => {}
  const parts = new Map<number, KLineData>()
  let start = -1
  for (const b of tails.get(key(m, tf)) ?? []) {
    start = bucketStart(tf, b.timestamp)
    parts.set(b.timestamp, b)
  }
  return adapter.subscribe(m, base, bar => {
    const s = bucketStart(tf, bar.timestamp)
    if (s < start) return
    if (s > start) {
      start = s
      parts.clear()
    }
    parts.set(bar.timestamp, bar)
    const merged = aggregate(tf, [...parts.values()].sort((a, b) => a.timestamp - b.timestamp))[0]
    if (merged) onBar(merged)
  })
}
