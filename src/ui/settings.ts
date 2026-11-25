import type { CandleType, Chart } from 'klinecharts'
import { DEFAULT_FIB_LEVELS, getFibLevels, setFibLevels } from '../chart/overlays'
import { setPriceScale, type PriceScale } from '../chart/volume'
import { FEEDBACK_URL } from '../config'
import { drawingsDb } from '../store/db'
import { dialog, toast } from './feedback'
import { icon } from './icons'
import { panelHeader, placeBelow, Popup } from './popup'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const PREFS_KEY = 'chartit:prefs'
/** localStorage keys that are cache, not the person's work. */
const NOT_BACKED_UP = ['chartit:catalog:v1']

export interface Prefs {
  candle: CandleType
  scale: PriceScale
  /** Same drawings for the same asset on every exchange */
  shareDrawings: boolean
}

const DEFAULTS: Prefs = { candle: 'candle_solid', scale: 'normal', shareDrawings: true }

const CANDLES: Array<[CandleType, string, string]> = [
  ['candle_solid', 'Velas', 'ctCandles'],
  ['candle_up_stroke', 'Huecas', 'ctHollow'],
  ['ohlc', 'Barras', 'ctBars'],
  ['area', 'Línea', 'ctArea']
]
const SCALES: Array<[PriceScale, string]> = [
  ['normal', 'Normal'],
  ['logarithm', 'Logarítmica'],
  ['percentage', 'Porcentaje']
]

export function readPrefs(): Prefs {
  let saved: Partial<Prefs> = {}
  try {
    saved = (JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) ?? {}
  } catch {
    /* corrupted: defaults */
  }
  return {
    candle: CANDLES.some(([id]) => id === saved.candle) ? (saved.candle as CandleType) : DEFAULTS.candle,
    scale: SCALES.some(([id]) => id === saved.scale) ? (saved.scale as PriceScale) : DEFAULTS.scale,
    shareDrawings: typeof saved.shareDrawings === 'boolean' ? saved.shareDrawings : DEFAULTS.shareDrawings
  }
}

export function applyPrefs(chart: Chart, p: Prefs): void {
  chart.setStyles({ candle: { type: p.candle } })
  setPriceScale(chart, p.scale)
}

/**
 * Gear menu: chart type, price scale, backup of drawings and help.
 */
export class SettingsMenu {
  private panel = $('settingsPanel')
  private popup: Popup
  private prefs: Prefs

  constructor(
    private chart: Chart,
    private hooks: { onShortcuts: () => void; beforeImport: () => void; onShareDrawings: () => void }
  ) {
    this.prefs = readPrefs()
    const btn = $('settingsBtn')
    btn.innerHTML = icon('gear', 18)
    this.popup = new Popup(this.panel, [btn], {
      onOpen: () => {
        this.render()
        placeBelow(this.panel, btn)
        // Right-aligned under the gear.
        const r = btn.getBoundingClientRect()
        this.panel.style.left = `${Math.max(8, r.right - this.panel.offsetWidth)}px`
      }
    })
  }

