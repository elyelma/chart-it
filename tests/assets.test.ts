import { describe, expect, it } from 'vitest'
import { assetKey } from '../src/data/assets'
import type { Market } from '../src/data/types'

const m = (p: Partial<Market>): Market => ({
  id: 'x', source: 'binance', symbol: 'X', ticker: 'X', name: 'X', category: 'crypto', kind: 'spot',
  pricePrecision: 2, volumePrecision: 2, aliases: [], ...p
})

describe('assetKey (drawings shared by asset)', () => {
  it('BTC on Binance spot, Bybit and Hyperliquid share one key', () => {
    const keys = [
      m({ id: 'bn:BTCUSDT', ticker: 'BTCUSDT', aliases: ['BTC'] }),
      m({ id: 'by:BTCUSDT', source: 'bybit', ticker: 'BTCUSDT', aliases: ['BTC'] }),
      m({ id: 'hl:BTC', source: 'hyperliquid', ticker: 'BTC', aliases: ['BTC', 'BTCUSD'] })
    ].map(assetKey)
    expect(new Set(keys)).toEqual(new Set(['crypto:BTC']))
  })

  it('GOLD and XAU are the same metal', () => {
    expect(assetKey(m({ category: 'metal', aliases: ['GOLD'] }))).toBe(assetKey(m({ category: 'metal', aliases: ['XAU'] })))
    expect(assetKey(m({ category: 'fx', aliases: ['EURUSD'] }))).toBe('fx:EUR')
  })

  it('contract multipliers do not share (1000PEPE vs PEPE, kPEPE)', () => {
    const a = assetKey(m({ aliases: ['1000PEPE'] }))
    const b = assetKey(m({ aliases: ['PEPE'] }))
    const c = assetKey(m({ aliases: ['kPEPE'] }))
    expect(new Set([a, b, c]).size).toBe(3)
  })

  it('same base in different categories stays apart', () => {
    expect(assetKey(m({ category: 'crypto', aliases: ['EUR'] }))).not.toBe(assetKey(m({ category: 'fx', aliases: ['EUR'] })))
  })

  it('falls back to the ticker when there are no aliases', () => {
    expect(assetKey(m({ ticker: 'nvda', category: 'stock', aliases: [] }))).toBe('stock:NVDA')
  })
})
