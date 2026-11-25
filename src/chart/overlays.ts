import { registerOverlay, type Coordinate, type OverlayFigure } from 'klinecharts'
import { alpha, COLORS } from './theme'

/**
 * Chart-It's own drawing tools, on top of the library's built-in ones
 * (segment, rays, horizontal/vertical lines, channel, fibonacci, brush...).
 */

function rectCorners(a: Coordinate, b: Coordinate): Coordinate[] {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]
}

registerOverlay({
  name: 'ciRect',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return []
    return [{ type: 'polygon', attrs: { coordinates: rectCorners(coordinates[0], coordinates[1]) }, styles: { style: 'stroke_fill' } }]
  }
})

registerOverlay({
  name: 'ciArrow',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return []
    const [a, b] = coordinates
    const ang = Math.atan2(b.y - a.y, b.x - a.x)
    const len = 14
    const spread = Math.PI / 7
    const left = { x: b.x - len * Math.cos(ang - spread), y: b.y - len * Math.sin(ang - spread) }
    const right = { x: b.x - len * Math.cos(ang + spread), y: b.y - len * Math.sin(ang + spread) }
    return [
      { type: 'line', attrs: { coordinates: [a, b] } },
      { type: 'line', attrs: { coordinates: [left, b, right] } }
    ]
  }
})

registerOverlay<string>({
  name: 'ciText',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    const text = overlay.extendData || 'Texto'
    return text.split('\n').map((line, i) => ({
      type: 'text',
      attrs: { x: coordinates[0].x, y: coordinates[0].y + i * 18, text: line, align: 'left', baseline: 'middle' },
      styles: { paddingLeft: 2, paddingRight: 2, paddingTop: 2, paddingBottom: 2 }
    }))
  }
})

registerOverlay({
  name: 'ciMeasure',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, chart }) => {
    if (coordinates.length < 2) return []
    const [p0, p1] = overlay.points
    const [a, b] = coordinates
    const v0 = p0?.value ?? 0
    const v1 = p1?.value ?? v0
    const diff = v1 - v0
    const pct = v0 !== 0 ? (diff / v0) * 100 : 0
    // From pixels, so it is right on any timeframe and after reloading saved drawings.
    const bars = Math.round((b.x - a.x) / chart.getBarSpace().bar)
    const precision = chart.getSymbol()?.pricePrecision ?? 2
    const color = diff >= 0 ? COLORS.up : COLORS.down
    const sign = diff >= 0 ? '+' : ''
    const label = `${sign}${diff.toFixed(precision)}  (${sign}${pct.toFixed(2)}%)  ·  ${Math.abs(bars)} velas`
    const midX = (a.x + b.x) / 2
    const figures: OverlayFigure[] = [
      {
        type: 'polygon',
        attrs: { coordinates: rectCorners(a, b) },
        styles: { style: 'stroke_fill', color: alpha(color, 0.14), borderColor: alpha(color, 0.6), borderSize: 1 }
      },
      { type: 'line', attrs: { coordinates: [{ x: midX, y: a.y }, { x: midX, y: b.y }] }, styles: { color, size: 1 } },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: { x: midX, y: diff >= 0 ? Math.min(a.y, b.y) - 8 : Math.max(a.y, b.y) + 8, text: label, align: 'center', baseline: diff >= 0 ? 'bottom' : 'top' },
        styles: {
          style: 'fill',
          color: '#0A0D13',
          backgroundColor: color,
          size: 12,
          weight: 600,
          borderRadius: 4,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 4,
          paddingBottom: 4
        }
      }
    ]
    return figures
  }
})

// ------------------------------------------------------------------ helpers --

/** Colour and width the person picked for this drawing. */
function lineLook(styles: unknown): { color: string; size: number } {
  const line = (styles as { line?: { color?: string; size?: number } } | null)?.line
  return { color: line?.color ?? COLORS.accent, size: line?.size ?? 2 }
}

function tint(color: string, a: number): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? alpha(color, a) : color
}

/** Point where the line from `p` in direction `d` leaves the chart on the right. */
function extendRight(p: Coordinate, d: Coordinate, width: number): Coordinate {
  if (d.x > 0.0001) {
    const t = (width - p.x) / d.x
    return { x: p.x + d.x * t, y: p.y + d.y * t }
  }
  const len = Math.hypot(d.x, d.y) || 1
  return { x: p.x + (d.x / len) * 4000, y: p.y + (d.y / len) * 4000 }
}