  private set(patch: Partial<Prefs>): void {
    this.prefs = { ...this.prefs, ...patch }
    localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs))
    applyPrefs(this.chart, this.prefs)
    this.render()
  }

  private render(): void {
    const p = this.panel
    p.innerHTML = ''
    p.appendChild(panelHeader('Ajustes', () => this.popup.close()))
    const body = document.createElement('div')
    body.className = 'panel-body settings'
    p.appendChild(body)

    const h = (t: string) => {
      const e = document.createElement('h4')
      e.textContent = t
      body.appendChild(e)
    }

    h('Tipo de gráfico')
    const types = document.createElement('div')
    types.className = 'seg-grid'
    for (const [id, label, ic] of CANDLES) {
      const b = document.createElement('button')
      b.className = 'seg-tile' + (this.prefs.candle === id ? ' on' : '')
      b.innerHTML = `${icon(ic, 20)}<span>${label}</span>`
      b.onclick = () => this.set({ candle: id })
      types.appendChild(b)
    }
    body.appendChild(types)

    h('Escala de precio')
    const scales = document.createElement('div')
    scales.className = 'seg'
    for (const [id, label] of SCALES) {
      const b = document.createElement('button')
      b.textContent = label
      b.className = this.prefs.scale === id ? 'on' : ''
      b.onclick = () => this.set({ scale: id })
      scales.appendChild(b)
    }
    body.appendChild(scales)

    h('Niveles de Fibonacci')
    const fib = document.createElement('form')
    fib.className = 'fib-form'
    const fibInput = document.createElement('input')
    fibInput.value = getFibLevels().join(', ')
    fibInput.spellcheck = false
    fibInput.setAttribute('aria-label', 'Niveles de Fibonacci separados por coma')
    const fibOk = document.createElement('button')
    fibOk.type = 'submit'
    fibOk.className = 'btn'
    fibOk.textContent = 'Aplicar'
    const fibReset = document.createElement('button')
    fibReset.type = 'button'
    fibReset.className = 'btn ghost'
    fibReset.textContent = 'Original'
    fibReset.onclick = () => {
      setFibLevels(DEFAULT_FIB_LEVELS)
      this.redrawFib()
      this.render()
    }
    fib.onsubmit = e => {
      e.preventDefault()
      const levels = fibInput.value
        .split(/[,;\s]+/)
        .map(x => Number(x.replace('%', '')) / (x.includes('%') ? 100 : 1))
        .filter(n => Number.isFinite(n) && n >= -5 && n <= 10)
      if (!levels.length) return toast('Escribe niveles como 0, 0.382, 0.618, 1', 'error')
      setFibLevels([...new Set(levels)])
      this.redrawFib()
      this.render()
      toast('Niveles de Fibonacci actualizados en todos tus retrocesos.')
    }
    fib.append(fibInput, fibOk, fibReset)
    body.appendChild(fib)

    h('Tus dibujos')
    const note = document.createElement('p')
    note.className = 'settings-note'
    note.textContent = 'Se guardan solo en este navegador. Haz un respaldo para llevarlos a otro equipo o no perderlos.'
    body.appendChild(note)
    const share = document.createElement('button')
    share.className = 'menu-item switch-item'
    share.setAttribute('role', 'switch')
    share.setAttribute('aria-checked', String(this.prefs.shareDrawings))
    share.innerHTML = `${icon('layers', 18)}<span class="mi-text"><span>Mismos dibujos en todas las fuentes</span><small>BTC de Binance, Bybit y Hyperliquid comparten dibujos</small></span><span class="switch${this.prefs.shareDrawings ? ' on' : ''}"></span>`
    share.onclick = () => {
      this.set({ shareDrawings: !this.prefs.shareDrawings })
      this.hooks.onShareDrawings()
    }
    body.appendChild(share)
    body.appendChild(this.item('download', 'Descargar respaldo', 'Dibujos, listas y favoritos en un archivo', () => void this.exportBackup()))
    body.appendChild(this.item('upload', 'Restaurar respaldo', 'Desde un archivo .json de Chart-It', () => this.pickBackup()))
    const protectedNote = document.createElement('p')
    protectedNote.className = 'settings-note'
    body.appendChild(protectedNote)
    void navigator.storage?.persisted?.().then(ok => {
      protectedNote.textContent = ok
        ? 'Almacenamiento protegido: el navegador no borrará tus dibujos para liberar espacio.'
        : 'Almacenamiento no protegido: el navegador podría borrar tus dibujos si se queda sin espacio o si pasas días sin entrar. Haz respaldos.'
    })

    h('Ayuda')
    body.appendChild(this.item('keyboard', 'Atajos de teclado', '', () => {
      this.popup.close()
      this.hooks.onShortcuts()
    }, '?'))
    if (FEEDBACK_URL) {
      body.appendChild(this.item('edit', 'Enviar comentarios', 'Ideas, errores, lo que quieras', () => window.open(FEEDBACK_URL, '_blank', 'noopener')))
    }
    const legal = document.createElement('div')
    legal.className = 'settings-links'
    legal.innerHTML =
      '<a href="/legal/terminos.html" target="_blank" rel="noopener">Términos</a>' +
      '<a href="/legal/privacidad.html" target="_blank" rel="noopener">Privacidad</a>' +
      '<a href="/legal/licencias-terceros.txt" target="_blank" rel="noopener">Licencias</a>' +
      `<span>Chart-It ${__APP_VERSION__}</span>`
    body.appendChild(legal)
  }

  /** Retracements re-read the levels when they are redrawn. */
  private redrawFib(): void {
    // Restyling with nothing new makes the chart repaint every drawing.
    this.chart.setStyles({})
  }

  private item(ic: string, title: string, sub: string, onClick: () => void, key?: string): HTMLElement {
    const b = document.createElement('button')
    b.className = 'menu-item'
    b.innerHTML = `${icon(ic, 18)}<span class="mi-text"><span>${title}</span>${sub ? `<small>${sub}</small>` : ''}</span>${key ? `<kbd>${key}</kbd>` : ''}`
    b.onclick = onClick
    return b
  }

  // ---------------------------------------------------------------- backup --

  private async exportBackup(): Promise<void> {
    const entries = await drawingsDb.entries().catch(() => [] as Array<[string, unknown]>)
    const storage: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('chartit:') && !NOT_BACKED_UP.includes(k)) storage[k] = localStorage.getItem(k) ?? ''
    }
    const drawings = Object.fromEntries(entries)
    const count = entries.reduce((n, [, v]) => n + (Array.isArray(v) ? v.length : 0), 0)
    const data = { app: 'chart-it', version: 1, exportedAt: new Date().toISOString(), drawings, storage }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `chart-it-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    localStorage.setItem('chartit:last-backup', String(Date.now()))
    toast(`Respaldo descargado: ${count.toLocaleString('es')} dibujos en ${entries.length} símbolos.`)
  }

  private pickBackup(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const f = input.files?.[0]
      if (f) void this.importBackup(f)
    }
    input.click()
  }

  private async importBackup(file: File): Promise<void> {
    let data: { app?: string; drawings?: Record<string, unknown>; storage?: Record<string, string> }
    try {
      data = JSON.parse(await file.text())
    } catch {
      toast('Ese archivo no es un respaldo válido.', 'error')
      return
    }
    if (data.app !== 'chart-it' || typeof data.drawings !== 'object' || !data.drawings) {
      toast('Ese archivo no es un respaldo de Chart-It.', 'error')
      return
    }
    const drawings = Object.entries(data.drawings).filter(([k, v]) => k.startsWith('market:') && Array.isArray(v))
    const count = drawings.reduce((n, [, v]) => n + (v as unknown[]).length, 0)
    const ok = await dialog({
      title: 'Restaurar respaldo',
      message: `Contiene ${count.toLocaleString('es')} dibujos en ${drawings.length} símbolos. Los dibujos de esos símbolos se reemplazarán; los demás no se tocan. También se restauran tu lista y tus favoritos.`,
      ok: 'Restaurar'
    })
    if (ok === null) return
    this.hooks.beforeImport()
    try {
      for (const [k, v] of drawings) await drawingsDb.put(k, v)
    } catch {
      toast('No se pudo restaurar el respaldo: el navegador no permitió guardar los dibujos.', 'error', 8000)
      return
    }
    for (const [k, v] of Object.entries(data.storage ?? {})) {
      if (k.startsWith('chartit:') && typeof v === 'string' && !NOT_BACKED_UP.includes(k)) localStorage.setItem(k, v)
    }
    location.reload()
  }
}
