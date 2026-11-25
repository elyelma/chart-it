import type { Market } from './types'

/**
 * Same asset, different names across exchanges. Used to share drawings
 * between, e.g., BTC on Binance, Bybit and Hyperliquid, or gold as GOLD/XAU.
 */
const SAME: Record<string, string> = {
  GOLD: 'XAU',
  SILVER: 'XAG',
  PLATINUM: 'XPT',
  PALLADIUM: 'XPD',
  BRENTOIL: 'BZ',
  EURUSD: 'EUR',
  GBPUSD: 'GBP',
  USDJPY: 'JPY'
}

/** "crypto:BTC", "metal:XAU"… Markets with the same key show the same drawings. */
export function assetKey(m: Market): string {
  const base = (m.aliases[0] ?? m.ticker).toUpperCase()
  return `${m.category}:${SAME[base] ?? base}`
}
