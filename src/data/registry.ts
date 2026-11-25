import { binanceFutures, binanceSpot } from './binance'
import { bybit } from './bybit'
import { hyperliquid } from './hyperliquid'
import type { Adapter, Market, SourceId, Ticker } from './types'

export const ADAPTERS: Adapter[] = [binanceSpot, hyperliquid, bybit, binanceFutures]

export function adapterOf(source: SourceId): Adapter {
  const a = ADAPTERS.find(x => x.id === source)
  if (!a) throw new Error(`Fuente desconocida: ${source}`)
  return a
}

const CACHE_KEY = 'chartit:catalog:v1'
const CACHE_TTL = 6 * 60 * 60 * 1000

interface CatalogCache { at: number; markets: Market[] }

export function cachedMarkets(): Market[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as CatalogCache
    return Date.now() - c.at < CACHE_TTL ? c.markets : null
  } catch {
    return null
  }
}

/** Loads every source in parallel; a failing source does not block the others. */
export async function loadAllMarkets(): Promise<{ markets: Market[]; failed: string[] }> {
  const results = await Promise.allSettled(ADAPTERS.map(a => a.loadMarkets()))
  const markets: Market[] = []
  const failed: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') markets.push(...r.value)
    else failed.push(ADAPTERS[i].label)
  })
  if (failed.length === 0) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), markets } satisfies CatalogCache))
    } catch {
      /* storage full: no cache, no problem */
    }
  }
  return { markets, failed }
}

export async function fetchTickers(ms: Market[]): Promise<Map<string, Ticker>> {
  const bySource = new Map<SourceId, Market[]>()
  for (const m of ms) bySource.set(m.source, [...(bySource.get(m.source) ?? []), m])
  const all = new Map<string, Ticker>()
  await Promise.allSettled(
    [...bySource].map(async ([src, list]) => {
      const res = await adapterOf(src).getTickers(list)
      res.forEach((v, k) => all.set(k, v))
    })
  )
  return all
}

/** Bases shown first when the search box is empty. */
const POPULAR = [
  'BTC', 'ETH', 'SOL', 'XRP', 'HYPE', 'XYZ100', 'SP500', 'GOLD', 'XAU', 'SILVER', 'XAG', 'CL', 'EUR', 'JPY', 'GBP',
  'BNB', 'DOGE', 'ADA', 'LINK', 'AVAX', 'SUI', 'NVDA', 'TSLA', 'AAPL', 'QQQ', 'SPY', 'BRENTOIL', 'NATGAS', 'COPPER'
]

const SOURCE_RANK: Record<SourceId, number> = { binance: 0, hyperliquid: 1, bybit: 2, 'binance-futures': 3 }

/** Ranked search over the catalog. */
export function searchMarkets(all: Market[], query: string, category: string, limit = 120): Market[] {
  const q = query.trim().toUpperCase().replace(/[\s/\-_]/g, '')
  const scored: Array<{ m: Market; s: number }> = []
  for (const m of all) {
    if (category !== 'all' && m.category !== category) continue
    let s: number
    if (!q) {
      const pop = POPULAR.indexOf((m.aliases[0] ?? m.ticker).toUpperCase())
      s = pop >= 0 ? pop : 100
    } else {
      const t = m.ticker.toUpperCase().replace(/[\s/\-_]/g, '')
      const aliases = m.aliases.map(a => a.toUpperCase().replace(/[\s/\-_&]/g, ''))
      const name = m.name.toUpperCase()
      if (t === q) s = 0
      else if (aliases.includes(q)) s = 5
      else if (t.startsWith(q)) s = 10 + (t.length - q.length)
      else if (aliases.some(a => a.startsWith(q))) s = 20
      else if (t.includes(q)) s = 30
      else if (name.includes(query.trim().toUpperCase())) s = 40
      else continue
    }
    scored.push({ m, s: s * 10 + SOURCE_RANK[m.source] })
  }
  scored.sort((a, b) => a.s - b.s || a.m.ticker.localeCompare(b.m.ticker))
  return scored.slice(0, limit).map(x => x.m)
}
