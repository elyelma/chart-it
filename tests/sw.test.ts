import { describe, expect, it } from 'vitest'
import code from '../public/sw.js?raw'

/**
 * public/sw.js run in a sandbox with fake caches and fetch, to check what it
 * serves and what it stores.
 */

const ORIGIN = 'https://chart-it.example'

interface Res { url: string; ok: boolean; status: number; body: string; clone(): Res }
const res = (url: string, body: string, status = 200): Res => ({
  url, body, status, ok: status >= 200 && status < 300, clone() { return { ...this } }
})

function boot(network: (url: string) => Res | Error) {
  const listeners: Record<string, (e: unknown) => void> = {}
  const cache = new Map<string, Res>()
  const fetched: string[] = []
  const key = (r: string | { url: string }) => {
    const u = new URL(typeof r === 'string' ? r : r.url, ORIGIN)
    return u.pathname + u.search
  }
  const cacheApi = {
    put: async (r: string | { url: string }, v: Res) => void cache.set(key(r), v),
    match: async (r: string | { url: string }) => cache.get(key(r)),
    addAll: async () => {}
  }
  const sandbox = {
    self: { addEventListener: (t: string, fn: (e: unknown) => void) => (listeners[t] = fn), location: { origin: ORIGIN }, skipWaiting: () => {}, clients: { claim: () => {} } },
    caches: { open: async () => cacheApi, match: cacheApi.match, keys: async () => [], delete: async () => true },
    fetch: async (r: { url: string }) => {
      fetched.push(r.url)
      const out = network(r.url)
      if (out instanceof Error) throw out
      return out
    }
  }
  new Function('self', 'caches', 'fetch', code)(sandbox.self, sandbox.caches, sandbox.fetch)

  /** Dispatches a fetch event; resolves with what the page gets (undefined = not intercepted). */
  async function request(url: string, mode: 'navigate' | 'cors' = 'cors', method = 'GET') {
    let responded: Promise<Res | undefined> | undefined
    const extended: Array<Promise<unknown>> = []
    listeners.fetch({
      request: { url: new URL(url, ORIGIN).href, mode, method },
      respondWith: (p: Promise<Res | undefined>) => (responded = p),
      waitUntil: (p: Promise<unknown>) => void extended.push(p)
    })
    const out = responded ? await responded : undefined
    await Promise.all(extended)
    await new Promise(r => setTimeout(r, 0))
    return out
  }
  return { request, cache, fetched }
}

describe('service worker', () => {
  it('never intercepts the exchange APIs (cross-origin) nor POSTs', async () => {
    const sw = boot(u => res(u, 'api'))
    expect(await sw.request('https://api.binance.com/api/v3/klines?symbol=BTCUSDT')).toBeUndefined()
    expect(await sw.request('https://api.hyperliquid.xyz/info', 'cors', 'POST')).toBeUndefined()
    expect(sw.cache.size).toBe(0)
  })

  it('pages are network-first: a new deploy is served at once, the cached copy only offline', async () => {
    let online = true
    let version = 'v1'
    const sw = boot(u => (online ? res(u, `<html>${version}`) : new Error('offline')))
    expect((await sw.request('/', 'navigate'))?.body).toBe('<html>v1')
    version = 'v2'
    expect((await sw.request('/', 'navigate'))?.body).toBe('<html>v2')
    online = false
    expect((await sw.request('/', 'navigate'))?.body).toBe('<html>v2')
  })

  it('hashed assets are cache-first and stored', async () => {
    const sw = boot(u => res(u, 'js'))
    await sw.request('/assets/index-abc.js')
    await sw.request('/assets/index-abc.js')
    expect(sw.fetched.filter(u => u.endsWith('index-abc.js')).length).toBe(1)
  })

  // Every navigation inside the scope is written to the '/index.html' slot,
  // including the legal pages opened from Ajustes / the toolbar note.
  it('opening /legal/terminos.html does not replace the offline copy of the app (fixed)', async () => {
    let online = true
    const sw = boot(u => (online ? res(u, u.includes('legal') ? 'TERMS PAGE' : '<html>app') : new Error('offline')))
    await sw.request('/', 'navigate')
    await sw.request('/legal/terminos.html', 'navigate')
    online = false
    expect((await sw.request('/', 'navigate'))?.body).toBe('<html>app')
  })

  // No res.ok check on navigations: a 404/5xx page from the host becomes the offline app.
  it('an error page is not stored as the offline app (fixed)', async () => {
    let status = 200
    let online = true
    const sw = boot(u => (online ? res(u, status === 200 ? '<html>app' : 'Bad gateway', status) : new Error('offline')))
    await sw.request('/', 'navigate')
    status = 502
    await sw.request('/', 'navigate')
    online = false
    expect((await sw.request('/', 'navigate'))?.body).toBe('<html>app')
  })
})
