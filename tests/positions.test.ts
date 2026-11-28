import { describe, expect, it, vi } from 'vitest'

/** Buy / sell planners, points and pips, and per-drawing Fibonacci levels. */

type P = { timestamp?: number; dataIndex?: number; value?: number }
type Template = {
  totalStep: number
  performEventPressedMove: (p: { points: P[]; performPointIndex: number; performPoint: P }) => void
}

const registered = vi.hoisted(() => new Map<string, unknown>())
vi.mock('klinecharts', () => ({
  registerOverlay: (t: { name: string }) => void registered.set(t.name, t),
  registerLocale: () => {},
  registerIndicator: () => {}
}))
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })

const { priceUnit, formatUnits, setPriceUnitCategory, ownLevels, TOOLS } = await import('../src/chart/overlays')

function position(_tool: string, entry: number, target: number, stop: number): P[] {
  return [
    { timestamp: 100, dataIndex: 10, value: entry },
    { timestamp: 100, dataIndex: 10, value: target },
    { timestamp: 100, dataIndex: 10, value: stop },
    { timestamp: 900, dataIndex: 90, value: entry }
  ]
}

function drag(name: string, pts: P[], i: number, to: P): P[] {
  Object.assign(pts[i], to)
  ;(registered.get(name) as Template).performEventPressedMove({ points: pts, performPointIndex: i, performPoint: pts[i] })
  return pts
}

describe('buy and sell tools', () => {
  it('are placed with one click and offered in the palette', () => {
    expect((registered.get('ciLong') as Template).totalStep).toBe(2)
    expect((registered.get('ciShort') as Template).totalStep).toBe(2)
    expect(TOOLS.find(t => t.name === 'ciLong')?.group).toBe('measure')
    expect(TOOLS.find(t => t.name === 'ciShort')?.group).toBe('measure')
    // the earlier planner still shows saved drawings but is no longer offered
    expect(TOOLS.find(t => t.name === 'ciPosition')?.group).toBeUndefined()
  })

  it('a buy keeps its target above the entry and its stop below', () => {
    const p = drag('ciLong', position('ciLong', 100, 110, 95), 1, { value: 90 })
    expect(p[1].value).toBe(100)
    const q = drag('ciLong', position('ciLong', 100, 110, 95), 2, { value: 120 })
    expect(q[2].value).toBe(100)
  })

  it('a sell keeps its target below the entry and its stop above', () => {
    const p = drag('ciShort', position('ciShort', 100, 90, 105), 1, { value: 130 })
    expect(p[1].value).toBe(100)
    const q = drag('ciShort', position('ciShort', 100, 90, 105), 2, { value: 50 })
    expect(q[2].value).toBe(100)
  })

  it('target and stop handles stay on the left edge; the right edge stays at the entry price', () => {
    const p = drag('ciLong', position('ciLong', 100, 110, 95), 1, { timestamp: 500, dataIndex: 50, value: 115 })
    expect(p[1]).toMatchObject({ timestamp: 100, dataIndex: 10, value: 115 })
    const q = drag('ciLong', position('ciLong', 100, 110, 95), 3, { timestamp: 700, dataIndex: 70, value: 140 })
    expect(q[3]).toMatchObject({ timestamp: 700, value: 100 })
    const r = drag('ciLong', position('ciLong', 100, 110, 95), 0, { timestamp: 200, dataIndex: 20, value: 102 })
    expect(r[1]).toMatchObject({ timestamp: 200, value: 110 })
    expect(r[2]).toMatchObject({ timestamp: 200, value: 95 })
    expect(r[3].value).toBe(102)
  })
})

describe('points and pips', () => {
  it('forex counts pips (0.01 on yen pairs)', () => {
    setPriceUnitCategory('fx')
    expect(priceUnit(1.0845)).toEqual({ name: 'pips', size: 0.0001 })
    expect(priceUnit(151.2)).toEqual({ name: 'pips', size: 0.01 })
  })

  it('everything else counts whole points, or pips when the price is under 10', () => {
    setPriceUnitCategory('crypto')
    expect(priceUnit(60000)).toEqual({ name: 'puntos', size: 1 })
    expect(priceUnit(0.52)).toEqual({ name: 'pips', size: 0.0001 })
    setPriceUnitCategory('index')
    expect(priceUnit(21000)).toEqual({ name: 'puntos', size: 1 })
  })

  it('formats a distance in those units', () => {
    expect(formatUnits(2303.4, { name: 'puntos', size: 1 })).toBe('2,303 puntos')
    expect(formatUnits(-0.0025, { name: 'pips', size: 0.0001 })).toBe('25 pips')
  })
})

describe('Fibonacci levels of one drawing', () => {
  it('reads its own levels and ignores anything else', () => {
    expect(ownLevels({ levels: [0, 0.5, 0.705, 1] })).toEqual([0, 0.5, 0.705, 1])
    expect(ownLevels({ levels: [0, 'x', NaN, 1] })).toEqual([0, 1])
    expect(ownLevels(null)).toBeNull()
    expect(ownLevels('texto')).toBeNull()
    expect(ownLevels({ levels: [] })).toBeNull()
  })
})
