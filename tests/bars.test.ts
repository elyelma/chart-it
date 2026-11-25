import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KLineData } from 'klinecharts'
import type { Market, Timeframe } from '../src/data/types'

const MIN = 60_000

/**
 * A fake exchange that only offers 1m (and 1h) candles and serves them from an
 * in-memory series, following the Adapter contract: ascending order, at most
 * `limit` candles, strictly older than `before` when given.
 */
const fake = vi.hoisted(() => {
  const state = {
    series: [] as KLineData[],
    intervals: { '1m': '1', '1h': '60' } as Record<string, string>,
    requests: [] as Array<{ tf: string; before: number | null; limit: number }>,
    live: null as null | ((bar: KLineData) => void),
    liveTf: '' as string,
    unsubscribed: 0
  }
  const adapter = {
    id: 'binance',
    label: 'Fake',
    short: 'FK',
    get intervals() {
      return state.intervals
    },
    loadMarkets: async () => [],
    async getBars(_m: unknown, tf: { id: string }, before: number | null, limit: number) {
      state.requests.push({ tf: tf.id, before, limit })
      if (tf.id !== '1m') throw new Error(`fake adapter only serves 1m, asked for ${tf.id}`)
      const older = before === null ? state.series : state.series.filter(b => b.timestamp < before)
      return older.slice(Math.max(0, older.length - Math.min(limit, 1000))).map(b => ({ ...b }))
    },
    subscribe(_m: unknown, tf: { id: string }, onBar: (bar: KLineData) => void) {
      state.live = onBar
      state.liveTf = tf.id
      return () => {
        state.unsubscribed++
        state.live = null
      }
    },
    getTickers: async () => new Map()
  }
  return { state, adapter }
})

vi.mock('../src/data/registry', () => ({
  adapterOf: () => fake.adapter
}))

const { loadBars, subscribeBars, isBuilt } = await import('../src/data/bars')
const { aggregate, bucketStart, makeTimeframe } = await import('../src/data/timeframes')

const market = (id = 'bn:TEST'): Market => ({
  id, source: 'binance', symbol: 'TEST', ticker: 'TEST', name: 'Test', category: 'crypto', kind: 'spot',
  pricePrecision: 2, volumePrecision: 2, aliases: []
})

/** Continuous 1m candles; values depend on the index so merges are checkable. */
function makeSeries(start: number, count: number): KLineData[] {
  return Array.from({ length: count }, (_, i) => {
    const open = 100 + (i % 37)
    return {
      timestamp: start + i * MIN,
      open,
      high: open + 2 + (i % 3),
      low: open - 1 - (i % 2),
      close: open + 1,
      volume: 1 + (i % 5),
      turnover: (1 + (i % 5)) * 10
    }
  })
}

/** Loads the newest page, then pages older data with `before` until the source runs dry. */
async function loadAll(m: Market, tf: Timeframe, limit: number): Promise<{ bars: KLineData[]; pages: KLineData[][] }> {
  let bars = await loadBars(m, tf, null, limit)
  const pages = [bars]
  for (let guard = 0; guard < 200; guard++) {
    const before = bars[0].timestamp
    let older = await loadBars(m, tf, before, limit)
    older = older.filter(b => b.timestamp < before) // what main.ts does
    if (older.length === 0) break
    pages.push(older)
    bars = older.concat(bars)
  }
  return { bars, pages }
}

function expectContiguous(bars: KLineData[], tf: Timeframe): void {
  for (let i = 1; i < bars.length; i++) {
    expect(bars[i].timestamp - bars[i - 1].timestamp, `gap/dup at index ${i}`).toBe(tf.ms)
  }
  expect(new Set(bars.map(b => b.timestamp)).size).toBe(bars.length)
}

// 2024-01-01T00:03Z: aligned to neither the 2m nor the 7m grid.
const T0 = Date.UTC(2024, 0, 1, 0, 3)

beforeEach(() => {
  fake.state.series = []
  fake.state.requests = []
  fake.state.intervals = { '1m': '1', '1h': '60' }
  fake.state.live = null
  fake.state.unsubscribed = 0
})

