import type { KLineData } from 'klinecharts'
import type { Adapter, Market, Ticker, Timeframe } from './types'
import { classify, fetchJson, LiveSocket } from './util'

const INFO = 'https://api.hyperliquid.xyz/info'
const WS = 'wss://api.hyperliquid.xyz/ws'
/** "" = main perp dex (crypto), "xyz" = traditional markets dex */
const DEXES = ['', 'xyz']
const INTERVAL: Record<string, string> = Object.fromEntries(
  ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '1d'].map(i => [i, i])
)

interface HlAsset { name: string; szDecimals: number; isDelisted?: boolean }
interface HlCtx { markPx: string; prevDayPx: string; midPx?: string | null }
interface HlCandle { t: number; o: string; h: string; l: string; c: string; v: string; s?: string; i?: string }

function info<T>(body: unknown): Promise<T> {
  return fetchJson<T>(INFO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

/** Hyperliquid prices: max 5 significant figures and max (6 - szDecimals) decimals. */
function pricePrecision(px: number, szDecimals: number): number {
  const maxDec = Math.max(0, 6 - szDecimals)
  if (!(px > 0)) return Math.min(2, maxDec)
  const sig = 5 - Math.floor(Math.log10(px)) - 1
  return Math.max(0, Math.min(maxDec, sig))
}

async function metaAndCtxs(dex: string): Promise<[{ universe: HlAsset[] }, HlCtx[]]> {
  return info<[{ universe: HlAsset[] }, HlCtx[]]>(dex ? { type: 'metaAndAssetCtxs', dex } : { type: 'metaAndAssetCtxs' })
}

export const hyperliquid: Adapter = {
  id: 'hyperliquid',
  label: 'Hyperliquid',
  short: 'HL',
  intervals: INTERVAL,

  async loadMarkets() {
    const out: Market[] = []
    const results = await Promise.all(DEXES.map(d => metaAndCtxs(d)))
    results.forEach(([meta, ctxs], di) => {
      const dex = DEXES[di]
      meta.universe.forEach((a, i) => {
        if (a.isDelisted) return
        const base = dex ? a.name.slice(dex.length + 1) : a.name
        const known = dex ? classify(base, 'stock') : { category: 'crypto' as const, name: `${base} (perpetuo)`, aliases: [] as string[] }
        const px = Number(ctxs[i]?.markPx ?? 0)
        out.push({
          id: 'hl:' + a.name,
          source: 'hyperliquid',
          symbol: a.name,
          ticker: base,
          name: known.name === base ? `${base} (perpetuo)` : known.name,
          category: known.category,
          kind: 'perp',
          pricePrecision: pricePrecision(px, a.szDecimals),
          volumePrecision: a.szDecimals,
          aliases: [base, `${base}USD`, ...(known.aliases ?? [])]
        })
      })
    })
    return out
  },

  async getBars(m: Market, tf: Timeframe, before: number | null, limit: number) {
    const endTime = before !== null ? before - 1 : Date.now()
    const ask = (span: number) =>
      info<HlCandle[]>({
        type: 'candleSnapshot',
        req: { coin: m.symbol, interval: INTERVAL[tf.id], startTime: endTime - tf.ms * span, endTime }
      })
    let rows = await ask(Math.min(limit, 5000))
    // A quiet market can have a stretch with no candles: look further back once
    // before deciding the history is over.
    if (rows.length === 0 && before !== null) rows = await ask(5000)
    return rows
      .filter(c => before === null || c.t < before)
      .map(c => ({ timestamp: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }))
  },

  subscribe(m: Market, tf: Timeframe, onBar: (bar: KLineData) => void) {
    const subscription = { type: 'candle', coin: m.symbol, interval: INTERVAL[tf.id] }
    const sock = new LiveSocket(
      WS,
      ws => ws.send(JSON.stringify({ method: 'subscribe', subscription })),
      raw => {
        const msg = raw as { channel?: string; data?: HlCandle }
        if (msg.channel !== 'candle' || !msg.data) return
        const c = msg.data
        if (c.s !== m.symbol || c.i !== INTERVAL[tf.id]) return
        onBar({ timestamp: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v })
      },
      { message: JSON.stringify({ method: 'ping' }), everyMs: 30_000 }
    )
    return () => sock.close()
  },

  async getTickers(ms: Market[]) {
    const map = new Map<string, Ticker>()
    const dexes = new Set(ms.map(m => (m.symbol.includes(':') ? m.symbol.split(':')[0] : '')))
    await Promise.all(
      [...dexes].map(async dex => {
        const [meta, ctxs] = await metaAndCtxs(dex)
        meta.universe.forEach((a, i) => {
          const c = ctxs[i]
          if (!c) return
          const price = Number(c.midPx ?? c.markPx)
          const prev = Number(c.prevDayPx)
          map.set('hl:' + a.name, { price, change: prev > 0 ? ((price - prev) / prev) * 100 : 0 })
        })
      })
    )
    return map
  }
}
