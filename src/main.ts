import '@fontsource-variable/inter'
import './style.css'
import './chart/overlays'
import { init, type Chart, type KLineData } from 'klinecharts'
import { DrawingManager } from './chart/drawings'
import { setPriceUnitCategory, TOOLS } from './chart/overlays'
import { CHART_STYLES, COLORS, FONT } from './chart/theme'
import { isBuilt, loadBars, subscribeBars } from './data/bars'
import { adapterOf, cachedMarkets, fetchTickers, loadAllMarkets } from './data/registry'
import { timeframeById } from './data/timeframes'
import type { Market, Timeframe } from './data/types'
import { liveEvents } from './data/util'
import { assetKey } from './data/assets'
import { requestPersistentStorage } from './store/db'
import { DrawingMenu } from './ui/contextMenu'
import { DrawingList } from './ui/drawingList'
import { DrawingSettings } from './ui/drawingSettings'
import { Dock } from './ui/dock'
import { dialog, installTooltips, toast } from './ui/feedback'
import { icon, LOGO } from './ui/icons'
import { closeButton, closeTopPopup } from './ui/popup'
import { SymbolSearch } from './ui/symbolSearch'
import { IndicatorsPanel } from './ui/indicators'
import { applyPrefs, readPrefs, SettingsMenu } from './ui/settings'
import { ShortcutsSheet } from './ui/shortcuts'
import { openSupport, supportAddress } from './ui/support'
import { TimeframePicker } from './ui/tfPicker'
import { formatPrice, Watchlist } from './ui/watchlist'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

// ------------------------------------------------------------------ state --

const LAST_KEY = 'chartit:last'
const UI_KEY = 'chartit:ui'

/** First market for a new visitor: Hyperliquid answers from every region. */
const FALLBACK: Market = {
  id: 'hl:BTC', source: 'hyperliquid', symbol: 'BTC', ticker: 'BTC', name: 'BTC (perpetuo)',
  category: 'crypto', kind: 'perp', pricePrecision: 0, volumePrecision: 5, aliases: ['BTC', 'BTCUSD']
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

/** A stored market is used only if it still has the shape we need. */
function isMarket(x: unknown): x is Market {
  const m = x as Market | null
  return !!m && typeof m.id === 'string' && typeof m.source === 'string' && typeof m.symbol === 'string' &&
    typeof m.ticker === 'string' && Array.isArray(m.aliases) && Number.isFinite(m.pricePrecision) &&
    ['binance', 'binance-futures', 'bybit', 'hyperliquid'].includes(m.source)
}
const last = readJson<{ market?: unknown; tf?: unknown }>(LAST_KEY, {})
let market: Market = isMarket(last.market) ? last.market : FALLBACK
let tf: Timeframe = timeframeById(typeof last.tf === 'string' ? last.tf : '1h')
let catalog: Market[] = cachedMarkets() ?? []
let loadToken = 0
/** Market asked for in the link but not in the cached catalog yet. */
let pendingHashId: string | null = null
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
  status.classList.remove('error')
  status.textContent = text ?? ''
}

