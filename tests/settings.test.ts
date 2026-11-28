import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * readPrefs() is the only pure part of the settings menu: it must turn
 * whatever is in localStorage into a valid chart type + price scale.
 * The UI modules it imports touch the DOM at load, so they are stubbed.
 */

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
  clear: () => store.clear()
})

vi.mock('../src/chart/volume', () => ({ setPriceScale: vi.fn() }))
vi.mock('../src/chart/overlays', () => ({ DEFAULT_FIB_LEVELS: [], getFibLevels: () => [], setFibLevels: vi.fn() }))
vi.mock('../src/config', () => ({ FEEDBACK_URL: '', SUPPORT_EVM: '' }))
vi.mock('../src/store/db', () => ({ drawingsDb: {} }))
vi.mock('../src/ui/feedback', () => ({ dialog: vi.fn(), toast: vi.fn() }))
vi.mock('../src/ui/popup', () => ({ panelHeader: vi.fn(), placeBelow: vi.fn(), Popup: class {} }))

const { readPrefs } = await import('../src/ui/settings')
const KEY = 'chartit:prefs'

describe('readPrefs', () => {
  beforeEach(() => store.clear())

  it('defaults when nothing is stored', () => {
    expect(readPrefs()).toEqual({ candle: 'candle_solid', scale: 'normal', shareDrawings: true })
  })

  it('keeps valid saved values', () => {
    store.set(KEY, JSON.stringify({ candle: 'area', scale: 'logarithm' }))
    expect(readPrefs()).toEqual({ candle: 'area', scale: 'logarithm', shareDrawings: true })
    store.set(KEY, JSON.stringify({ candle: 'ohlc', scale: 'percentage', shareDrawings: false }))
    expect(readPrefs()).toEqual({ candle: 'ohlc', scale: 'percentage', shareDrawings: false })
  })

  it('replaces unknown values field by field', () => {
    store.set(KEY, JSON.stringify({ candle: 'renko', scale: 'percentage' }))
    expect(readPrefs()).toEqual({ candle: 'candle_solid', scale: 'percentage', shareDrawings: true })
    store.set(KEY, JSON.stringify({ candle: 'candle_up_stroke', scale: 'LOG', shareDrawings: 'no' }))
    expect(readPrefs()).toEqual({ candle: 'candle_up_stroke', scale: 'normal', shareDrawings: true })
  })

  it('survives corrupted or non-object JSON (e.g. from a hand-edited backup)', () => {
    for (const raw of ['{not json', 'null', '42', '"area"', '[]', 'true']) {
      store.set(KEY, raw)
      expect(readPrefs(), raw).toEqual({ candle: 'candle_solid', scale: 'normal', shareDrawings: true })
    }
  })

  it('ignores the prototype chain', () => {
    store.set(KEY, JSON.stringify({ candle: 'toString', scale: 'constructor' }))
    expect(readPrefs()).toEqual({ candle: 'candle_solid', scale: 'normal', shareDrawings: true })
  })
})
