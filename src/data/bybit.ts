import type { KLineData } from 'klinecharts'
import type { Adapter, Category, Market, Ticker, Timeframe } from './types'
import { classify, decimalsFromStep, fetchJson, LiveSocket } from './util'

const REST = 'https://api.bybit.com/v5'
const WS = 'wss://stream.bybit.com/v5/public/linear'

interface ByInstrument {
  symbol: string
  status: string
  contractType: string
  baseCoin: string
  quoteCoin: string
  displayName?: string
  symbolType?: string
  priceFilter: { tickSize: string }
  lotSizeFilter: { qtyStep: string }
}
interface ByResp<T> { retCode: number; retMsg: string; result: T }

const INTERVAL: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W'
}

function categoryOf(i: ByInstrument): Category {
  switch (i.symbolType) {
    case 'forex': return 'fx'
    case 'commodity': return 'metal'
    case 'stock': return 'stock'
    case 'ETF': return 'stock'
    default: return 'crypto'
  }
}

async function get<T>(path: string): Promise<T> {
  const r = await fetchJson<ByResp<T>>(REST + path)
  if (r.retCode !== 0) throw new Error(`Bybit: ${r.retMsg}`)
  return r.result
}

export const bybit: Adapter = {
  id: 'bybit',
  label: 'Bybit',
  short: 'BY',

  async loadMarkets() {
    const out: Market[] = []
    let cursor = ''
    for (let page = 0; page < 5; page++) {
      const res = await get<{ list: ByInstrument[]; nextPageCursor?: string }>(
        `/market/instruments-info?category=linear&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      )
      for (const i of res.list) {
        if (i.status !== 'Trading' || i.contractType !== 'LinearPerpetual' || i.quoteCoin !== 'USDT') continue
        const fallback = categoryOf(i)
        const known: { category: Category; name: string; aliases?: string[] } =
          fallback === 'crypto' ? { category: fallback, name: `${i.baseCoin} (perpetuo)` } : classify(i.baseCoin, fallback)
        out.push({
          id: 'by:' + i.symbol,
          source: 'bybit',
          symbol: i.symbol,
          ticker: i.displayName || i.symbol,
          name: known.name === i.baseCoin ? `${i.baseCoin} (perpetuo)` : known.name,
          category: known.category,
          kind: 'perp',
          pricePrecision: decimalsFromStep(i.priceFilter.tickSize),
          volumePrecision: decimalsFromStep(i.lotSizeFilter.qtyStep),
          aliases: [i.baseCoin, ...(known.aliases ?? [])]
        })
      }
      cursor = res.nextPageCursor ?? ''
      if (!cursor) break
    }
    return out
  },

  async getBars(m: Market, tf: Timeframe, before: number | null, limit: number) {
    const q = new URLSearchParams({ category: 'linear', symbol: m.symbol, interval: INTERVAL[tf.id], limit: String(Math.min(limit, 1000)) })
    if (before !== null) q.set('end', String(before - 1))
    const res = await get<{ list: string[][] }>(`/market/kline?${q}`)
    // Bybit returns newest first
    return res.list
      .map(k => ({ timestamp: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], turnover: +k[6] }))
      .reverse()
  },

  subscribe(m: Market, tf: Timeframe, onBar: (bar: KLineData) => void) {
    const topic = `kline.${INTERVAL[tf.id]}.${m.symbol}`
    const sock = new LiveSocket(
      WS,
      ws => ws.send(JSON.stringify({ op: 'subscribe', args: [topic] })),
      raw => {
        const msg = raw as { topic?: string; data?: Array<{ start: number; open: string; high: string; low: string; close: string; volume: string; turnover: string }> }
        if (msg.topic !== topic || !msg.data) return
        for (const k of msg.data) {
          onBar({ timestamp: +k.start, open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.volume, turnover: +k.turnover })
        }
      },
      { message: JSON.stringify({ op: 'ping' }), everyMs: 20_000 }
    )
    return () => sock.close()
  },

  async getTickers(ms: Market[]) {
    const map = new Map<string, Ticker>()
    if (ms.length === 0) return map
    const res = await get<{ list: Array<{ symbol: string; lastPrice: string; price24hPcnt: string }> }>('/market/tickers?category=linear')
    const wanted = new Set(ms.map(m => m.symbol))
    for (const t of res.list) {
      if (wanted.has(t.symbol)) map.set('by:' + t.symbol, { price: +t.lastPrice, change: +t.price24hPcnt * 100 })
    }
    return map
  }
}