/** Load failure: say why in plain words and offer the same asset from another source. */
function showLoadError(m: Market, err: Error): void {
  const src = adapterOf(m.source).label
  const blocked = /HTTP (451|403)/.test(err.message)
  const offline = !navigator.onLine
  const base = m.aliases[0]?.toUpperCase()
  const alternatives = catalog
    .filter(x => x.source !== m.source && x.aliases[0]?.toUpperCase() === base)
    .slice(0, 3)
  status.hidden = false
  status.classList.add('error')
  status.innerHTML = ''
  const card = document.createElement('div')
  card.className = 'load-error'
  const title = document.createElement('b')
  title.textContent = offline ? 'Sin conexión a internet' : blocked ? `${src} no está disponible desde tu región` : `No pudimos cargar ${m.ticker}`
  const msg = document.createElement('p')
  msg.textContent = offline
    ? 'Los dibujos siguen a salvo. Cuando vuelva la conexión, recarga el gráfico.'
    : alternatives.length
      ? 'Puedes ver el mismo activo desde otra fuente:'
      : `${src} no respondió (${err.message}). Prueba de nuevo en un momento.`
  card.append(title, msg)
  const actions = document.createElement('div')
  actions.className = 'load-error-actions'
  for (const alt of alternatives) {
    const b = document.createElement('button')
    b.className = 'btn'
    b.textContent = `${alt.ticker} · ${adapterOf(alt.source).label}`
    b.onclick = () => void setMarket(alt)
    actions.appendChild(b)
  }
  const retry = document.createElement('button')
  retry.className = 'btn ghost'
  retry.textContent = 'Reintentar'
  retry.onclick = () => {
    setStatus('Cargando velas…')
    chart.resetData()
  }
  actions.appendChild(retry)
  card.appendChild(actions)
  status.appendChild(card)
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
        showLoadError(m, err as Error)
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
  onCountChange: n => {
    dock.setCount(n)
    drawingList.refresh()
    maybeRemindBackup(n)
  },
  onSelect: (o, look) => {
    dock.showProps(o, look)
    drawingSettings.selectionChanged()
  },
  onToolDone: () => dock.select('cursor'),
  onTextRequest: current => dialog({ title: 'Texto', input: current, ok: 'Listo' }),
  onContextMenu: o => drawingMenu.open(o),
  onSettings: () => drawingSettings.open(),
  onSaveError: () => {
    if (saveErrorShown) return
    saveErrorShown = true
    toast('No se pudieron guardar tus dibujos en este navegador (¿espacio lleno o modo privado?). Descarga un respaldo desde Ajustes.', 'error', 10000)
  }
})
let saveErrorShown = false
// Never lose the last stroke: write pending drawings when the page is hidden or closed.
window.addEventListener('pagehide', () => drawings.flushSave())
document.addEventListener('visibilitychange', () => {
  if (document.hidden) drawings.flushSave()
})
const dock = new Dock(drawings)
const drawingSettings = new DrawingSettings(drawings, () => market.pricePrecision)
dock.onSettings = () => drawingSettings.toggle()
const drawingMenu = new DrawingMenu(drawings, () => drawingSettings.open())
const drawingList = new DrawingList(drawings, dock.listButton, () => market.pricePrecision)

// ----------------------------------------------------------------- header --

$('brand').innerHTML = `${LOGO}<span>Graf<b>ito</b></span>`
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
  // Source and a plain-words disclaimer, always on screen.
  const note = $('tbNote')
  note.textContent = `Datos de ${adapterOf(market.source).label}${perp247 ? ' (perpetuo)' : ''} · Solo información, no es asesoría financiera · `
  const terms = document.createElement('a')
  terms.href = '/legal/terminos.html'
  terms.target = '_blank'
  terms.rel = 'noopener'
  terms.textContent = 'Términos'
  note.appendChild(terms)
  if (supportAddress) {
    const tip = document.createElement('a')
    tip.href = '#'
    tip.textContent = 'Apoya ☕'
    tip.onclick = e => {
      e.preventDefault()
      void openSupport()
    }
    note.append(' · ', tip)
  }
  const star = $('starBtn')
  star.innerHTML = icon('star')
  star.classList.toggle('on', watchlist.has(market.id))
  star.title = watchlist.has(market.id) ? 'Quitar de la lista' : 'Añadir a la lista'
  star.setAttribute('aria-label', star.title)
  star.setAttribute('aria-pressed', String(watchlist.has(market.id)))
  document.title = `${market.ticker} · Grafito`
}

// ---------------------------------------------------------- market / tf ---

function persist(): void {
  localStorage.setItem(LAST_KEY, JSON.stringify({ market, tf: tf.id }))
  history.replaceState(null, '', `#${encodeURIComponent(market.id)}/${tf.id}`)
}