describe('loadBars', () => {
  it('passes native timeframes straight to the adapter', async () => {
    fake.state.series = makeSeries(T0, 50)
    const tf = makeTimeframe(1, 'm')
    expect(isBuilt(market(), tf)).toBe(false)
    const bars = await loadBars(market(), tf, null, 20)
    expect(bars).toHaveLength(20)
    expect(fake.state.requests).toEqual([{ tf: '1m', before: null, limit: 20 }])
  })

  it('throws a Spanish error when the timeframe cannot be built', async () => {
    fake.state.intervals = { '1m': '1' }
    await expect(loadBars(market(), makeTimeframe(3, 'M'), null, 100)).rejects.toThrow(/no ofrece velas para construir 3M/)
  })

  it.each([
    [7, 'm'],
    [2, 'm']
  ] as const)('%i%s: candles are aligned, contiguous and correctly merged', async (n, u) => {
    fake.state.series = makeSeries(T0, 3000)
    const tf = makeTimeframe(n, u)
    expect(isBuilt(market(), tf)).toBe(true)
    const bars = await loadBars(market(), tf, null, 50)
    expect(bars.length).toBeGreaterThan(0)
    for (const b of bars) expect(b.timestamp % tf.ms).toBe(0)
    expectContiguous(bars, tf)
    // Only 1m was requested from the exchange
    expect(fake.state.requests.every(r => r.tf === '1m')).toBe(true)

    // A full bucket in the middle equals a hand-made merge of its 1m candles
    const mid = bars[Math.floor(bars.length / 2)]
    const parts = fake.state.series.filter(b => b.timestamp >= mid.timestamp && b.timestamp < mid.timestamp + tf.ms)
    expect(parts).toHaveLength(n)
    expect(mid).toEqual({
      timestamp: mid.timestamp,
      open: parts[0].open,
      high: Math.max(...parts.map(p => p.high)),
      low: Math.min(...parts.map(p => p.low)),
      close: parts[parts.length - 1].close,
      volume: parts.reduce((s, p) => s + (p.volume ?? 0), 0),
      turnover: parts.reduce((s, p) => s + (p.turnover ?? 0), 0)
    })

    // The newest candle is the (possibly partial) live bucket holding the newest 1m candle
    const newest = fake.state.series[fake.state.series.length - 1]
    expect(bars[bars.length - 1].timestamp).toBe(bucketStart(tf, newest.timestamp))
    expect(bars[bars.length - 1].close).toBe(newest.close)
  })

  it('drops a partial oldest bucket when older data exists', async () => {
    fake.state.series = makeSeries(T0, 3001)
    const tf = makeTimeframe(7, 'm')
    const bars = await loadBars(market(), tf, null, 50)
    // The first page holds the newest 1000 candles; its first candle sits mid-bucket.
    const firstRaw = fake.state.series[3001 - 1000].timestamp
    expect(firstRaw % tf.ms).not.toBe(0) // precondition of the scenario
    expect(bars[0].timestamp).toBeGreaterThan(firstRaw)
    expect(bars[0].timestamp).toBe(bucketStart(tf, firstRaw) + tf.ms)
    const parts = fake.state.series.filter(b => b.timestamp >= bars[0].timestamp && b.timestamp < bars[0].timestamp + tf.ms)
    expect(bars[0].volume).toBe(parts.reduce((s, p) => s + (p.volume ?? 0), 0))
  })

  it('keeps the partial oldest bucket when history is exhausted', async () => {
    fake.state.series = makeSeries(T0, 40)
    const tf = makeTimeframe(7, 'm')
    const bars = await loadBars(market(), tf, null, 50)
    expect(bars[0].timestamp).toBe(bucketStart(tf, T0))
    expect(bars[0].timestamp).toBeLessThan(T0)
    expect(bars[0].open).toBe(fake.state.series[0].open)
    expect(bars).toEqual(aggregate(tf, fake.state.series))
  })

  it.each([
    [7, 'm', 50],
    [7, 'm', 600],
    [2, 'm', 800],
    [7, 'm', 1]
  ] as const)('%i%s (limit %i): paging older data has no gaps or duplicates and rebuilds the full history', async (n, u, limit) => {
    fake.state.series = makeSeries(T0, 6100)
    const tf = makeTimeframe(n, u)
    const { bars, pages } = await loadAll(market(), tf, limit)
    expect(pages.length).toBeGreaterThan(1)
    for (const b of bars) expect(b.timestamp % tf.ms).toBe(0)
    expectContiguous(bars, tf)
    expect(bars).toEqual(aggregate(tf, fake.state.series))
    // Every page only holds candles strictly older than the one before it
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i][pages[i].length - 1].timestamp).toBeLessThan(pages[i - 1][0].timestamp)
    }
  })

  it('a page requested with `before` never contains a candle at or after `before`', async () => {
    fake.state.series = makeSeries(T0, 3000)
    const tf = makeTimeframe(7, 'm')
    const before = bucketStart(tf, T0 + 1500 * MIN)
    const bars = await loadBars(market(), tf, before, 50)
    expect(bars.length).toBeGreaterThan(0)
    expect(bars[bars.length - 1].timestamp + tf.ms).toBe(before)
  })

  it('caps the base candles fetched per call (5 pages of 1000)', async () => {
    fake.state.series = makeSeries(T0, 20_000)
    await loadBars(market(), makeTimeframe(12, 'm'), null, 800) // 9600 base candles wanted
    expect(fake.state.requests.length).toBeLessThanOrEqual(5)
  })
})

