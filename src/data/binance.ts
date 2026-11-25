import type { KLineData } from 'klinecharts'
import type { Adapter, Category, Market, SourceId, Ticker, Timeframe } from './types'
import { classify, decimalsFromStep, fetchJson, LiveSocket } from './util'

interface BnFilter { filterType: string; tickSize?: string; stepSize?: string }
interface BnSymbol {
  symbol: string
  status: string
  baseAsset: string
  quoteAsset: string
  contractType?: string
  underlyingType?: string
  filters: BnFilter[]
}
type BnKline = [number, string, string, string, string, string, number, string]
interface BnTicker { symbol: string; lastPrice: string; priceChangePercent: string }

const INTERVAL: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w'
}

function toBar(k: BnKline): KLineData {
  return { timestamp: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], turnover: +k[7] }
}

function precisions(s: BnSymbol): { price: number; volume: number } {
  const pf = s.filters.find(f => f.filterType === 'PRICE_FILTER')
  const lf = s.filters.find(f => f.filterType === 'LOT_SIZE')
  return { price: decimalsFromStep(pf?.tickSize ?? '0.01'), volume: decimalsFromStep(lf?.stepSize ?? '0.001') }
}

const FUT_CATEGORY: Record<string, Category> = {
  COMMODITY: 'metal',
  FX: 'fx'
}

function makeBinance(futures: boolean): Adapter {
  const id: SourceId = futures ? 'binance-futures' : 'binance'
  const rest = futures ? 'https://fapi.binance.com/fapi/v1' : 'https://api.binance.com/api/v3'
  const wsBase = futures ? 'wss://fstream.binance.com/ws/' : 'wss://stream.binance.com:9443/ws/'
  const prefix = futures ? 'bnf:' : 'bn:'

  return {
    id,
    label: futures ? 'Binance TradFi' : 'Binance',
    short: futures ? 'BN·TF' : 'BN',

    async loadMarkets() {
      const url = futures ? `${rest}/exchangeInfo` : `${rest}/exchangeInfo?symbolStatus=TRADING`
      const info = await fetchJson<{ symbols: BnSymbol[] }>(url)
      const out: Market[] = []
      for (const s of info.symbols) {
        if (s.status !== 'TRADING') continue
        if (futures) {
          // Only traditional-finance perpetuals: spot already covers crypto.
          if (s.contractType !== 'TRADIFI_PERPETUAL') continue
          if (s.underlyingType === 'PREMARKET') continue
        } else if (s.quoteAsset !== 'USDT') continue
        const p = precisions(s)
        const known: { category: Category; name: string; aliases?: string[] } = futures
          ? classify(s.baseAsset, FUT_CATEGORY[s.underlyingType ?? ''] ?? 'stock')
          : { category: 'crypto' as Category, name: `${s.baseAsset} / USDT` }
        out.push({
          id: prefix + s.symbol,
          source: id,
          symbol: s.symbol,
          ticker: s.symbol,
          name: known.name === s.baseAsset ? `${s.baseAsset} (perpetuo)` : known.name,
          category: known.category,
          kind: futures ? 'perp' : 'spot',
          pricePrecision: p.price,
          volumePrecision: p.volume,
          aliases: [s.baseAsset, ...(known.aliases ?? [])]
        })
      }
      return out
    },

    async getBars(m: Market, tf: Timeframe, before: number | null, limit: number) {
      const q = new URLSearchParams({ symbol: m.symbol, interval: INTERVAL[tf.id], limit: String(Math.min(limit, 1000)) })
      if (before !== null) q.set('endTime', String(before - 1))
      const rows = await fetchJson<BnKline[]>(`${rest}/klines?${q}`)
      return rows.map(toBar)
    },

    subscribe(m: Market, tf: Timeframe, onBar: (bar: KLineData) => void) {
      const stream = `${m.symbol.toLowerCase()}@kline_${INTERVAL[tf.id]}`
      const sock = new LiveSocket(wsBase + stream, () => {}, raw => {
        const msg = raw as { e?: string; k?: { t: number; o: string; h: string; l: string; c: string; v: string; q: string } }
        if (msg.e !== 'kline' || !msg.k) return
        const k = msg.k
        onBar({ timestamp: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, turnover: +k.q })
      })
      return () => sock.close()
    },

    async getTickers(ms: Market[]) {
      const map = new Map<string, Ticker>()
      if (ms.length === 0) return map
      let rows: BnTicker[]
      if (futures) {
        rows = await fetchJson<BnTicker[]>(`${rest}/ticker/24hr`)
      } else {
        const symbols = encodeURIComponent(JSON.stringify(ms.map(m => m.symbol)))
        rows = await fetchJson<BnTicker[]>(`${rest}/ticker/24hr?symbols=${symbols}`)
      }
      const wanted = new Set(ms.map(m => m.symbol))
      for (const r of rows) {
        if (wanted.has(r.symbol)) map.set(prefix + r.symbol, { price: +r.lastPrice, change: +r.priceChangePercent })
      }
      return map
    }
  }
}

export const binanceSpot = makeBinance(false)
export const binanceFutures = makeBinance(true)
