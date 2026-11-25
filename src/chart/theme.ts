import { registerLocale, type DeepPartial, type Styles } from 'klinecharts'

export const COLORS = {
  bg: '#0A0D13',
  text: '#8A93A6',
  textStrong: '#E6EAF2',
  line: '#1E2533',
  up: '#36E2B4',
  down: '#FF5D73',
  accent: '#7C6CFF'
}

/** Swatches offered for drawings. First one is the default. */
export const DRAW_COLORS = ['#FFB547', '#7C6CFF', '#4FC3FF', '#36E2B4', '#FF5D73', '#FF7AE0', '#F2F4F8']

export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** Overlay styles for a given colour / width / dash, applied to every figure type. */
export function drawingStyles(color: string, size = 2, dashed = false): DeepPartial<Styles['overlay']> {
  return {
    line: { color, size, style: dashed ? 'dashed' : 'solid', dashedValue: [6, 4] },
    polygon: { color: alpha(color, 0.12), borderColor: color, borderSize: size, borderStyle: dashed ? 'dashed' : 'solid' },
    rect: { color: alpha(color, 0.12), borderColor: color, borderSize: size },
    circle: { color: alpha(color, 0.12), borderColor: color, borderSize: size },
    arc: { color, size },
    text: { color, backgroundColor: 'transparent', borderColor: 'transparent', size: 14, weight: 600 },
    point: { color, borderColor: alpha(color, 0.35), activeColor: color, activeBorderColor: alpha(color, 0.35) }
  }
}

const axisText = { color: COLORS.text, size: 11, family: 'inherit' }

export const CHART_STYLES: DeepPartial<Styles> = {
  grid: {
    horizontal: { color: 'rgba(255,255,255,0.035)', style: 'solid' },
    vertical: { color: 'rgba(255,255,255,0.035)', style: 'solid' }
  },
  candle: {
    bar: {
      upColor: COLORS.up,
      downColor: COLORS.down,
      noChangeColor: COLORS.text,
      upBorderColor: COLORS.up,
      downBorderColor: COLORS.down,
      noChangeBorderColor: COLORS.text,
      upWickColor: COLORS.up,
      downWickColor: COLORS.down,
      noChangeWickColor: COLORS.text
    },
    priceMark: {
      high: { color: COLORS.text },
      low: { color: COLORS.text },
      last: {
        upColor: COLORS.up,
        downColor: COLORS.down,
        noChangeColor: COLORS.text,
        line: { style: 'dashed', dashedValue: [3, 3], size: 1 },
        text: { borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3 }
      }
    },
    tooltip: {
      showRule: 'always',
      showType: 'standard',
      title: { color: COLORS.textStrong },
      legend: { color: COLORS.text, size: 11 }
    }
  },
  indicator: {
    ohlc: { upColor: alpha(COLORS.up, 0.55), downColor: alpha(COLORS.down, 0.55), noChangeColor: COLORS.text },
    bars: [{ upColor: alpha(COLORS.up, 0.45), downColor: alpha(COLORS.down, 0.45), noChangeColor: COLORS.text }],
    lines: [
      { color: '#FFB547', size: 1 },
      { color: '#4FC3FF', size: 1 },
      { color: '#FF7AE0', size: 1 },
      { color: '#36E2B4', size: 1 },
      { color: '#7C6CFF', size: 1 }
    ],
    tooltip: { legend: { color: COLORS.text, size: 11 }, title: { color: COLORS.textStrong, size: 11 } }
  },
  xAxis: {
    axisLine: { color: COLORS.line },
    tickLine: { color: COLORS.line },
    tickText: axisText
  },
  yAxis: {
    axisLine: { color: COLORS.line },
    tickLine: { color: COLORS.line },
    tickText: axisText
  },
  separator: { color: COLORS.line, activeBackgroundColor: alpha(COLORS.accent, 0.25) },
  crosshair: {
    horizontal: {
      line: { color: 'rgba(230,234,242,0.35)', dashedValue: [4, 4] },
      text: { backgroundColor: '#2A3242', borderColor: '#2A3242', color: COLORS.textStrong, borderRadius: 4 }
    },
    vertical: {
      line: { color: 'rgba(230,234,242,0.35)', dashedValue: [4, 4] },
      text: { backgroundColor: '#2A3242', borderColor: '#2A3242', color: COLORS.textStrong, borderRadius: 4 }
    }
  },
  overlay: drawingStyles(DRAW_COLORS[0])
}

registerLocale('es-MX', {
  time: 'Hora: ',
  open: 'A: ',
  high: 'Máx: ',
  low: 'Mín: ',
  close: 'C: ',
  volume: 'Vol: ',
  turnover: 'Monto: ',
  change: 'Var: ',
  second: 's',
  minute: '',
  hour: 'H',
  day: 'D',
  week: 'S',
  month: 'M',
  year: 'A'
})
