import type { Chart } from 'klinecharts'
import { hideVolume, showVolume } from '../chart/volume'
import { Favorites } from './favorites'
import { icon } from './icons'
import { panelHeader, placeBelow, Popup } from './popup'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const ACTIVE_KEY = 'chartit:indicators:v2'
const PARAMS_KEY = 'chartit:ind-params'

interface IndDef {
  name: string
  label: string
  /** Drawn over the candles (true) or in its own pane below */
  main: boolean
  /** Names of the parameters, in the library's order */
  params?: string[]
}

const CATALOG: IndDef[] = [
  { name: 'VOL', label: 'Volumen', main: true },
  { name: 'MA', label: 'Media móvil', main: true, params: ['Periodo 1', 'Periodo 2', 'Periodo 3', 'Periodo 4'] },
  { name: 'EMA', label: 'Media exponencial', main: true, params: ['Periodo 1', 'Periodo 2', 'Periodo 3'] },
  { name: 'SMA', label: 'Media suavizada', main: true, params: ['Periodo', 'Peso'] },
  { name: 'BOLL', label: 'Bandas de Bollinger', main: true, params: ['Periodo', 'Desviaciones'] },
  { name: 'SAR', label: 'Parabólico SAR', main: true, params: ['Inicio', 'Paso', 'Máximo'] },
  { name: 'BBI', label: 'Índice alcista/bajista', main: true, params: ['P1', 'P2', 'P3', 'P4'] },
  { name: 'RSI', label: 'Fuerza relativa', main: false, params: ['Periodo 1', 'Periodo 2', 'Periodo 3'] },
  { name: 'MACD', label: 'MACD', main: false, params: ['Rápida', 'Lenta', 'Señal'] },
  { name: 'KDJ', label: 'Estocástico', main: false, params: ['Periodo', 'K', 'D'] },
  { name: 'CCI', label: 'Canal de materias primas', main: false, params: ['Periodo'] },
  { name: 'WR', label: 'Williams %R', main: false, params: ['P1', 'P2', 'P3'] },
  { name: 'DMI', label: 'Movimiento direccional', main: false, params: ['Periodo', 'ADX'] },
  { name: 'OBV', label: 'Volumen en balance', main: false, params: ['Media'] },
  { name: 'ROC', label: 'Tasa de cambio', main: false, params: ['Periodo', 'Media'] },
  { name: 'MTM', label: 'Momentum', main: false, params: ['Periodo', 'Media'] },
  { name: 'TRIX', label: 'TRIX', main: false, params: ['Periodo', 'Media'] },
  { name: 'AO', label: 'Oscilador asombroso', main: false, params: ['Corta', 'Larga'] },
  { name: 'BIAS', label: 'Desvío de la media', main: false, params: ['P1', 'P2', 'P3'] },
  { name: 'PSY', label: 'Línea psicológica', main: false, params: ['Periodo', 'Media'] },
  { name: 'VR', label: 'Ratio de volumen', main: false, params: ['Periodo', 'Media'] },
  { name: 'PVT', label: 'Precio y volumen', main: false },
  { name: 'EMV', label: 'Facilidad de movimiento', main: false, params: ['Periodo', 'Media'] }
]

const byName = (n: string) => CATALOG.find(d => d.name === n)

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Indicators menu: search, ★ favorites on top, active ones with editable
 * parameters. Volume lives inside the price pane; the rest follow the library.
 */
export class IndicatorsPanel {
  private panel = $('indPopover')
  private popup: Popup
  private favs = new Favorites('chartit:ind-favs', ['VOL', 'EMA', 'BOLL', 'RSI', 'MACD'])
  private active: string[]
  private params: Record<string, number[]>
  private editing: string | null = null
  private query = ''

  constructor(private chart: Chart) {
    this.active = readJson<string[]>(ACTIVE_KEY, ['VOL']).filter(n => byName(n))
    this.params = readJson<Record<string, number[]>>(PARAMS_KEY, {})
    const btn = $('indBtn')
    btn.innerHTML = `${icon('fx')}<span>Indicadores</span>`
    this.popup = new Popup(this.panel, [btn], {
      onOpen: () => {
        this.query = ''
        this.editing = null
        this.render()
        placeBelow(this.panel, btn)
        this.panel.querySelector<HTMLInputElement>('.panel-search')?.focus()
      }
    })
    this.favs.onChange(() => this.render())
    if (!this.active.includes('VOL')) hideVolume(chart)
    for (const n of this.active) this.create(n)
  }

  // ----------------------------------------------------------------- chart --

  private create(name: string): void {
    const def = byName(name)
    if (!def) return
    if (name === 'VOL') return showVolume(this.chart)
    const calcParams = this.params[name]
    if (def.main) this.chart.createIndicator({ name, paneId: 'candle_pane', ...(calcParams ? { calcParams } : {}) }, true)
    else this.chart.createIndicator({ name, ...(calcParams ? { calcParams } : {}) })
  }

