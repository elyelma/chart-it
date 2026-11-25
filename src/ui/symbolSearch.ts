import { adapterOf, searchMarkets } from '../data/registry'
import type { Market } from '../data/types'
import { CATEGORY_LABEL } from '../data/util'
import { icon } from './icons'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const CHIPS: Array<[string, string]> = [['all', 'Todo'], ...Object.entries(CATEGORY_LABEL)]

export class SymbolSearch {
  private markets: Market[] = []
  private results: Market[] = []
  private active = 0
  private category = 'all'
  private root = $('searchModal')
  private input = $<HTMLInputElement>('searchInput')
  private list = $('searchResults')

  constructor(private onPick: (m: Market) => void) {
    $('searchIcon').innerHTML = icon('search')
    const chips = $('searchChips')
    for (const [id, label] of CHIPS) {
      const b = document.createElement('button')
      b.textContent = label
      b.dataset.cat = id
      b.onclick = () => {
        this.category = id
        this.render()
        this.input.focus()
      }
      chips.appendChild(b)
    }
    this.input.addEventListener('input', () => {
      this.active = 0
      this.render()
    })
    this.input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        this.move(e.key === 'ArrowDown' ? 1 : -1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const m = this.results[this.active]
        if (m) this.pick(m)
      } else if (e.key === 'Escape') {
        this.close()
      }
    })
    this.root.addEventListener('mousedown', e => {
      if (e.target === this.root) this.close()
    })
  }

  setMarkets(ms: Market[], loading: boolean): void {
    this.markets = ms
    $('searchFoot').textContent = loading
      ? 'Cargando catálogo de símbolos…'
      : `${ms.length.toLocaleString('es')} mercados · Binance, Bybit y Hyperliquid · ↑↓ para moverte, Enter para abrir`
    if (!this.root.hidden) this.render()
  }

  open(initial = ''): void {
    this.root.hidden = false
    this.input.value = initial
    this.active = 0
    this.render()
    this.input.focus()
  }

  close(): void {
    this.root.hidden = true
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  private pick(m: Market): void {
    this.close()
    this.onPick(m)
  }

  private move(d: number): void {
    if (this.results.length === 0) return
    this.active = (this.active + d + this.results.length) % this.results.length
    this.highlight()
  }

  private highlight(): void {
    this.list.querySelectorAll('.result').forEach((el, i) => el.classList.toggle('active', i === this.active))
    this.list.querySelector('.result.active')?.scrollIntoView({ block: 'nearest' })
  }

  private render(): void {
    $('searchChips').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.classList.toggle('on', b.dataset.cat === this.category))
    this.results = searchMarkets(this.markets, this.input.value, this.category)
    this.list.innerHTML = ''
    if (this.results.length === 0) {
      const div = document.createElement('div')
      div.className = 'no-results'
      div.textContent = this.markets.length === 0 ? 'Cargando…' : 'Sin resultados. Prueba con otro nombre (ej. "oro", "nasdaq", "EURUSD").'
      this.list.appendChild(div)
      return
    }
    const frag = document.createDocumentFragment()
    this.results.forEach((m, i) => {
      const row = document.createElement('div')
      row.className = 'result' + (i === this.active ? ' active' : '')
      const left = document.createElement('div')
      const t = document.createElement('span')
      t.className = 'r-ticker'
      t.textContent = m.ticker
      const n = document.createElement('span')
      n.className = 'r-name'
      n.textContent = m.name
      left.append(t, n)
      const cat = document.createElement('span')
      cat.className = 'r-cat'
      cat.textContent = CATEGORY_LABEL[m.category] + (m.kind === 'perp' ? ' · perp' : '')
      const src = document.createElement('span')
      src.className = `r-src ${m.source}`
      src.textContent = adapterOf(m.source).label
      row.append(left, cat, src)
      row.onmouseenter = () => {
        this.active = i
        this.highlight()
      }
      row.onclick = () => this.pick(m)
      frag.appendChild(row)
    })
    this.list.appendChild(frag)
  }
}
