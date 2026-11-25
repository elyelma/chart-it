import { describe, expect, it } from 'vitest'
import type { KLineData } from 'klinecharts'
import { binanceFutures, binanceSpot } from '../src/data/binance'
import { bybit } from '../src/data/bybit'
import { hyperliquid } from '../src/data/hyperliquid'
import {
  aggregate, baseFor, bucketStart, longName, makeTimeframe, parseTimeframe, partsOf, PRESETS, timeframeById, type TfUnit
} from '../src/data/timeframes'
import type { Timeframe } from '../src/data/types'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const WEEK = 7 * DAY

function ok(text: string): Timeframe {
  const r = parseTimeframe(text)
  if ('error' in r) throw new Error(`parseTimeframe(${JSON.stringify(text)}) failed: ${r.error}`)
  return r
}

function err(text: string): string {
  const r = parseTimeframe(text)
  if (!('error' in r)) throw new Error(`parseTimeframe(${JSON.stringify(text)}) should fail, got ${r.id}`)
  return r.error
}

// ---------------------------------------------------------------------------

describe('makeTimeframe', () => {
  it('builds id, label, ms and period', () => {
    expect(makeTimeframe(2, 'm')).toEqual({ id: '2m', label: '2m', ms: 2 * MIN, period: { type: 'minute', span: 2 } })
    expect(makeTimeframe(7, 'h')).toEqual({ id: '7h', label: '7H', ms: 7 * HOUR, period: { type: 'hour', span: 7 } })
    expect(makeTimeframe(2, 'd')).toEqual({ id: '2d', label: '2D', ms: 2 * DAY, period: { type: 'day', span: 2 } })
    expect(makeTimeframe(1, 'w')).toEqual({ id: '1w', label: '1S', ms: WEEK, period: { type: 'week', span: 1 } })
    expect(makeTimeframe(3, 'M')).toMatchObject({ id: '3M', label: '3M', period: { type: 'month', span: 3 } })
  })

  it('normalizes 60m→1H, 24h→1D, 7d→1S (and chains)', () => {
    expect(makeTimeframe(60, 'm').id).toBe('1h')
    expect(makeTimeframe(60, 'm').label).toBe('1H')
    expect(makeTimeframe(120, 'm').id).toBe('2h')
    expect(makeTimeframe(24, 'h').id).toBe('1d')
    expect(makeTimeframe(24, 'h').label).toBe('1D')
    expect(makeTimeframe(48, 'h').id).toBe('2d')
    expect(makeTimeframe(7, 'd').id).toBe('1w')
    expect(makeTimeframe(7, 'd').label).toBe('1S')
    expect(makeTimeframe(14, 'd').id).toBe('2w')
    expect(makeTimeframe(168, 'h').id).toBe('1w')
    expect(makeTimeframe(1440, 'm').id).toBe('1d')
    expect(makeTimeframe(10080, 'm').id).toBe('1w')
  })

  it('does not normalize values that are not whole multiples', () => {
    expect(makeTimeframe(90, 'm').id).toBe('90m')
    expect(makeTimeframe(36, 'h').id).toBe('36h')
    expect(makeTimeframe(10, 'd').id).toBe('10d')
    expect(makeTimeframe(4, 'w').id).toBe('4w')
  })

  it('every preset round-trips through timeframeById', () => {
    for (const id of PRESETS) expect(timeframeById(id).id).toBe(id)
  })

  it('partsOf / longName', () => {
    expect(partsOf(makeTimeframe(7, 'h'))).toEqual({ n: 7, unit: 'h' })
    expect(partsOf(makeTimeframe(3, 'M'))).toEqual({ n: 3, unit: 'M' })
    expect(longName(makeTimeframe(1, 'h'))).toBe('1 hora')
    expect(longName(makeTimeframe(2, 'm'))).toBe('2 minutos')
    expect(longName(makeTimeframe(2, 'w'))).toBe('2 semanas')
  })
})

// ---------------------------------------------------------------------------