function label(x: number, y: number, text: string, color: string, below: boolean): OverlayFigure {
  return {
    type: 'text',
    ignoreEvent: true,
    attrs: { x, y: below ? y + 8 : y - 8, text, align: 'center', baseline: below ? 'top' : 'bottom' },
    styles: {
      style: 'fill', color: '#0A0D13', backgroundColor: color, size: 12, weight: 600,
      borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4
    }
  }
}

const PERIOD_MS: Record<string, number> = {
  second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000
}

function duration(ms: number): string {
  const min = Math.round(ms / 60_000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  const parts = d ? [`${d}d`, h ? `${h}h` : ''] : h ? [`${h}h`, m ? `${m}m` : ''] : [`${m}m`]
  return parts.filter(Boolean).join(' ')
}

// ------------------------------------------------------------------ shapes --

registerOverlay({
  name: 'ciCircle',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return []
    const [c, e] = coordinates
    return [{ type: 'circle', attrs: { x: c.x, y: c.y, r: Math.hypot(e.x - c.x, e.y - c.y) }, styles: { style: 'stroke_fill' } }]
  }
})

registerOverlay({
  name: 'ciTriangle',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return []
    if (coordinates.length === 2) return [{ type: 'line', attrs: { coordinates } }]
    return [{ type: 'polygon', attrs: { coordinates }, styles: { style: 'stroke_fill' } }]
  }
})

// --------------------------------------------------------------- freehand --

registerOverlay({
  name: 'ciMarker',
  totalStep: 2,
  drawingMode: 'continuous',
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return []
    const { color, size } = lineLook(overlay.styles)
    return [{
      type: 'line',
      attrs: { coordinates },
      styles: { color: tint(color, 0.35), size: Math.max(10, size * 6), style: 'solid', smooth: false, lineCap: 'round', lineJoin: 'round' }
    }]
  }
})

// ------------------------------------------------------------------- lines --

registerOverlay({
  name: 'ciCrossLine',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => {
    const [p] = coordinates
    return [
      { type: 'line', attrs: { coordinates: [{ x: 0, y: p.y }, { x: bounding.width, y: p.y }] } },
      { type: 'line', attrs: { coordinates: [{ x: p.x, y: 0 }, { x: p.x, y: bounding.height }] } }
    ]
  }
})

// ------------------------------------------------------------------ marks --

function signal(up: boolean): void {
  registerOverlay({
    name: up ? 'ciSignalUp' : 'ciSignalDown',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      const [p] = coordinates
      const { color } = lineLook(overlay.styles)
      const s = up ? 1 : -1
      // Arrow whose tip touches the clicked point.
      const pts = [
        { x: p.x, y: p.y }, { x: p.x + 9, y: p.y + 10 * s }, { x: p.x + 4, y: p.y + 10 * s },
        { x: p.x + 4, y: p.y + 22 * s }, { x: p.x - 4, y: p.y + 22 * s }, { x: p.x - 4, y: p.y + 10 * s },
        { x: p.x - 9, y: p.y + 10 * s }
      ]
      return [{ type: 'polygon', attrs: { coordinates: pts }, styles: { style: 'fill', color } }]
    }
  })
}
signal(true)
signal(false)

// -------------------------------------------------------------- fibonacci --

const FIB_KEY = 'chartit:fib-levels'
export const DEFAULT_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

function readFibLevels(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(FIB_KEY) ?? 'null') as unknown
    if (Array.isArray(v) && v.length && v.every(n => typeof n === 'number' && Number.isFinite(n))) return v as number[]
  } catch {
    /* defaults */
  }
  return [...DEFAULT_FIB_LEVELS]
}

let fibLevels = readFibLevels()

export function getFibLevels(): number[] {
  return [...fibLevels]
}

/** Levels for every retracement drawing (each trader uses their own: 0.705, 0.886…). */
export function setFibLevels(levels: number[]): void {
  fibLevels = levels.length ? [...levels].sort((a, b) => a - b) : [...DEFAULT_FIB_LEVELS]
  localStorage.setItem(FIB_KEY, JSON.stringify(fibLevels))
}

/**
 * Retracement with the person's own levels. Same name and geometry as the
 * library's version (level 0 at the second point, 1 at the first), so drawings
 * made before keep their place.
 */
