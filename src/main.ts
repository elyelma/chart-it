import '@fontsource-variable/inter'
import './style.css'
import './chart/overlays'
import { init, type Chart, type KLineData } from 'klinecharts'
import { DrawingManager } from './chart/drawings'
import { TOOLS } from './chart/overlays'
import { CHART_STYLES, COLORS } from './chart/theme'
import { isBuilt, loadBars, subscribeBars } from './data/bars'
import { adapterOf, cachedMarkets, fetchTickers, loadAllMarkets } from './data/registry'
import { timeframeById } from './data/timeframes'
import type { Market, Timeframe } from './data/types'
import { requestPersistentStorage } from './store/db'
import { DrawingMenu } from './ui/contextMenu'
import { Dock } from './ui/dock'
import { dialog, installTooltips, toast } from './ui/feedback'
import { icon, LOGO } from './ui/icons'
import { closeTopPopup } from './ui/popup'
import { SymbolSearch } from './ui/symbolSearch'
import { IndicatorsPanel } from './ui/indicators'
import { applyPrefs, readPrefs, SettingsMenu } from './ui/settings'
import { ShortcutsSheet } from './ui/shortcuts'
import { TimeframePicker } from './ui/tfPicker'
import { formatPrice, Watchlist } from './ui/watchlist'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

// ------------------------------------------------------------------ state --

const LAST_KEY = 'chartit:last'
const UI_KEY = 'chartit:ui'

