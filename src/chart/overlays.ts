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

export interface ToolDef {
  name: string
  label: string
  key?: string
}

/** Tools shown in the dock, in order. `cursor` is not an overlay. */
export const TOOLS: ToolDef[] = [
  { name: 'cursor', label: 'Cursor', key: 'v' },
  { name: 'brush', label: 'Lápiz libre', key: 'b' },
  { name: 'segment', label: 'Línea', key: 't' },
  { name: 'rayLine', label: 'Rayo', key: 'r' },
  { name: 'straightLine', label: 'Línea extendida', key: 'e' },
  { name: 'horizontalStraightLine', label: 'Línea horizontal', key: 'h' },
  { name: 'horizontalRayLine', label: 'Rayo horizontal', key: 'j' },
  { name: 'verticalStraightLine', label: 'Línea vertical', key: 'l' },
  { name: 'parallelStraightLine', label: 'Canal paralelo', key: 'c' },
  { name: 'fibonacciLine', label: 'Fibonacci', key: 'f' },
  { name: 'ciRect', label: 'Rectángulo', key: 'g' },
  { name: 'ciArrow', label: 'Flecha', key: 'a' },
  { name: 'ciText', label: 'Texto', key: 'x' },
  { name: 'priceLine', label: 'Marca de precio', key: 'p' },
  { name: 'ciMeasure', label: 'Medir', key: 'm' }
]
