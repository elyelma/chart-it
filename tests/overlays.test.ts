import { describe, expect, it, vi } from 'vitest'

/**
 * Grafito's own overlays, driven with edge data the way klinecharts would
 * call createPointFigures. The library needs a browser, so registerOverlay is
 * captured instead of run; the figures are plain objects we can inspect.
 */

type Coord = { x: number; y: number }
type Template = {
  name: string
  totalStep: number
  createPointFigures: (args: Record<string, unknown>) => Array<{ type: string; attrs: Record<string, unknown> | Array<Record<string, unknown>> }>
}

const registered = vi.hoisted(() => new Map<string, unknown>())
vi.mock('klinecharts', () => ({
  registerOverlay: (t: { name: string }) => void registered.set(t.name, t),
  registerLocale: () => {},
  registerIndicator: () => {}
}))

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v))
})

const { getFibLevels, setFibLevels, DEFAULT_FIB_LEVELS } = await import('../src/chart/overlays')

const tpl = (name: string) => {
  const t = registered.get(name) as Template | undefined
  if (!t) throw new Error(`overlay ${name} not registered`)
  return t
}

function chartStub(opts: { precision?: number; bar?: number; period?: { type: string; span: number } | null } = {}) {
  return {
    getSymbol: () => ({ pricePrecision: opts.precision ?? 2 }),
    getBarSpace: () => ({ bar: opts.bar ?? 8 }),
    getPeriod: () => (opts.period === undefined ? { type: 'hour', span: 1 } : opts.period)
  }
}

/** Linear price axis: value 0 at y=500, 1 px per unit. */
const yAxis = { convertToPixel: (v: number) => 500 - v }
const bounding = { width: 800, height: 500 }

function figures(name: string, coordinates: Coord[], values: Array<number | undefined>, chart = chartStub(), styles: unknown = null) {
  const overlay = { name, points: values.map(v => (v === undefined ? {} : { value: v })), styles, extendData: undefined }
  return tpl(name).createPointFigures({ coordinates, overlay, chart, bounding, yAxis, xAxis: {} })
}

/** Every number and every label in the figures must be finite / readable. */
function expectClean(figs: ReturnType<typeof figures>) {
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'number') expect(Number.isFinite(v), `${path} = ${v}`).toBe(true)
    else if (typeof v === 'string') expect(v, path).not.toMatch(/NaN|Infinity|undefined/)
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
  }
  figs.forEach((f, i) => walk(f.attrs, `fig${i}(${f.type})`))
}

const texts = (figs: ReturnType<typeof figures>) =>
  figs.filter(f => f.type === 'text').flatMap(f => [f.attrs].flat().map(a => String((a as { text?: unknown }).text)))

describe('ciPosition (risk / reward)', () => {
  const e = { x: 100, y: 300 }
  const t = { x: 200, y: 200 }

  it('zero risk (stop on the entry) gives a readable R:R, not NaN/Infinity', () => {
    const figs = figures('ciPosition', [e, t, { x: 200, y: 300 }], [200, 300, 200])
    expectClean(figs)
    expect(texts(figs).some(s => s.startsWith('R:R'))).toBe(true)
  })

  it('entry at 0 does not divide by zero in the percentages', () => {
    expectClean(figures('ciPosition', [{ x: 100, y: 500 }, t, { x: 100, y: 550 }], [0, 300, -50]))
  })

  it('target equal to entry, stop not placed yet', () => {
    expectClean(figures('ciPosition', [e, { x: 200, y: 300 }], [200, 200]))
  })

  it('missing values while the second point is moving', () => {
    expectClean(figures('ciPosition', [e, t], [undefined, undefined]))
  })

  it('reads long vs short from the target and mirrors the provisional stop', () => {
    const long = texts(figures('ciPosition', [e, t], [200, 300]))
    expect(long.find(s => s.includes('Objetivo'))).toMatch(/^Largo/)
    // Provisional stop = entry - (target - entry) / 2 = 150, -25%.
    expect(long.find(s => s.startsWith('Stop'))).toBe('Stop 150.00 (-25.00%)')
    const short = texts(figures('ciPosition', [e, { x: 200, y: 400 }], [200, 100]))
    expect(short.find(s => s.includes('Objetivo'))).toMatch(/^Corto/)
  })

  it('R:R uses |target - entry| / |entry - stop|', () => {
    const rr = texts(figures('ciPosition', [e, t, { x: 200, y: 350 }], [200, 300, 150])).find(s => s.startsWith('R:R'))
    expect(rr).toBe('R:R 2.00')
  })
})

