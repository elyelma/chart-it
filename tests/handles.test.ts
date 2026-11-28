import { describe, expect, it, vi } from 'vitest'

/** Rectangles are drawn with two corners and edited with six handles. */

type P = { timestamp?: number; dataIndex?: number; value?: number }
type RectTemplate = {
  performEventPressedMove: (p: { points: P[]; performPointIndex: number; performPoint: P }) => void
}

const registered = vi.hoisted(() => new Map<string, unknown>())
vi.mock('klinecharts', () => ({
  registerOverlay: (t: { name: string }) => void registered.set(t.name, t),
  registerLocale: () => {},
  registerIndicator: () => {}
}))
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })

const { withHandles } = await import('../src/chart/overlays')
const rect = registered.get('ciRect') as RectTemplate

const a = { timestamp: 1000, value: 10 }
const b = { timestamp: 5000, value: 30 }

/** Drags handle `i` to `to`, the way the library does it. */
function drag(i: number, to: P): P[] {
  const points = withHandles('ciRect', [a, b]).map(p => ({ ...p }))
  Object.assign(points[i], to)
  rect.performEventPressedMove({ points, performPointIndex: i, performPoint: points[i] })
  return points
}

describe('rectangle handles', () => {
  it('gives a two-corner rectangle six handles', () => {
    const h = withHandles('ciRect', [a, b])
    expect(h).toHaveLength(6)
    expect(h[0]).toEqual(a)
    expect(h[1]).toEqual(b)
    expect(h[2]).toMatchObject({ timestamp: 1000, value: 30 })
    expect(h[3]).toMatchObject({ timestamp: 5000, value: 10 })
    expect(h[4]).toMatchObject({ timestamp: 1000, value: 20 })
    expect(h[5]).toMatchObject({ timestamp: 5000, value: 20 })
  })

  it('leaves rectangles that already have handles, and other tools, as they are', () => {
    const six = withHandles('ciRect', [a, b])
    expect(withHandles('ciRect', six)).toBe(six)
    const line = [a, b]
    expect(withHandles('segment', line)).toBe(line)
  })

  it('a middle handle moves only its side, and keeps the height', () => {
    const p = drag(5, { timestamp: 9000, value: 99 })
    expect(p[0]).toMatchObject({ timestamp: 1000, value: 10 })
    expect(p[1]).toMatchObject({ timestamp: 9000, value: 30 })
    expect(p[5]).toMatchObject({ timestamp: 9000, value: 20 })
  })

  it('a derived corner moves the two sides it touches', () => {
    // handle 2 = left side, top value of b
    const p = drag(2, { timestamp: 500, value: 40 })
    expect(p[0]).toMatchObject({ timestamp: 500, value: 10 })
    expect(p[1]).toMatchObject({ timestamp: 5000, value: 40 })
    expect(p[4]).toMatchObject({ timestamp: 500, value: 25 })
  })

  it('a main corner keeps every handle in step', () => {
    const p = drag(0, { timestamp: 2000, value: 0 })
    expect(p[2]).toMatchObject({ timestamp: 2000, value: 30 })
    expect(p[3]).toMatchObject({ timestamp: 5000, value: 0 })
    expect(p[4]).toMatchObject({ timestamp: 2000, value: 15 })
  })
})