/** Where the drawings of a market are kept: per asset (shared across exchanges) or per market. */
function drawingsKey(m: Market): string {
  return readPrefs().shareDrawings ? `asset:${assetKey(m)}` : m.id
}

let switchingMarket = false

async function setMarket(m: Market): Promise<void> {
  const token = ++loadToken
  switchingMarket = true
  // The person chose a market: a link still waiting for the catalog no longer applies.
  pendingHashId = null
  market = m
  setPriceUnitCategory(m.category)
  lastBar = null
  quoteChange = null
  dock.select('cursor')
  renderHeader()
  renderQuote()
  watchlist.setCurrent(m.id)
  persist()
  // Shared by asset: the same asset on every exchange contributes its own past drawings once.
  const seeds = readPrefs().shareDrawings
    ? [m.id, ...catalog.filter(x => x.id !== m.id && assetKey(x) === assetKey(m)).map(x => x.id)]
    : []
  await drawings.setMarket(drawingsKey(m), seeds)
  // Another market was picked while the drawings loaded: that call takes over.
  if (token !== loadToken) return
  switchingMarket = false
  chart.setSymbol({ ticker: `${m.ticker} · ${adapterOf(m.source).label}`, id: m.id, pricePrecision: m.pricePrecision, volumePrecision: m.volumePrecision })
  void refreshTickers()
}

function setTimeframe(t: Timeframe): void {
  if (t.id === tf.id) return
  loadToken++
  tf = t
  renderHeader()
  persist()
  applyTimezone()
  chart.setPeriod(t.period)
}

/**
 * Exchanges start daily, weekly and monthly candles at 00:00 UTC; shown in
 * local time west of UTC they would carry the previous day's date.
 */
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
function applyTimezone(): void {
  const unit = tf.id.slice(-1)
  chart.setTimezone(unit === 'd' || unit === 'w' || unit === 'M' ? 'UTC' : LOCAL_TZ)
}

// -------------------------------------------------------------- watchlist --

const watchlist = new Watchlist(m => void setMarket(m), () => renderHeader())
$('starBtn').onclick = () => watchlist.toggle(market)

const savedUi = readJson<unknown>(UI_KEY, null) as { list?: unknown } | null
const ui = { list: typeof savedUi?.list === 'boolean' ? savedUi.list : window.innerWidth > 900 }
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
  if (fresh) {
    const precisionChanged = fresh.pricePrecision !== market.pricePrecision || fresh.volumePrecision !== market.volumePrecision
    market = { ...fresh }
    // Only once the chart is showing it: setSymbol reloads the candles.
    if (precisionChanged && lastBar && !pendingHashId) {
      chart.setSymbol({ ticker: `${fresh.ticker} · ${adapterOf(fresh.source).label}`, id: fresh.id, pricePrecision: fresh.pricePrecision, volumePrecision: fresh.volumePrecision })
    }
  }
}

applyCatalog(catalog, catalog.length === 0)
void loadAllMarkets().then(({ markets, failed }) => {
  if (markets.length) applyCatalog(markets, false)
  if (pendingHashId) {
    const m = markets.find(x => x.id === pendingHashId)
    pendingHashId = null
    if (!m) toast('No encontramos el mercado del enlace; te mostramos el último que abriste.', 'info', 6000)
    void setMarket(m ?? market)
  }
  // A blocked or down source is simply left out; the search footer says so.
  if (failed.length) search.setUnavailable(failed)
  void refreshTickers()
})

// ------------------------------------------------------------- indicators --

new IndicatorsPanel(chart)
applyPrefs(chart, readPrefs())

const shortcuts = new ShortcutsSheet()
new SettingsMenu(chart, {
  onShortcuts: () => shortcuts.open(),
  beforeImport: () => drawings.flushSave(),
  onShareDrawings: () => void setMarket(market)
})

// ------------------------------------------------------------- screenshot --