describe('measures', () => {
  it('ciPriceRange from 0 has no NaN percentage', () => {
    expectClean(figures('ciPriceRange', [{ x: 10, y: 500 }, { x: 20, y: 400 }], [0, 100]))
  })

  it('ciPriceRange keeps a minimum width when both points share x', () => {
    const figs = figures('ciPriceRange', [{ x: 10, y: 450 }, { x: 10, y: 400 }], [50, 100])
    const poly = figs[0].attrs as { coordinates: Coord[] }
    expect(Math.max(...poly.coordinates.map(c => c.x)) - Math.min(...poly.coordinates.map(c => c.x))).toBeGreaterThanOrEqual(40)
  })

  it('ciDateRange with zero width and no period', () => {
    const figs = figures('ciDateRange', [{ x: 50, y: 100 }, { x: 50, y: 100 }], [1, 1], chartStub({ period: null }))
    expectClean(figs)
    expect(texts(figs)[0]).toBe('0 velas')
  })

  it('ciDateRange shows bars and duration', () => {
    const figs = figures('ciDateRange', [{ x: 0, y: 100 }, { x: 80, y: 120 }], [1, 1], chartStub({ bar: 8, period: { type: 'hour', span: 4 } }))
    expect(texts(figs)[0]).toBe('10 velas · 1d 16h')
  })

  it('ciMeasure from 0 and backwards in time', () => {
    const figs = figures('ciMeasure', [{ x: 300, y: 500 }, { x: 100, y: 400 }], [0, 100])
    expectClean(figs)
    expect(texts(figs)[0]).toContain('25 velas')
  })
})

describe('shapes, lines and marks', () => {
  it('ciCircle with a zero radius', () => {
    expectClean(figures('ciCircle', [{ x: 5, y: 5 }, { x: 5, y: 5 }], [1, 1]))
  })

  it('ciTriangle and ciPitchfork while the second point is placed', () => {
    expect(figures('ciTriangle', [{ x: 1, y: 1 }], [1])).toEqual([])
    expect(figures('ciTriangle', [{ x: 1, y: 1 }, { x: 2, y: 2 }], [1, 2])[0].type).toBe('line')
    expect(figures('ciPitchfork', [{ x: 1, y: 1 }, { x: 2, y: 2 }], [1, 2])[0].type).toBe('line')
  })

  it('ciPitchfork drawn leftwards or straight up stays finite', () => {
    expectClean(figures('ciPitchfork', [{ x: 400, y: 200 }, { x: 300, y: 100 }, { x: 300, y: 300 }], [1, 2, 3]))
    expectClean(figures('ciPitchfork', [{ x: 400, y: 200 }, { x: 400, y: 100 }, { x: 400, y: 300 }], [1, 2, 3]))
    // All three points on one spot: direction (0, 0).
    expectClean(figures('ciPitchfork', [{ x: 400, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 200 }], [1, 1, 1]))
  })

  it('ciCrossLine, signals and marker with a single point / default styles', () => {
    expectClean(figures('ciCrossLine', [{ x: 10, y: 20 }], [1]))
    expectClean(figures('ciSignalUp', [{ x: 10, y: 20 }], [1]))
    expectClean(figures('ciSignalDown', [{ x: 10, y: 20 }], [1]))
    expect(figures('ciMarker', [{ x: 10, y: 20 }], [1])).toEqual([])
    expectClean(figures('ciMarker', [{ x: 10, y: 20 }, { x: 12, y: 22 }], [1, 1], chartStub(), { line: { color: 'rgba(1,2,3,1)', size: 3 } }))
  })

  it('ciFibExtension with 2 points draws only the guide line; with 3 points every level is labelled', () => {
    expect(figures('ciFibExtension', [{ x: 0, y: 0 }, { x: 1, y: 1 }], [1, 2]).length).toBe(1)
    const figs = figures('ciFibExtension', [{ x: 100, y: 400 }, { x: 200, y: 300 }, { x: 300, y: 350 }], [100, 200, 150])
    expectClean(figs)
    expect(texts(figs)).toContain('1.618 (311.80)')
  })
})

describe('fibonacciLine with custom levels', () => {
  it('level 1 sits on the first point and level 0 on the second', () => {
    const figs = figures('fibonacciLine', [{ x: 100, y: 300 }, { x: 200, y: 100 }], [200, 400])
    expectClean(figs)
    const labels = texts(figs)
    expect(labels).toContain('0  400.00')
    expect(labels).toContain('1  200.00')
    expect(labels).toContain('0.5  300.00')
  })

  it('draws nothing while a value is missing', () => {
    expect(figures('fibonacciLine', [{ x: 1, y: 1 }, { x: 2, y: 2 }], [1, undefined])).toEqual([])
  })
})

describe('fib level storage', () => {
  it('starts from the defaults and stores sorted levels', () => {
    expect(getFibLevels()).toEqual(DEFAULT_FIB_LEVELS)
    setFibLevels([1, 0.705, 0])
    expect(getFibLevels()).toEqual([0, 0.705, 1])
    expect(JSON.parse(store.get('chartit:fib-levels') as string)).toEqual([0, 0.705, 1])
    setFibLevels([])
    expect(getFibLevels()).toEqual(DEFAULT_FIB_LEVELS)
    setFibLevels(DEFAULT_FIB_LEVELS)
  })
})