describe('parseTimeframe', () => {
  it('reads number+unit and unit+number', () => {
    expect(ok('2m').id).toBe('2m')
    expect(ok('m2').id).toBe('2m')
    expect(ok('7H').id).toBe('7h')
    expect(ok('7h').id).toBe('7h')
    expect(ok('H7').id).toBe('7h')
    expect(ok('2D').id).toBe('2d')
    expect(ok('1S').id).toBe('1w')
    expect(ok('1w').id).toBe('1w')
    expect(ok('3M').id).toBe('3M')
    expect(ok('M3').id).toBe('3M')
  })

  it('lowercase m is minutes, uppercase M is months', () => {
    expect(partsOf(ok('3m')).unit).toBe('m')
    expect(partsOf(ok('3M')).unit).toBe('M')
  })

  it('reads Spanish words and spaces', () => {
    expect(ok('2 días').id).toBe('2d')
    expect(ok('2 dias').id).toBe('2d')
    expect(ok(' 5 minutos ').id).toBe('5m')
    expect(ok('1 hora').id).toBe('1h')
    expect(ok('3 horas').id).toBe('3h')
    expect(ok('2 semanas').id).toBe('2w')
    expect(ok('6 meses').id).toBe('6M')
    expect(ok('1 mes').id).toBe('1M')
    expect(ok('2 Días').id).toBe('2d')
    expect(ok('3 HORAS').id).toBe('3h')
  })

  // Hours/days/weeks words are case-insensitive, but "Minutos", "MIN", "Mes",
  // "MESES" are rejected ("No conozco la unidad"). Only the single letters
  // m / M need to be case-sensitive.
  it('accepts capitalized multi-letter minute/month words (fixed)', () => {
    expect(ok('2 Minutos').id).toBe('2m')
    expect(ok('15 MIN').id).toBe('15m')
    expect(ok('1 Mes').id).toBe('1M')
  })

  it('normalizes through makeTimeframe', () => {
    expect(ok('60m').id).toBe('1h')
    expect(ok('24h').id).toBe('1d')
    expect(ok('7d').id).toBe('1w')
    expect(ok('720m').id).toBe('12h')
    expect(ok('168h').id).toBe('1w')
  })

  it('rejects bad input with a Spanish message', () => {
    expect(err('')).toMatch(/número y una unidad/)
    expect(err('m')).toMatch(/número y una unidad/)
    expect(err('12')).toMatch(/número y una unidad/)
    expect(err('1.5h')).toMatch(/número y una unidad/)
    expect(err('-2m')).toMatch(/número y una unidad/)
    expect(err('2x')).toMatch(/No conozco la unidad "x"/)
    expect(err('0m')).toMatch(/1 o más/)
    expect(err('0M')).toMatch(/1 o más/)
  })

  it('enforces per-unit maximums', () => {
    expect(ok('720m').id).toBe('12h')
    expect(err('721m')).toMatch(/Máximo 720 minutos/)
    expect(err('169h')).toMatch(/Máximo 168 horas/)
    expect(err('366d')).toMatch(/Máximo 365 días/)
    expect(err('53S')).toMatch(/Máximo 52 semanas/)
    expect(err('13M')).toMatch(/Máximo 12 meses/)
  })
})

// ---------------------------------------------------------------------------

describe('timeframeById', () => {
  it('parses valid ids', () => {
    expect(timeframeById('2m').id).toBe('2m')
    expect(timeframeById('7h').id).toBe('7h')
    expect(timeframeById('1w').id).toBe('1w')
    expect(timeframeById('3M').id).toBe('3M')
    expect(timeframeById('60m').id).toBe('1h')
  })

  it('falls back to 1H for missing or malformed ids', () => {
    for (const bad of [null, undefined, '', 'abc', '5x', 'h', '1.5h', '1H', ' 1h']) {
      expect(timeframeById(bad).id).toBe('1h')
    }
  })

  // The id comes from the URL hash (#bn:BTCUSDT/0m) and localStorage. "0m"
  // passes the regex and normalizes 0m→0h→0d→0w: a timeframe with ms = 0,
  // span 0, which makes bucketStart return NaN and hands klinecharts a 0 span.
  it('"0m" from a hand-edited link falls back instead of a zero-length timeframe (fixed)', () => {
    const t = timeframeById('0m')
    expect(t.ms).toBeGreaterThan(0)
    expect(timeframeById('9999m').id).toBe('12h') // clamped to the 720m maximum
  })
})