/** Chart picture with a slim branded footer: market, timeframe, source and date. */
async function snapshot(): Promise<void> {
  const img = new Image()
  img.src = chart.getConvertPictureUrl(true, 'png', COLORS.bg)
  await img.decode()
  const foot = 40
  const ratio = img.width / Math.max(1, $('chart').clientWidth)
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height + Math.round(foot * ratio)
  const g = c.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = COLORS.bg
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(img, 0, 0)
  g.scale(ratio, ratio)
  const y = img.height / ratio
  const w = c.width / ratio
  g.fillStyle = 'rgba(255,255,255,0.06)'
  g.fillRect(0, y, w, 1)
  const mid = y + foot / 2
  // The app's own logo (same-origin SVG, so the canvas stays exportable).
  try {
    const logo = new Image()
    logo.src = `${import.meta.env.BASE_URL}favicon.svg`
    await logo.decode()
    g.drawImage(logo, 13, mid - 10, 20, 20)
  } catch {
    g.fillStyle = COLORS.accent
    g.beginPath()
    g.roundRect(14, mid - 9, 18, 18, 5)
    g.fill()
  }
  g.textBaseline = 'middle'
  g.font = `600 13px ${FONT}`
  g.fillStyle = COLORS.textStrong
  g.fillText('Grafito', 40, mid)
  g.font = `500 12px ${FONT}`
  g.fillStyle = COLORS.text2
  const label = `${market.ticker} · ${tf.label} · ${adapterOf(market.source).label}`
  g.fillText(label, 40 + g.measureText('Grafito').width + 14, mid)
  g.textAlign = 'right'
  g.fillStyle = COLORS.text
  g.fillText(new Date().toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }), w - 14, mid)
  // A blob URL (not a data: URL) so large high-DPI images still download.
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'))
  if (!blob) throw new Error('canvas')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Grafito_${market.ticker}_${tf.id}_${new Date().toISOString().slice(0, 10)}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
$('shotBtn').onclick = () => void snapshot().catch(() => toast('No se pudo crear la imagen.', 'error'))

// --------------------------------------------------------------- keyboard --

const TOOL_KEYS = new Map(TOOLS.filter(t => t.key).map(t => [t.key as string, t.name]))

// Held keys while drawing: Ctrl = magnet, Shift = line up. Read from every key and
// mouse event so a key released outside the window cannot get stuck.
function trackHeld(e: KeyboardEvent | MouseEvent): void {
  const before = drawings.magnetActive
  drawings.setHeldKeys({ ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })
  if (before !== drawings.magnetActive) dock.syncMagnet()
}
for (const type of ['keydown', 'keyup'] as const) document.addEventListener(type, trackHeld, true)
for (const type of ['mousedown', 'mousemove'] as const) document.addEventListener(type, trackHeld, { capture: true, passive: true })
window.addEventListener('blur', () => {
  drawings.setHeldKeys({ ctrl: false, shift: false })
  dock.syncMagnet()
})

