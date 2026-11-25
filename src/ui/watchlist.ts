import { adapterOf } from '../data/registry'
import type { Market, Ticker } from '../data/types'
import { icon } from './icons'

const KEY = 'chartit:watchlist'
const DEFAULT = [
  'bn:BTCUSDT', 'bn:ETHUSDT', 'bn:SOLUSDT', 'bn:XRPUSDT', 'hl:HYPE',
  'hl:xyz:XYZ100', 'hl:xyz:SP500', 'hl:xyz:GOLD', 'hl:xyz:SILVER', 'hl:xyz:CL', 'hl:xyz:EUR', 'bnf:XAUUSDT'
]

export function formatPrice(v: number, precision: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision })
}

export class Watchlist {
  ids: string[]
  private byId = new Map<string, Market>()
  private tickers = new Map<string, Ticker>()
  private currentId = ''
  private body = document.getElementById('wlBody') as HTMLElement

  constructor(private onPick: (m: Market) => void, private onChange: () => void) {
    try {
      this.ids = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? DEFAULT
    } catch {
      this.ids = DEFAULT
    }
  }

  setMarkets(ms: Market[]): void {
    this.byId = new Map(ms.map(m => [m.id, m]))
    this.render()
  }

  markets(): Market[] {
    return this.ids.map(id => this.byId.get(id)).filter((m): m is Market => !!m)
  }

  has(id: string): boolean {
    return this.ids.includes(id)
  }

  toggle(m: Market): void {
    this.byId.set(m.id, m)
    this.ids = this.has(m.id) ? this.ids.filter(x => x !== m.id) : [...this.ids, m.id]
    localStorage.setItem(KEY, JSON.stringify(this.ids))
    this.render()
    this.onChange()
  }

  setCurrent(id: string): void {
    this.currentId = id
    this.body.querySelectorAll<HTMLElement>('.wl-row').forEach(r => r.classList.toggle('on', r.dataset.id === id))
  }

  setTickers(t: Map<string, Ticker>): void {
    t.forEach((v, k) => this.tickers.set(k, v))
    this.render()
  }

  private render(): void {
    this.body.innerHTML = ''
    const ms = this.markets()
    const count = document.getElementById('wlCount')
    if (count) count.textContent = ms.length ? String(ms.length) : ''
    if (ms.length === 0) {
      const d = document.createElement('div')
      d.className = 'wl-empty'
      d.textContent = this.byId.size === 0 ? 'Cargando mercados…' : 'Tu lista está vacía. Abre un símbolo y pulsa la estrella para añadirlo.'
      this.body.appendChild(d)
      return
    }
    for (const m of ms) {
      const t = this.tickers.get(m.id)
      const row = document.createElement('div')
      row.className = 'wl-row' + (m.id === this.currentId ? ' on' : '')
      row.dataset.id = m.id
      row.innerHTML = `
        <div class="wl-ticker"></div>
        <div class="wl-price">${t ? formatPrice(t.price, m.pricePrecision) : '—'}</div>
        <div class="wl-name"></div>
        <div class="wl-chg ${t ? (t.change >= 0 ? 'up' : 'down') : ''}">${t ? `${t.change >= 0 ? '+' : ''}${t.change.toFixed(2)}%` : ''}</div>
        <button class="wl-x" title="Quitar de la lista">${icon('close', 12)}</button>`
      const tick = row.querySelector('.wl-ticker') as HTMLElement
      tick.textContent = m.ticker
      const src = document.createElement('small')
      src.textContent = adapterOf(m.source).short
      tick.appendChild(src)
      ;(row.querySelector('.wl-name') as HTMLElement).textContent = m.name
      row.onclick = () => this.onPick(m)
      ;(row.querySelector('.wl-x') as HTMLElement).onclick = e => {
        e.stopPropagation()
        this.toggle(m)
      }
      this.body.appendChild(row)
    }
  }
}