// ---------------------------------------------------------------------------

describe('bucketStart', () => {
  const ts = (iso: string) => Date.parse(iso)

  it('minutes: floor to the n-minute grid', () => {
    const tf = makeTimeframe(1, 'm')
    expect(bucketStart(tf, ts('2024-03-10T12:34:56.789Z'))).toBe(ts('2024-03-10T12:34:00Z'))
    const five = makeTimeframe(5, 'm')
    expect(bucketStart(five, ts('2024-03-10T12:34:56Z'))).toBe(ts('2024-03-10T12:30:00Z'))
    expect(bucketStart(five, ts('2024-03-10T12:35:00Z'))).toBe(ts('2024-03-10T12:35:00Z'))
    const seven = makeTimeframe(7, 'm')
    const s = bucketStart(seven, ts('2024-03-10T12:34:56Z'))
    expect(s % (7 * MIN)).toBe(0)
    expect(s).toBeLessThanOrEqual(ts('2024-03-10T12:34:56Z'))
    expect(ts('2024-03-10T12:34:56Z') - s).toBeLessThan(7 * MIN)
  })

  it('hours and days: UTC-aligned', () => {
    expect(bucketStart(makeTimeframe(1, 'h'), ts('2024-03-10T12:34:56Z'))).toBe(ts('2024-03-10T12:00:00Z'))
    expect(bucketStart(makeTimeframe(4, 'h'), ts('2024-03-10T15:59:59Z'))).toBe(ts('2024-03-10T12:00:00Z'))
    expect(bucketStart(makeTimeframe(1, 'd'), ts('2024-03-10T23:59:59Z'))).toBe(ts('2024-03-10T00:00:00Z'))
    expect(bucketStart(makeTimeframe(1, 'd'), ts('2024-03-11T00:00:00Z'))).toBe(ts('2024-03-11T00:00:00Z'))
    const two = bucketStart(makeTimeframe(2, 'd'), ts('2024-03-10T05:00:00Z'))
    expect(two % (2 * DAY)).toBe(0)
  })

  it('weeks start on Monday 00:00 UTC', () => {
    const w = makeTimeframe(1, 'w')
    // 2024-01-01 was a Monday
    expect(bucketStart(w, ts('2024-01-01T00:00:00Z'))).toBe(ts('2024-01-01T00:00:00Z'))
    expect(bucketStart(w, ts('2024-01-03T10:00:00Z'))).toBe(ts('2024-01-01T00:00:00Z'))
    expect(bucketStart(w, ts('2024-01-07T23:59:59.999Z'))).toBe(ts('2024-01-01T00:00:00Z'))
    expect(bucketStart(w, ts('2024-01-08T00:00:00Z'))).toBe(ts('2024-01-08T00:00:00Z'))
    expect(new Date(bucketStart(w, ts('2025-11-27T08:00:00Z'))).getUTCDay()).toBe(1)
    // Before the 1970-01-05 reference Monday
    expect(bucketStart(w, ts('1970-01-01T00:00:00Z'))).toBe(ts('1969-12-29T00:00:00Z'))
  })

  it('multi-week buckets are 2 weeks long and start on a Monday', () => {
    const w2 = makeTimeframe(2, 'w')
    const s = bucketStart(w2, ts('2024-05-15T00:00:00Z'))
    expect(new Date(s).getUTCDay()).toBe(1)
    expect(ts('2024-05-15T00:00:00Z') - s).toBeLessThan(2 * WEEK)
    expect(bucketStart(w2, s + 2 * WEEK - 1)).toBe(s)
    expect(bucketStart(w2, s + 2 * WEEK)).toBe(s + 2 * WEEK)
  })

  it('months: first day of the (multi-)month in UTC', () => {
    const m1 = makeTimeframe(1, 'M')
    expect(bucketStart(m1, ts('2024-02-29T23:59:59Z'))).toBe(ts('2024-02-01T00:00:00Z'))
    expect(bucketStart(m1, ts('2024-03-01T00:00:00Z'))).toBe(ts('2024-03-01T00:00:00Z'))
    expect(bucketStart(m1, ts('2023-12-31T23:59:59Z'))).toBe(ts('2023-12-01T00:00:00Z'))
    const q = makeTimeframe(3, 'M')
    expect(bucketStart(q, ts('2024-05-10T00:00:00Z'))).toBe(ts('2024-04-01T00:00:00Z'))
    expect(bucketStart(q, ts('2024-03-31T23:59:59Z'))).toBe(ts('2024-01-01T00:00:00Z'))
    expect(bucketStart(q, ts('2024-12-31T00:00:00Z'))).toBe(ts('2024-10-01T00:00:00Z'))
    const half = makeTimeframe(6, 'M')
    expect(bucketStart(half, ts('2024-08-01T00:00:00Z'))).toBe(ts('2024-07-01T00:00:00Z'))
    const year = makeTimeframe(12, 'M')
    expect(bucketStart(year, ts('2024-08-01T00:00:00Z'))).toBe(ts('2024-01-01T00:00:00Z'))
  })
})