document.addEventListener('keydown', e => {
  const target = e.target as HTMLElement
  const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
  if (!$('dialog').hidden || search.isOpen) {
    // Open modals handle their own keys (Esc closes only them).
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') e.preventDefault()
    return
  }
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
    } else if (k === 'd' && drawings.selected) {
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

// ------------------------------------------------------- backup reminder --

const REMIND_KEY = 'chartit:backup-reminded'
const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent)
/** Drawings live only in this browser: nudge, at most once a week, to keep a backup. */
function maybeRemindBackup(count: number): void {
  if (count < 15) return
  const now = Date.now()
  const lastBackup = Number(localStorage.getItem('chartit:last-backup') ?? 0)
  const lastRemind = Number(localStorage.getItem(REMIND_KEY) ?? 0)
  if (now - lastBackup < 14 * 86_400_000 || now - lastRemind < 7 * 86_400_000) return
  localStorage.setItem(REMIND_KEY, String(now))
  toast(
    `Ya tienes ${count} dibujos aquí. Tus dibujos viven solo en este navegador: descarga un respaldo de vez en cuando desde Ajustes.` +
      (isSafari ? ' En Safari, instala Grafito en tu inicio para que no se borren tras 7 días sin visitarlo.' : ''),
    'info',
    12000
  )
}

// ---------------------------------------------------------- live status --

const liveDot = $('liveDot')
function setLive(state: 'live' | 'reconnecting' | 'offline'): void {
  liveDot.className = `live-dot ${state}`
  liveDot.dataset.tip =
    state === 'live' ? 'En vivo: precios en tiempo real' : state === 'offline' ? 'Sin conexión a internet' : 'Reconectando con el exchange…'
}
let resyncTimer: ReturnType<typeof setTimeout> | null = null
liveEvents.addEventListener('open', e => {
  setLive(navigator.onLine ? 'live' : 'offline')
  // After a cut, candles from the gap are missing: reload them once.
  const { reconnect, downMs } = (e as CustomEvent<{ reconnect: boolean; downMs: number }>).detail
  // Only after a real cut (a blip loses no candles), and not while a market switch reloads anyway.
  if (reconnect && downMs > 5000 && !switchingMarket) {
    if (resyncTimer) clearTimeout(resyncTimer)
    resyncTimer = setTimeout(() => {
      loadToken++
      chart.resetData()
    }, 600)
  }
})
liveEvents.addEventListener('drop', () => setLive(navigator.onLine ? 'reconnecting' : 'offline'))
window.addEventListener('offline', () => setLive('offline'))
window.addEventListener('online', () => setLive('reconnecting'))

// ---------------------------------------------------------------- welcome --

const WELCOME_KEY = 'chartit:welcome-seen'
if (!localStorage.getItem(WELCOME_KEY)) {
  const w = $('welcome')
  w.innerHTML = `
    <div class="welcome-head">${LOGO}<b>Bienvenido a Grafito</b></div>
    <p>Dibuja todo lo que quieras, sin límites. Gratis y sin cuenta.</p>
    <ul>
      <li><b>Dibujos</b> abre todas las herramientas. Marca ${icon('star', 13)} las que más uses y quedan abajo.</li>
      <li><kbd>Ctrl</kbd> <kbd>K</kbd> busca cualquier mercado: <i>oro</i>, <i>nasdaq</i>, <i>EURUSD</i>, <i>BTC</i>.</li>
      <li>Tus dibujos se guardan en este navegador. Haz respaldos desde ${icon('gear', 13)} Ajustes.</li>
    </ul>
    <div class="welcome-actions"><button class="btn primary" id="welcomeOk">Empezar a dibujar</button></div>`
  w.hidden = false
  const close = () => {
    localStorage.setItem(WELCOME_KEY, '1')
    w.hidden = true
  }
  $('welcomeOk').onclick = close
  const x = closeButton(close)
  x.classList.add('welcome-x')
  w.prepend(x)
}

// ------------------------------------------------------------------- boot --

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}))
}


installTooltips()
requestPersistentStorage()

// Deep link: #<marketId>/<tf>
function readHash(): string {
  try {
    return decodeURIComponent(location.hash.slice(1))
  } catch {
    return '' // malformed link: ignore it
  }
}
const hash = readHash()
if (hash) {
  const [id, tfId] = hash.split('/')
  const fromHash = catalog.find(m => m.id === id)
  if (fromHash) market = fromHash
  else if (id) pendingHashId = id
  if (tfId) tf = timeframeById(tfId)
}

applyTimezone()
chart.setPeriod(tf.period)
// A shared link to a market we do not know yet waits for the catalog (about a second).
if (pendingHashId) setStatus('Buscando el mercado…')
else void setMarket(market)

window.addEventListener('hashchange', () => {
  const [id, tfId] = readHash().split('/')
  const m = catalog.find(x => x.id === id)
  if (tfId && tfId !== tf.id) setTimeframe(timeframeById(tfId))
  if (m && m.id !== market.id) void setMarket(m)
})