  private toggle(name: string): void {
    if (this.active.includes(name)) {
      this.active = this.active.filter(n => n !== name)
      if (name === 'VOL') hideVolume(this.chart)
      else this.chart.removeIndicator({ name })
      if (this.editing === name) this.editing = null
    } else {
      this.active.push(name)
      this.create(name)
    }
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(this.active))
    this.render()
  }

  private currentParams(name: string): number[] {
    const ind = this.chart.getIndicators({ name })[0]
    return ((ind?.calcParams as number[] | undefined) ?? this.params[name] ?? []).slice()
  }

  private saveParams(name: string, values: number[]): void {
    this.params[name] = values
    localStorage.setItem(PARAMS_KEY, JSON.stringify(this.params))
    this.chart.overrideIndicator({ name, calcParams: values })
  }

  // ----------------------------------------------------------------- panel --

  private render(): void {
    const p = this.panel
    const hadFocus = document.activeElement?.classList.contains('panel-search')
    p.innerHTML = ''
    p.appendChild(panelHeader('Indicadores', () => this.popup.close()))

    const wrap = document.createElement('div')
    wrap.className = 'panel-search-wrap'
    wrap.innerHTML = icon('search', 16)
    const input = document.createElement('input')
    input.type = 'search'
    input.className = 'panel-search'
    input.placeholder = 'Buscar indicador…'
    input.value = this.query
    input.oninput = () => {
      this.query = input.value
      this.render()
    }
    wrap.appendChild(input)
    p.appendChild(wrap)

    const body = document.createElement('div')
    body.className = 'panel-body'
    p.appendChild(body)
    const q = this.query.trim().toLowerCase()
    const match = (d: IndDef) => !q || d.label.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)
    const section = (title: string, defs: IndDef[]) => {
      if (!defs.length) return
      const h = document.createElement('h4')
      h.textContent = title
      body.appendChild(h)
      for (const d of defs) {
        body.appendChild(this.row(d))
        if (this.editing === d.name) body.appendChild(this.editor(d))
      }
    }
    if (!q) section('En el gráfico', this.active.map(byName).filter((d): d is IndDef => !!d))
    section('Favoritos', CATALOG.filter(d => this.favs.has(d.name) && (q ? match(d) : !this.active.includes(d.name))))
    section('Sobre las velas', CATALOG.filter(d => d.main && !this.favs.has(d.name) && match(d) && (q || !this.active.includes(d.name))))
    section('En panel aparte', CATALOG.filter(d => !d.main && !this.favs.has(d.name) && match(d) && (q || !this.active.includes(d.name))))
    if (!body.childElementCount) {
      const none = document.createElement('div')
      none.className = 'panel-empty'
      none.textContent = 'Ningún indicador se llama así.'
      body.appendChild(none)
    }
    if (hadFocus) {
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
  }

  private row(d: IndDef): HTMLElement {
    const on = this.active.includes(d.name)
    const row = document.createElement('div')
    row.className = 'ind-row' + (on ? ' on' : '')
    const main = document.createElement('button')
    main.className = 'ind-main'
    const pv = on && d.params ? this.currentParams(d.name).join(', ') : ''
    main.innerHTML = `<span class="ind-check">${on ? icon('check', 12) : ''}</span><span class="ind-label"></span><small>${d.name}${pv ? ` · ${pv}` : ''}</small>`
    ;(main.querySelector('.ind-label') as HTMLElement).textContent = d.label
    main.onclick = () => this.toggle(d.name)
    row.appendChild(main)
    if (on && d.params) {
      const cfg = document.createElement('button')
      cfg.className = 'star-btn cfg' + (this.editing === d.name ? ' on-cfg' : '')
      cfg.innerHTML = icon('gear', 15)
      cfg.dataset.tip = 'Parámetros'
      cfg.onclick = () => {
        this.editing = this.editing === d.name ? null : d.name
        this.render()
      }
      row.appendChild(cfg)
    }
    const fav = this.favs.has(d.name)
    const star = document.createElement('button')
    star.className = 'star-btn' + (fav ? ' on' : '')
    star.innerHTML = icon('star', 15)
    star.dataset.tip = fav ? 'Quitar de favoritos' : 'Favorito'
    star.onclick = () => this.favs.toggle(d.name)
    row.appendChild(star)
    return row
  }

  private editor(d: IndDef): HTMLElement {
    const box = document.createElement('form')
    box.className = 'ind-editor'
    const values = this.currentParams(d.name)
    const inputs: HTMLInputElement[] = []
    ;(d.params ?? []).forEach((label, i) => {
      if (values[i] === undefined) return
      const l = document.createElement('label')
      const s = document.createElement('span')
      s.textContent = label
      const inp = document.createElement('input')
      inp.type = 'number'
      inp.min = '0'
      inp.step = 'any'
      inp.value = String(values[i])
      inputs.push(inp)
      l.append(s, inp)
      box.appendChild(l)
    })
    const actions = document.createElement('div')
    actions.className = 'ind-editor-actions'
    const reset = document.createElement('button')
    reset.type = 'button'
    reset.className = 'btn ghost'
    reset.textContent = 'Por defecto'
    reset.onclick = () => {
      delete this.params[d.name]
      localStorage.setItem(PARAMS_KEY, JSON.stringify(this.params))
      this.chart.removeIndicator({ name: d.name })
      this.create(d.name)
      this.render()
    }
    const ok = document.createElement('button')
    ok.type = 'submit'
    ok.className = 'btn primary'
    ok.textContent = 'Aplicar'
    actions.append(reset, ok)
    box.appendChild(actions)
    box.onsubmit = e => {
      e.preventDefault()
      const next = inputs.map((inp, i) => {
        const v = Number(inp.value)
        return Number.isFinite(v) && v > 0 ? v : values[i]
      })
      this.saveParams(d.name, next)
      this.editing = null
      this.render()
    }
    return box
  }
}