registerOverlay({
  name: 'fibonacciLine',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, bounding, chart }) => {
    if (coordinates.length < 2) return []
    const [p0, p1] = overlay.points
    if (typeof p0?.value !== 'number' || typeof p1?.value !== 'number') return []
    const precision = chart.getSymbol()?.pricePrecision ?? 2
    const [c0, c1] = coordinates
    const left = Math.min(c0.x, c1.x)
    const figures: OverlayFigure[] = [
      { type: 'line', attrs: { coordinates: [c0, c1] }, styles: { style: 'dashed', dashedValue: [3, 4], size: 1 } }
    ]
    for (const lv of fibLevels) {
      const y = c1.y + (c0.y - c1.y) * lv
      const price = p1.value + (p0.value - p1.value) * lv
      figures.push({ type: 'line', attrs: { coordinates: [{ x: left, y }, { x: bounding.width, y }] } })
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: left, y, text: `${lv}  ${price.toFixed(precision)}`, align: 'left', baseline: 'bottom' },
        styles: { style: 'fill', backgroundColor: 'transparent', size: 11, paddingLeft: 2, paddingBottom: 2 }
      })
    }
    return figures
  }
})

const FIB_EXT = [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618]

registerOverlay({
  name: 'ciFibExtension',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, yAxis, bounding, chart }) => {
    const figures: OverlayFigure[] = [{ type: 'line', attrs: { coordinates }, styles: { style: 'dashed', dashedValue: [4, 4] } }]
    if (coordinates.length < 3 || !yAxis) return figures
    const [a, b, c] = overlay.points.map(p => p.value ?? 0)
    const left = Math.min(...coordinates.map(p => p.x))
    const right = Math.max(bounding.width, left)
    const precision = chart.getSymbol()?.pricePrecision ?? 2
    for (const lv of FIB_EXT) {
      const price = c + (b - a) * lv
      const y = yAxis.convertToPixel(price)
      figures.push({ type: 'line', attrs: { coordinates: [{ x: coordinates[2].x, y }, { x: right, y }] } })
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: left, y, text: `${lv} (${price.toFixed(precision)})`, align: 'right', baseline: 'middle' },
        styles: { style: 'fill', backgroundColor: 'transparent', size: 11, paddingRight: 6 }
      })
    }
    return figures
  }
})

// ---------------------------------------------------------------- channels --

registerOverlay({
  name: 'ciPitchfork',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => {
    if (coordinates.length < 2) return []
    if (coordinates.length === 2) return [{ type: 'line', attrs: { coordinates } }]
    const [a, b, c] = coordinates
    const mid = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }
    const d = { x: mid.x - a.x, y: mid.y - a.y }
    return [
      { type: 'line', attrs: { coordinates: [a, extendRight(a, d, bounding.width)] } },
      { type: 'line', attrs: { coordinates: [b, extendRight(b, d, bounding.width)] } },
      { type: 'line', attrs: { coordinates: [c, extendRight(c, d, bounding.width)] } },
      { type: 'line', attrs: { coordinates: [b, c] }, styles: { style: 'dashed', dashedValue: [4, 4] } }
    ]
  }
})

// ---------------------------------------------------------------- measures --

registerOverlay({
  name: 'ciPriceRange',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, chart }) => {
    if (coordinates.length < 2) return []
    const [a, b] = coordinates
    const v0 = overlay.points[0]?.value ?? 0
    const v1 = overlay.points[1]?.value ?? v0
    const diff = v1 - v0
    const pct = v0 !== 0 ? (diff / v0) * 100 : 0
    const precision = chart.getSymbol()?.pricePrecision ?? 2
    const color = diff >= 0 ? COLORS.up : COLORS.down
    const sign = diff >= 0 ? '+' : ''
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x, x0 + 40)
    const midX = (x0 + x1) / 2
    return [
      { type: 'polygon', attrs: { coordinates: [{ x: x0, y: a.y }, { x: x1, y: a.y }, { x: x1, y: b.y }, { x: x0, y: b.y }] }, styles: { style: 'fill', color: alpha(color, 0.1) } },
      { type: 'line', attrs: { coordinates: [{ x: x0, y: a.y }, { x: x1, y: a.y }] }, styles: { color, size: 1 } },
      { type: 'line', attrs: { coordinates: [{ x: x0, y: b.y }, { x: x1, y: b.y }] }, styles: { color, size: 1 } },
      { type: 'line', attrs: { coordinates: [{ x: midX, y: a.y }, { x: midX, y: b.y }] }, styles: { color, size: 1 } },
      label(midX, diff >= 0 ? Math.min(a.y, b.y) : Math.max(a.y, b.y), `${sign}${diff.toFixed(precision)}  (${sign}${pct.toFixed(2)}%)`, color, diff < 0)
    ]
  }
})