describe('subscribeBars (built timeframe)', () => {
  it('merges live base candles into the newest built candle', async () => {
    const tf = makeTimeframe(7, 'm')
    // End the series 3 minutes into a bucket
    const end = bucketStart(tf, T0 + 2000 * MIN) + 3 * MIN
    const count = (end - T0) / MIN + 1
    fake.state.series = makeSeries(T0, count)
    const m = market()
    const bars = await loadBars(m, tf, null, 50)
    const last = bars[bars.length - 1]
    expect(last.timestamp).toBe(end - 3 * MIN)

    const got: KLineData[] = []
    const unsub = subscribeBars(m, tf, b => got.push({ ...b }))
    expect(fake.state.liveTf).toBe('1m')
    const live = fake.state.live!
    const tail = fake.state.series.slice(-4)
    const tailVol = (xs: KLineData[]) => xs.reduce((s, p) => s + (p.volume ?? 0), 0)

    // 1) update of the current 1m candle (same timestamp, bigger volume, new high)
    live({ ...tail[3], high: 999, close: 150, volume: 50 })
    expect(got[0]).toMatchObject({
      timestamp: last.timestamp,
      open: tail[0].open,
      high: 999,
      close: 150,
      volume: tailVol(tail.slice(0, 3)) + 50
    })

    // 2) next 1m candle, same 7m bucket
    live({ timestamp: end + MIN, open: 150, high: 151, low: 10, close: 140, volume: 5 })
    expect(got[1]).toMatchObject({ timestamp: last.timestamp, open: tail[0].open, high: 999, low: 10, close: 140, volume: tailVol(tail.slice(0, 3)) + 55 })

    // 3) a stale update from an older bucket is ignored
    live({ ...fake.state.series[0] })
    expect(got).toHaveLength(2)

    // 4) first 1m candle of the next 7m bucket starts a fresh candle
    const next = last.timestamp + tf.ms
    live({ timestamp: next, open: 141, high: 142, low: 140, close: 141.5, volume: 3 })
    expect(got[2]).toEqual({ timestamp: next, open: 141, high: 142, low: 140, close: 141.5, volume: 3 })

    // 5) late update for the previous bucket after rolling over is ignored
    live({ timestamp: end, open: 1, high: 1, low: 1, close: 1, volume: 1 })
    expect(got).toHaveLength(3)

    unsub()
    expect(fake.state.unsubscribed).toBe(1)
  })

  it('native timeframes subscribe directly', () => {
    const got: KLineData[] = []
    subscribeBars(market(), makeTimeframe(1, 'm'), b => got.push(b))
    const bar = { timestamp: T0, open: 1, high: 2, low: 0, close: 1, volume: 1 }
    fake.state.live!(bar)
    expect(got).toEqual([bar])
  })
})