const FALLBACK: Market = {
  id: 'bn:BTCUSDT', source: 'binance', symbol: 'BTCUSDT', ticker: 'BTCUSDT', name: 'BTC / USDT',
  category: 'crypto', kind: 'spot', pricePrecision: 2, volumePrecision: 5, aliases: ['BTC']
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

const last = readJson<{ market: Market; tf: string }>(LAST_KEY, { market: FALLBACK, tf: '1h' })
let market: Market = last.market
let tf: Timeframe = timeframeById(last.tf)
let catalog: Market[] = cachedMarkets() ?? []
let loadToken = 0
let unsubscribe: (() => void) | null = null
let lastBar: KLineData | null = null

// ------------------------------------------------------------------ chart --

const chart = init('chart', {
  locale: 'es-MX',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  styles: CHART_STYLES
}) as Chart

const status = $('chartStatus')
function setStatus(text: string | null): void {
  status.hidden = !text
  status.textContent = text ?? ''
}

chart.setDataLoader({
  getBars: async ({ type, timestamp, callback }) => {
    const token = loadToken
    const m = market
    const t = tf
    if (type === 'backward') {
      // We always start from the latest candle, so there is nothing newer to load.
      callback([], { backward: false, forward: true })
      return
    }
    if (type === 'init') setStatus(isBuilt(m, t) ? `Armando velas de ${t.label}…` : 'Cargando velas…')
    try {
      const before = type === 'forward' ? timestamp : null
      let bars = await loadBars(m, t, before, type === 'init' ? 600 : 800)
      if (token !== loadToken) return
      if (before !== null) bars = bars.filter(b => b.timestamp < before)
      callback(bars, { forward: bars.length > 0, backward: false })
      if (type === 'init') {
        setStatus(bars.length === 0 ? 'Sin datos para este mercado y temporalidad.' : null)
        lastBar = bars[bars.length - 1] ?? null
        renderQuote()
        drawings.dataReady()
      }
    } catch (err) {
      if (token !== loadToken) return
      callback([], { forward: false, backward: false })
      if (type === 'init') {
        setStatus('No se pudieron cargar los datos.')
        toast(`${adapterOf(m.source).label}: ${(err as Error).message}`, 'error', 6000)
        drawings.dataReady()
      }
    }
  },
  subscribeBar: ({ callback }) => {
    unsubscribe?.()
    const token = loadToken
    unsubscribe = subscribeBars(market, tf, bar => {
      if (token !== loadToken) return
      callback(bar)
      lastBar = bar
      scheduleQuote()
    })
  },
  unsubscribeBar: () => {
    unsubscribe?.()
    unsubscribe = null
  }
})

new ResizeObserver(() => chart.resize()).observe($('chart'))
// Canvas text is drawn before the web font arrives: redraw once it is ready.
void document.fonts.load("600 11px 'Inter Variable'").then(() => chart.setStyles(CHART_STYLES))
if (import.meta.env.DEV) Object.assign(window, { __chart: chart })

// ---------------------------------------------------------------- drawings --

const drawings = new DrawingManager(chart, {
  onCountChange: n => dock.setCount(n),
  onSelect: (o, look) => dock.showProps(o, look),
  onToolDone: () => dock.select('cursor'),
  onTextRequest: current => dialog({ title: 'Texto', input: current, ok: 'Listo' }),
  onContextMenu: o => drawingMenu.open(o)
})
const dock = new Dock(drawings)
const drawingMenu = new DrawingMenu(drawings)

// ----------------------------------------------------------------- header --

$('brand').innerHTML = `${LOGO}<span>Chart<b>-It</b></span>`
$('shotBtn').innerHTML = icon('camera')
$('listBtn').innerHTML = icon('list')
$('symCaret').innerHTML = icon('chevDown', 14)

const tfPicker = new TimeframePicker(tf, t => setTimeframe(t))

let quoteChange: number | null = null
let quoteRaf = 0
function scheduleQuote(): void {
  if (!quoteRaf) quoteRaf = requestAnimationFrame(() => {
    quoteRaf = 0
    renderQuote()
  })
}
function renderQuote(): void {
  $('quotePrice').textContent = lastBar ? formatPrice(lastBar.close, market.pricePrecision) : '—'
  const ch = $('quoteChange')
  ch.textContent = quoteChange === null ? '' : `${quoteChange >= 0 ? '+' : ''}${quoteChange.toFixed(2)}% 24h`
  ch.className = 'quote-change ' + (quoteChange === null ? '' : quoteChange >= 0 ? 'up' : 'down')
}

function renderHeader(): void {
  $('symTicker').textContent = market.ticker
  const perp247 = market.kind === 'perp' && market.category !== 'crypto'
  $('symSrc').textContent = `${adapterOf(market.source).label} · ${market.name}` + (perp247 ? ' · perpetuo 24/7' : '')
  $('symbolBtn').title = perp247
    ? 'Contrato perpetuo: sigue al precio del subyacente y cotiza también cuando su mercado está cerrado. (Ctrl+K para buscar)'
    : 'Buscar símbolo (Ctrl+K)'
  tfPicker.setCurrent(tf)
  const star = $('starBtn')
  star.innerHTML = icon('star')
  star.classList.toggle('on', watchlist.has(market.id))
  star.title = watchlist.has(market.id) ? 'Quitar de la lista' : 'Añadir a la lista'
  document.title = `${market.ticker} · Chart-It`
}

// ---------------------------------------------------------- market / tf ---

function persist(): void {
  localStorage.setItem(LAST_KEY, JSON.stringify({ market, tf: tf.id }))
  history.replaceState(null, '', `#${encodeURIComponent(market.id)}/${tf.id}`)
}

async function setMarket(m: Market): Promise<void> {
  loadToken++
  market = m
  lastBar = null
  quoteChange = null
  dock.select('cursor')
  renderHeader()
  renderQuote()
  watchlist.setCurrent(m.id)
  persist()
  await drawings.setMarket(m.id)
  chart.setSymbol({ ticker: `${m.ticker} · ${adapterOf(m.source).label}`, id: m.id, pricePrecision: m.pricePrecision, volumePrecision: m.volumePrecision })
  void refreshTickers()
}

function setTimeframe(t: Timeframe): void {
  if (t.id === tf.id) return
  loadToken++
  tf = t
  renderHeader()
  persist()
  chart.setPeriod(t.period)
}

// -------------------------------------------------------------- watchlist --

const watchlist = new Watchlist(m => void setMarket(m), () => renderHeader())
$('starBtn').onclick = () => watchlist.toggle(market)

const ui = readJson<{ list: boolean }>(UI_KEY, { list: window.innerWidth > 900 })
function setListOpen(open: boolean): void {
  ui.list = open
  $('watchlist').hidden = !open
  $('listBtn').classList.toggle('on', open)
  localStorage.setItem(UI_KEY, JSON.stringify(ui))
}
$('listBtn').onclick = () => setListOpen(!ui.list)
$('wlClose').innerHTML = icon('close', 16)
$('wlClose').onclick = () => setListOpen(false)
setListOpen(ui.list)

async function refreshTickers(): Promise<void> {
  const ms = [...watchlist.markets()]
  if (!ms.some(m => m.id === market.id)) ms.push(market)
  const t = await fetchTickers(ms)
  watchlist.setTickers(t)
  const mine = t.get(market.id)
  if (mine) {
    quoteChange = mine.change
    renderQuote()
  }
}
setInterval(() => {
  if (!document.hidden) void refreshTickers()
}, 10_000)

// ----------------------------------------------------------------- search --

const search = new SymbolSearch(m => void setMarket(m))
$('symbolBtn').onclick = () => search.open()

function applyCatalog(ms: Market[], loading: boolean): void {
  catalog = ms
  search.setMarkets(ms, loading)
  watchlist.setMarkets(ms)
  // Refresh precision etc. of the open market with fresh catalog data.
  const fresh = ms.find(m => m.id === market.id)
  if (fresh) market = { ...fresh }
}

applyCatalog(catalog, catalog.length === 0)
void loadAllMarkets().then(({ markets, failed }) => {
  if (markets.length) applyCatalog(markets, false)
  if (failed.length) toast(`No se pudo cargar el catálogo de: ${failed.join(', ')}`, 'error', 6000)
  void refreshTickers()
})

// ------------------------------------------------------------- indicators --

new IndicatorsPanel(chart)
applyPrefs(chart, readPrefs())

const shortcuts = new ShortcutsSheet()
new SettingsMenu(chart, { onShortcuts: () => shortcuts.open(), beforeImport: () => drawings.flushSave() })

// ------------------------------------------------------------- screenshot --

$('shotBtn').onclick = () => {
  const url = chart.getConvertPictureUrl(true, 'png', COLORS.bg)
  const a = document.createElement('a')
  a.href = url
  a.download = `Chart-It_${market.ticker}_${tf.id}_${new Date().toISOString().slice(0, 10)}.png`
  a.click()
}

// --------------------------------------------------------------- keyboard --

const TOOL_KEYS = new Map(TOOLS.filter(t => t.key).map(t => [t.key as string, t.name]))

document.addEventListener('keydown', e => {
  const target = e.target as HTMLElement
  const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
  if (!$('dialog').hidden) return
  if (e.key === 'Escape' && closeTopPopup()) {
    e.preventDefault()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    search.open()
    return
  }
  if (typing || search.isOpen) return
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault()
      drawings.undo()
    } else if (k === 'd') {
      e.preventDefault()
      drawings.duplicateSelected()
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault()
      drawings.redo()
    }
    return
  }
  if (e.altKey) return
  if (e.key === 'Escape') {
    dock.select('cursor')
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    drawings.removeSelected()
  } else if (e.key === '?') {
    shortcuts.toggle()
  } else if (e.key === '/') {
    e.preventDefault()
    search.open()
  } else {
    const tool = TOOL_KEYS.get(e.key.toLowerCase())
    if (tool) dock.select(tool)
  }
})

// ------------------------------------------------------------------- boot --

installTooltips()
requestPersistentStorage()

// Deep link: #<marketId>/<tf>
const hash = decodeURIComponent(location.hash.slice(1))
if (hash) {
  const [id, tfId] = hash.split('/')
  const fromHash = catalog.find(m => m.id === id)
  if (fromHash) market = fromHash
  if (tfId) tf = timeframeById(tfId)
}

chart.setPeriod(tf.period)
void setMarket(market)

window.addEventListener('hashchange', () => {
  const [id, tfId] = decodeURIComponent(location.hash.slice(1)).split('/')
  const m = catalog.find(x => x.id === id)
  if (tfId && tfId !== tf.id) setTimeframe(timeframeById(tfId))
  if (m && m.id !== market.id) void setMarket(m)
})
