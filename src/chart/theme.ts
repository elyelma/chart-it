import { registerLocale, type DeepPartial, type Styles } from 'klinecharts'

/** Same typeface as the interface, so the chart and the menus read as one product. */
export const FONT = "'Inter Variable', 'Inter', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"

export const COLORS = {
  bg: '#0B0D12',
  text: '#6E7584',
  text2: '#A3A9B6',
  textStrong: '#E8EAEF',
  line: 'rgba(255,255,255,0.06)',
  up: '#33D6A6',
  down: '#F2566C',
  accent: '#8B7BFF',
  label: '#232833'
}

/** Swatches offered for drawings. First one is the default. */
export const DRAW_COLORS = ['#FFB547', '#8B7BFF', '#4FC3FF', '#33D6A6', '#F2566C', '#FF7AE0', '#F2F4F8']

export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** Overlay styles for a given colour / width / dash, applied to every figure type. */
export function drawingStyles(color: string, size = 2, dashed = false, textSize = 14): DeepPartial<Styles['overlay']> {
  return {
    line: { color, size, style: dashed ? 'dashed' : 'solid', dashedValue: [6, 4] },
    polygon: { color: alpha(color, 0.1), borderColor: color, borderSize: size, borderStyle: dashed ? 'dashed' : 'solid' },
    rect: { color: alpha(color, 0.1), borderColor: color, borderSize: size },
    circle: { color: alpha(color, 0.1), borderColor: color, borderSize: size },
    arc: { color, size },
    text: { color, backgroundColor: 'transparent', borderColor: 'transparent', size: textSize, weight: 600, family: FONT },
    // Edit handles: hollow rings that fill in under the pointer.
    point: {
      color: COLORS.bg,
      borderColor: color,
      borderSize: 2,
      radius: 4.5,
      activeColor: color,
      activeBorderColor: alpha(color, 0.35),
      activeBorderSize: 4,
      activeRadius: 5.5
    }
  }
}

const tickText = { color: COLORS.text, size: 11, family: FONT, weight: 'normal' }
const axisLabel = {
  backgroundColor: COLORS.label,
  borderColor: COLORS.label,
  color: COLORS.textStrong,
  borderRadius: 4,
  family: FONT,
  size: 11,
  paddingLeft: 6,
  paddingRight: 6,
  paddingTop: 4,
  paddingBottom: 4
}

export const CHART_STYLES: DeepPartial<Styles> = {
  grid: {
    horizontal: { color: 'rgba(255,255,255,0.028)', style: 'solid' },
    vertical: { color: 'rgba(255,255,255,0.028)', style: 'solid' }
  },
  candle: {
    area: {
      lineSize: 1.5,
      lineColor: COLORS.accent,
      backgroundColor: [
        { offset: 0, color: alpha(COLORS.accent, 0.01) },
        { offset: 1, color: alpha(COLORS.accent, 0.2) }
      ]
    },
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
      high: { color: COLORS.text, textFamily: FONT, textSize: 10 },
      low: { color: COLORS.text, textFamily: FONT, textSize: 10 },
      last: {
        upColor: COLORS.up,
        downColor: COLORS.down,
        noChangeColor: COLORS.text,
        line: { style: 'dashed', dashedValue: [2, 3], size: 1 },
        text: { family: FONT, size: 11, weight: 600, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }
      }
    },
    tooltip: {
      showRule: 'always',
      showType: 'standard',
      title: { color: COLORS.textStrong, family: FONT, size: 12, weight: 600, marginLeft: 10, marginTop: 8 },
      legend: { color: COLORS.text2, family: FONT, size: 11, marginLeft: 10, marginTop: 4 }
    }
  },
  indicator: {
    ohlc: { upColor: alpha(COLORS.up, 0.55), downColor: alpha(COLORS.down, 0.55), noChangeColor: COLORS.text },
    bars: [{ upColor: alpha(COLORS.up, 0.4), downColor: alpha(COLORS.down, 0.4), noChangeColor: COLORS.text }],
    lines: [
      { color: '#FFB547', size: 1 },
      { color: '#4FC3FF', size: 1 },
      { color: '#FF7AE0', size: 1 },
      { color: '#33D6A6', size: 1 },
      { color: '#8B7BFF', size: 1 }
    ],
    tooltip: {
      title: { color: COLORS.textStrong, family: FONT, size: 11, weight: 600, marginLeft: 10 },
      legend: { color: COLORS.text2, family: FONT, size: 11, marginLeft: 10 }
    }
  },
  xAxis: {
    axisLine: { color: COLORS.line },
    tickLine: { show: false },
    tickText: tickText
  },
  yAxis: {
    axisLine: { color: COLORS.line },
    tickLine: { show: false },
    tickText: tickText
  },
  separator: { color: COLORS.line, activeBackgroundColor: alpha(COLORS.accent, 0.2) },
  crosshair: {
    horizontal: {
      line: { color: 'rgba(232,234,239,0.28)', style: 'dashed', dashedValue: [3, 4], size: 1 },
      text: axisLabel
    },
    vertical: {
      line: { color: 'rgba(232,234,239,0.28)', style: 'dashed', dashedValue: [3, 4], size: 1 },
      text: axisLabel
    }
  },
  overlay: drawingStyles(DRAW_COLORS[0])
}

registerLocale('es-MX', {
  time: 'Hora ',
  open: 'A ',
  high: 'Máx ',
  low: 'Mín ',
  close: 'C ',
  volume: 'Vol ',
  turnover: 'Monto ',
  change: 'Var ',
  second: 's',
  minute: '',
  hour: 'H',
  day: 'D',
  week: 'S',
  month: 'M',
  year: 'A'
})