registerOverlay({
  name: 'ciDateRange',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, chart }) => {
    if (coordinates.length < 2) return []
    const [a, b] = coordinates
    const bars = Math.round((b.x - a.x) / chart.getBarSpace().bar)
    const period = chart.getPeriod()
    const ms = period ? Math.abs(bars) * period.span * (PERIOD_MS[period.type] ?? 0) : 0
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y, y0 + 30)
    const midY = (y0 + y1) / 2
    const color = COLORS.accent
    return [
      { type: 'polygon', attrs: { coordinates: [{ x: a.x, y: y0 }, { x: b.x, y: y0 }, { x: b.x, y: y1 }, { x: a.x, y: y1 }] }, styles: { style: 'fill', color: alpha(color, 0.12) } },
      { type: 'line', attrs: { coordinates: [{ x: a.x, y: y0 }, { x: a.x, y: y1 }] }, styles: { color, size: 1 } },
      { type: 'line', attrs: { coordinates: [{ x: b.x, y: y0 }, { x: b.x, y: y1 }] }, styles: { color, size: 1 } },
      { type: 'line', attrs: { coordinates: [{ x: a.x, y: midY }, { x: b.x, y: midY }] }, styles: { color, size: 1 } },
      label((a.x + b.x) / 2, y1, `${Math.abs(bars)} velas${ms ? ` · ${duration(ms)}` : ''}`, color, true)
    ]
  }
})

// ---------------------------------------------------------------- position --

/**
 * Risk / reward planner: click the entry, then the target, then the stop.
 * Long or short is read from where the target is. It is a drawing, not an order.
 */
registerOverlay({
  name: 'ciPosition',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, chart }) => {
    if (coordinates.length < 2) return []
    const [e, t] = coordinates
    const entry = overlay.points[0]?.value ?? 0
    const target = overlay.points[1]?.value ?? entry
    const long = target >= entry
    // Until the stop is placed, mirror the target at half the distance.
    const stop = overlay.points[2]?.value ?? entry - (target - entry) / 2
    const sY = coordinates[2]?.y ?? e.y + (e.y - t.y) / 2
    const x0 = Math.min(e.x, t.x)
    const x1 = Math.max(e.x, t.x, x0 + 60)
    const precision = chart.getSymbol()?.pricePrecision ?? 2
    const pct = (v: number) => (entry ? ((v - entry) / entry) * 100 : 0)
    const reward = Math.abs(target - entry)
    const risk = Math.abs(entry - stop)
    const rr = risk > 0 ? reward / risk : 0
    const zone = (y: number, color: string): OverlayFigure => ({
      type: 'polygon',
      attrs: { coordinates: [{ x: x0, y: e.y }, { x: x1, y: e.y }, { x: x1, y }, { x: x0, y }] },
      styles: { style: 'stroke_fill', color: alpha(color, 0.13), borderColor: alpha(color, 0.55), borderSize: 1 }
    })
    const tag = (y: number, above: boolean, text: string, color: string): OverlayFigure => ({
      type: 'text',
      ignoreEvent: true,
      attrs: { x: (x0 + x1) / 2, y: above ? y - 6 : y + 6, text, align: 'center', baseline: above ? 'bottom' : 'top' },
      styles: {
        style: 'fill', color: '#0A0D13', backgroundColor: color, size: 11, weight: 600,
        borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3
      }
    })
    const sign = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
    const tUp = t.y < e.y
    return [
      zone(t.y, COLORS.up),
      zone(sY, COLORS.down),
      { type: 'line', attrs: { coordinates: [{ x: x0, y: e.y }, { x: x1, y: e.y }] }, styles: { color: COLORS.textStrong, size: 1 } },
      tag(t.y, tUp, `${long ? 'Largo' : 'Corto'} · Objetivo ${target.toFixed(precision)} (${sign(pct(target))})`, COLORS.up),
      tag(sY, !tUp, `Stop ${stop.toFixed(precision)} (${sign(pct(stop))})`, COLORS.down),
      {
        type: 'text',
        ignoreEvent: true,
        attrs: { x: x1 + 6, y: e.y, text: `R:R ${rr.toFixed(2)}`, align: 'left', baseline: 'middle' },
        styles: {
          style: 'fill', color: COLORS.textStrong, backgroundColor: '#232833', size: 11, weight: 600,
          borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3
        }
      }
    ]
  }
})

