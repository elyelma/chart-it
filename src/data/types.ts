import type { KLineData, Period } from 'klinecharts'

export type Category = 'crypto' | 'index' | 'metal' | 'energy' | 'agri' | 'fx' | 'stock'

export type SourceId = 'binance' | 'binance-futures' | 'bybit' | 'hyperliquid'

export interface Market {
  /** Unique id across all sources, e.g. "bn:BTCUSDT", "hl:xyz:GOLD" */
  id: string
  source: SourceId
  /** Symbol exactly as the source API expects it */
  symbol: string
  /** Short display ticker */
  ticker: string
  /** Human description */
  name: string
  category: Category
  kind: 'spot' | 'perp'
  pricePrecision: number
  volumePrecision: number
  /** Extra search terms (e.g. "XAUUSD", "oro") */
  aliases: string[]
}

export interface Timeframe {
  id: string
  label: string
  ms: number
  period: Period
}

export interface Ticker {
  price: number
  /** 24h change in percent */
  change: number
}

export interface Adapter {
  id: SourceId
  label: string
  short: string
  /** Timeframe id → the exchange's own interval name, for every interval it offers */
  intervals: Record<string, string>
  loadMarkets(): Promise<Market[]>
  /**
   * Candles in ascending order, for a timeframe listed in `intervals`. If
   * `before` is given, only candles strictly older than that timestamp;
   * otherwise the most recent ones.
   */
  getBars(m: Market, tf: Timeframe, before: number | null, limit: number): Promise<KLineData[]>
  /** Live updates of the current candle. Returns an unsubscribe function. */
  subscribe(m: Market, tf: Timeframe, onBar: (bar: KLineData) => void): () => void
  getTickers(ms: Market[]): Promise<Map<string, Ticker>>
}