// ---------------------------------------------------------------------------

describe('baseFor', () => {
  const ids = (a: { intervals: Record<string, string> }) => Object.keys(a.intervals)
  const base = (tf: string, a: { intervals: Record<string, string> }) => baseFor(timeframeById(tf), ids(a))?.id ?? null

  it('Binance spot / TradFi', () => {
    for (const a of [binanceSpot, binanceFutures]) {
      expect(base('2m', a)).toBe('1m')
      expect(base('7m', a)).toBe('1m')
      expect(base('10m', a)).toBe('5m')
      expect(base('45m', a)).toBe('15m')
      expect(base('90m', a)).toBe('30m')
      expect(base('3h', a)).toBe('1h')
      expect(base('7h', a)).toBe('1h')
      expect(base('10h', a)).toBe('2h')
      expect(base('16h', a)).toBe('8h')
      expect(base('2d', a)).toBe('1d')
      expect(base('6d', a)).toBe('1d') // Binance 3d candles are off the epoch grid
      expect(base('2w', a)).toBe('1w')
      expect(base('3M', a)).toBe('1M')
    }
  })

  it('Bybit (no 8h, no 3d)', () => {
    expect(base('2m', bybit)).toBe('1m')
    expect(base('10m', bybit)).toBe('5m')
    expect(base('8h', bybit)).toBe('4h')
    expect(base('3d', bybit)).toBe('1d')
    expect(base('2w', bybit)).toBe('1w')
    expect(base('3M', bybit)).toBe('1M')
  })

  it('Hyperliquid (no 6h)', () => {
    expect(base('2m', hyperliquid)).toBe('1m')
    expect(base('6h', hyperliquid)).toBe('2h')
    // Hyperliquid's 3d, Thursday 1w and 30-day "1M" are not used: built from 1d.
    expect(base('3d', hyperliquid)).toBe('1d')
    expect(base('6d', hyperliquid)).toBe('1d')
    expect(base('1w', hyperliquid)).toBe('1d')
    expect(base('2w', hyperliquid)).toBe('1d')
    expect(base('1M', hyperliquid)).toBe('1d')
    expect(base('3M', hyperliquid)).toBe('1d')
  })

  it('never picks the timeframe itself or week/month bases for intraday/day timeframes', () => {
    expect(baseFor(timeframeById('1h'), ['1m', '1h'])?.id).toBe('1m')
    expect(baseFor(timeframeById('2w'), ['1d'])?.id).toBe('1d')
    expect(baseFor(timeframeById('14d'), ['1d', '1w'])?.id).toBe('1w') // 14d is normalized to 2w
    expect(baseFor(timeframeById('10d'), ['1d', '1w', '1M'])?.id).toBe('1d')
  })

  it('returns null when nothing fits', () => {
    expect(baseFor(timeframeById('3M'), ['1m', '1h', '1w'])).toBeNull()
    expect(baseFor(timeframeById('3M'), ['1m', '1d', '1w'])?.id).toBe('1d') // calendar months from days
    expect(baseFor(timeframeById('2w'), ['1m', '1h'])).toBeNull()
    expect(baseFor(timeframeById('7m'), ['5m', '15m'])).toBeNull()
  })

  it('every preset is native or buildable on every adapter', () => {
    for (const a of [binanceSpot, binanceFutures, bybit, hyperliquid]) {
      for (const id of PRESETS) {
        if (a.intervals[id]) continue
        expect(baseFor(timeframeById(id), ids(a)), `${a.id} ${id}`).not.toBeNull()
      }
    }
  })

  it('every unit at its maximum is buildable on every adapter', () => {
    const maxes: Array<[number, TfUnit]> = [[719, 'm'], [167, 'h'], [365, 'd'], [52, 'w'], [12, 'M']]
    for (const a of [binanceSpot, bybit, hyperliquid]) {
      for (const [n, u] of maxes) expect(baseFor(makeTimeframe(n, u), ids(a)), `${a.id} ${n}${u}`).not.toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------

describe('aggregate', () => {
  const bar = (ts: number, o: number, h: number, l: number, c: number, v?: number, t?: number): KLineData => {
    const b: KLineData = { timestamp: ts, open: o, high: h, low: l, close: c }
    if (v !== undefined) b.volume = v
    if (t !== undefined) b.turnover = t
    return b
  }

  it('merges OHLCV and turnover per bucket', () => {
    const t0 = Date.parse('2024-01-01T00:00:00Z')
    const tf = makeTimeframe(3, 'm')
    const out = aggregate(tf, [
      bar(t0, 10, 12, 9, 11, 1, 10),
      bar(t0 + MIN, 11, 15, 10, 14, 2, 20),
      bar(t0 + 2 * MIN, 14, 14, 8, 9, 3, 30),
      bar(t0 + 3 * MIN, 9, 10, 7, 8, 4, 40)
    ])
    expect(out).toEqual([
      { timestamp: t0, open: 10, high: 15, low: 8, close: 9, volume: 6, turnover: 60 },
      { timestamp: t0 + 3 * MIN, open: 9, high: 10, low: 7, close: 8, volume: 4, turnover: 40 }
    ])
  })

  it('stamps the bucket start even when the first base candle is late', () => {
    const t0 = Date.parse('2024-01-01T00:00:00Z')
    const out = aggregate(makeTimeframe(5, 'm'), [bar(t0 + 2 * MIN, 1, 2, 0.5, 1.5, 1), bar(t0 + 4 * MIN, 1.5, 3, 1, 2, 1)])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ timestamp: t0, open: 1, high: 3, low: 0.5, close: 2, volume: 2 })
  })

  it('handles missing volume / turnover (Hyperliquid has no turnover)', () => {
    const t0 = Date.parse('2024-01-01T00:00:00Z')
    const out = aggregate(makeTimeframe(2, 'm'), [bar(t0, 1, 1, 1, 1), bar(t0 + MIN, 1, 1, 1, 1, 5)])
    expect(out[0].volume).toBe(5)
    expect(out[0].turnover).toBeUndefined()
  })

  it('does not mutate its input', () => {
    const t0 = Date.parse('2024-01-01T00:00:00Z')
    const input = [bar(t0, 1, 2, 0, 1, 1, 1), bar(t0 + MIN, 1, 5, 0, 3, 1, 1)]
    const copy = JSON.parse(JSON.stringify(input))
    aggregate(makeTimeframe(2, 'm'), input)
    expect(input).toEqual(copy)
  })

  it('builds weekly candles from daily ones starting on Monday', () => {
    const mon = Date.parse('2024-01-01T00:00:00Z')
    const days = Array.from({ length: 10 }, (_, i) => bar(mon - 2 * DAY + i * DAY, i, i + 1, i - 1, i + 0.5, 1))
    const out = aggregate(makeTimeframe(1, 'w'), days)
    expect(out.map(b => b.timestamp)).toEqual([mon - WEEK, mon, mon + WEEK])
    expect(out.map(b => b.volume)).toEqual([2, 7, 1])
  })

  it('empty in, empty out', () => {
    expect(aggregate(makeTimeframe(2, 'm'), [])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Built candles assume the exchange's base candles sit on the same grid as
// bucketStart (epoch for m/h/d, Monday for weeks, calendar month for months).
// The anchors below were read from the live public APIs on 2026-11-25:
//   Binance BTCUSDT 3d opens: 2026-11-19, 2026-11-22  (1 day off the epoch 3d grid)
//   Hyperliquid BTC 1w opens on Thursdays: 2026-10-22, 2026-10-29
//   Hyperliquid BTC "1M" is a fixed 30-day candle: 2026-08-05, 09-04, 10-04, 11-03
// When the grids differ, each built candle is stamped with a time before its
// first base candle and covers a shifted range.
// ---------------------------------------------------------------------------

describe('exchange candle anchors vs. built timeframes', () => {
  const candle = (ts: number): KLineData => ({ timestamp: ts, open: 1, high: 1, low: 1, close: 1, volume: 1 })
  /** Every built candle must start exactly where its first base candle starts. */
  function expectStampsOnBaseCandles(tf: Timeframe, baseTs: number[]): void {
    const out = aggregate(tf, baseTs.map(candle))
    for (const b of out) expect(baseTs, `built ${tf.id} candle at ${new Date(b.timestamp).toISOString()}`).toContain(b.timestamp)
  }

  it('control: Monday-anchored weekly candles (Binance/Bybit 1w, observed 2026-11-16/23) build 2S correctly', () => {
    const two = makeTimeframe(2, 'w')
    const start = bucketStart(two, Date.UTC(2026, 10, 16))
    expect(new Date(start).getUTCDay()).toBe(1)
    expectStampsOnBaseCandles(two, [0, 1, 2, 3].map(i => start + i * WEEK))
  })

  // Regression for the anchoring bugs found by QA: off-grid exchange candles
  // are never used as a base, so built candles start on their own first day.
  it('Binance 6D is built from 1d, never from off-grid 3d candles (fixed)', () => {
    const six = makeTimeframe(6, 'd')
    expect(baseFor(six, Object.keys(binanceSpot.intervals))?.id).toBe('1d')
    const start = bucketStart(six, Date.UTC(2026, 10, 19))
    expectStampsOnBaseCandles(six, Array.from({ length: 12 }, (_, i) => start + i * DAY))
  })

  it('Hyperliquid 2S is built from 1d and starts on Monday (fixed)', () => {
    const two = makeTimeframe(2, 'w')
    expect(baseFor(two, Object.keys(hyperliquid.intervals))?.id).toBe('1d')
    const start = bucketStart(two, Date.UTC(2026, 9, 22))
    expect(new Date(start).getUTCDay()).toBe(1)
    expectStampsOnBaseCandles(two, Array.from({ length: 28 }, (_, i) => start + i * DAY))
  })

  it('Hyperliquid 3M is built from 1d calendar days (fixed)', () => {
    const q = makeTimeframe(3, 'M')
    expect(baseFor(q, Object.keys(hyperliquid.intervals))?.id).toBe('1d')
    const start = bucketStart(q, Date.UTC(2026, 7, 5))
    expect(new Date(start).getUTCDate()).toBe(1)
    expectStampsOnBaseCandles(q, Array.from({ length: 120 }, (_, i) => start + i * DAY))
  })
})
