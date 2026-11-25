import { describe, expect, it, vi } from 'vitest'

vi.mock('klinecharts', () => ({
  registerOverlay: () => {},
  registerLocale: () => {},
  registerIndicator: () => {}
}))

const { parseFibLevels } = await import('../src/chart/overlays')

describe('parseFibLevels', () => {
  it('reads dot decimals separated by commas', () => {
    expect(parseFibLevels('0, 0.382, 0.618, 1')).toEqual([0, 0.382, 0.618, 1])
    expect(parseFibLevels('0.5,0.618')).toEqual([0.5, 0.618])
  })

  it('reads decimal commas (Spanish style)', () => {
    expect(parseFibLevels('0; 0,382; 0,618; 1')).toEqual([0, 0.382, 0.618, 1])
    expect(parseFibLevels('0,705')).toEqual([0.705])
    expect(parseFibLevels('0 0,5 0,886')).toEqual([0, 0.5, 0.886])
  })

  it('reads percentages', () => {
    expect(parseFibLevels('38.2% 61.8%')).toEqual([0.382, 0.618])
  })

  it('ignores a trailing separator instead of adding a 0 level', () => {
    expect(parseFibLevels('0.5, 0.618,')).toEqual([0.5, 0.618])
  })

  it('rejects out-of-range or non-numeric values with a message', () => {
    expect(parseFibLevels('0, 382')).toHaveProperty('error')
    expect(parseFibLevels('abc')).toHaveProperty('error')
    expect(parseFibLevels('   ')).toHaveProperty('error')
  })
})