// ------------------------------------------------------------------ catalog --

export interface ToolGroup {
  id: string
  label: string
}

export const TOOL_GROUPS: ToolGroup[] = [
  { id: 'lines', label: 'Líneas' },
  { id: 'hv', label: 'Horizontales y verticales' },
  { id: 'channels', label: 'Canales y tridente' },
  { id: 'fib', label: 'Fibonacci' },
  { id: 'shapes', label: 'Formas' },
  { id: 'free', label: 'Mano alzada' },
  { id: 'text', label: 'Texto y notas' },
  { id: 'marks', label: 'Señales' },
  { id: 'measure', label: 'Medición' }
]

export interface ToolDef {
  name: string
  label: string
  /** Group in the drawing palette; the cursor has none */
  group?: string
  key?: string
}

/** Every tool, in palette order. `cursor` is not an overlay. */
export const TOOLS: ToolDef[] = [
  { name: 'cursor', label: 'Cursor', key: 'v' },
  { name: 'segment', label: 'Línea', group: 'lines', key: 't' },
  { name: 'rayLine', label: 'Rayo', group: 'lines', key: 'r' },
  { name: 'straightLine', label: 'Línea extendida', group: 'lines', key: 'e' },
  { name: 'ciArrow', label: 'Flecha', group: 'lines', key: 'a' },
  { name: 'ciCrossLine', label: 'Cruz', group: 'lines' },
  { name: 'horizontalStraightLine', label: 'Línea horizontal', group: 'hv', key: 'h' },
  { name: 'horizontalRayLine', label: 'Rayo horizontal', group: 'hv', key: 'j' },
  { name: 'horizontalSegment', label: 'Segmento horizontal', group: 'hv' },
  { name: 'verticalStraightLine', label: 'Línea vertical', group: 'hv', key: 'l' },
  { name: 'verticalRayLine', label: 'Rayo vertical', group: 'hv' },
  { name: 'verticalSegment', label: 'Segmento vertical', group: 'hv' },
  { name: 'priceLine', label: 'Marca de precio', group: 'hv', key: 'p' },
  { name: 'parallelStraightLine', label: 'Canal paralelo', group: 'channels', key: 'c' },
  { name: 'priceChannelLine', label: 'Canal de precio', group: 'channels' },
  { name: 'ciPitchfork', label: 'Tridente (Andrews)', group: 'channels' },
  { name: 'fibonacciLine', label: 'Retroceso de Fibonacci', group: 'fib', key: 'f' },
  { name: 'ciFibExtension', label: 'Extensión de Fibonacci', group: 'fib' },
  { name: 'ciRect', label: 'Rectángulo', group: 'shapes', key: 'g' },
  { name: 'ciCircle', label: 'Círculo', group: 'shapes', key: 'o' },
  { name: 'ciTriangle', label: 'Triángulo', group: 'shapes' },
  { name: 'brush', label: 'Lápiz libre', group: 'free', key: 'b' },
  { name: 'ciMarker', label: 'Rotulador', group: 'free', key: 'k' },
  { name: 'ciText', label: 'Texto', group: 'text', key: 'x' },
  { name: 'simpleAnnotation', label: 'Nota con flecha', group: 'text' },
  { name: 'ciSignalUp', label: 'Señal arriba', group: 'marks' },
  { name: 'ciSignalDown', label: 'Señal abajo', group: 'marks' },
  { name: 'ciMeasure', label: 'Medir', group: 'measure', key: 'm' },
  { name: 'ciPriceRange', label: 'Rango de precio', group: 'measure' },
  { name: 'ciDateRange', label: 'Rango de fechas', group: 'measure' },
  { name: 'ciPosition', label: 'Posición (riesgo / beneficio)', group: 'measure', key: 'q' }
]

/** Tools whose drawing asks for a text. */
export const TEXT_TOOLS = new Set(['ciText', 'simpleAnnotation'])

/** Tools that keep drawing until another tool is picked. */
export const FREEHAND_TOOLS = new Set(['brush', 'ciMarker'])

export const DEFAULT_TOOL_FAVORITES = [
  'brush', 'segment', 'rayLine', 'horizontalStraightLine', 'parallelStraightLine', 'fibonacciLine', 'ciRect', 'ciText', 'ciMeasure'
]

export function toolByName(name: string): ToolDef | undefined {
  return TOOLS.find(t => t.name === name)
}
