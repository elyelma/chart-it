import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * DrawingManager against a small fake of the klinecharts 10.1.1 overlay store.
 * The fake copies the library behaviours that matter here:
 *  - getOverlays returns the live overlay instances;
 *  - createOverlay with points is finished at once; default zLevel = overlays in the pane;
 *  - onRemoved fires before the overlay leaves the list;
 *  - hovering an overlay (StoreImp.setHoverOverlayInfo) saves its zLevel in
 *    _prevZLevel and raises it to Number.MAX_SAFE_INTEGER; leaving restores
 *    _prevZLevel. Leaving the canvas for an HTML menu does NOT end the hover.
 */

const db = vi.hoisted(() => new Map<string, unknown>())
vi.mock('../src/store/db', () => ({
  drawingsDb: {
    get: async (k: string) => structuredClone(db.get(k)),
    put: async (k: string, v: unknown) => void db.set(k, structuredClone(v))
  }
}))
vi.mock('klinecharts', () => ({
  registerOverlay: () => {},
  registerLocale: () => {},
  registerIndicator: () => {},
  // Every overlay name used in these tests is known to the library.
  getSupportedOverlays: () => ({ includes: () => true })
}))

const ls = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => void ls.set(k, String(v)),
  removeItem: (k: string) => void ls.delete(k)
})

const { DrawingManager } = await import('../src/chart/drawings')

type Fn = (e: Record<string, unknown>) => void
interface FakeOverlay {
  id: string
  name: string
  groupId: string
  paneId: string
  points: Array<{ timestamp?: number; value?: number }>
  styles: unknown
  extendData: unknown
  lock: boolean
  visible: boolean
  zLevel: number
  _prevZLevel: number
  currentStep: number
  onRemoved?: Fn
  onDrawEnd?: Fn
  [k: string]: unknown
}

class FakeChart {
  overlays: FakeOverlay[] = []
  hovered: FakeOverlay | null = null
  private n = 0

  createOverlay(c: Record<string, unknown>): string {
    const id = `ov_${++this.n}`
    const points = (c.points as FakeOverlay['points'] | undefined) ?? []
    const o: FakeOverlay = {
      lock: false, visible: true, styles: null, extendData: undefined, paneId: 'candle_pane',
      ...structuredClone(Object.fromEntries(Object.entries(c).filter(([, v]) => typeof v !== 'function'))),
      ...Object.fromEntries(Object.entries(c).filter(([, v]) => typeof v === 'function')),
      id,
      name: c.name as string,
      groupId: (c.groupId as string) ?? id,
      points: points.map(p => ({ ...p })),
      zLevel: (c.zLevel as number | undefined) ?? this.overlays.length,
      _prevZLevel: 0,
      // Same method the library's overlay objects have.
      setPrevZLevel(z: number) {
        this._prevZLevel = z
      },
      currentStep: points.length ? -1 : 1
    } as FakeOverlay
    this.overlays.push(o)
    return id
  }
  getOverlays(f: { id?: string; groupId?: string }): FakeOverlay[] {
    return this.overlays.filter(o => (f.id ? o.id === f.id : f.groupId ? o.groupId === f.groupId : true))
  }
  overrideOverlay(o: Record<string, unknown>): void {
    const t = this.overlays.find(x => x.id === o.id)
    if (t) Object.assign(t, Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id')))
  }
  removeOverlay(f: { id?: string; groupId?: string }): void {
    for (const o of this.getOverlays(f)) {
      o.onRemoved?.({ overlay: o })
      if (this.hovered === o) this.hovered = null
      this.overlays = this.overlays.filter(x => x !== o)
    }
  }
  /** Mouse over a drawing, exactly like StoreImp.setHoverOverlayInfo. */
  hover(id: string | null): void {
    const next = id ? this.overlays.find(o => o.id === id) ?? null : null
    if (this.hovered?.id === next?.id) return
    if (this.hovered) this.hovered.zLevel = this.hovered._prevZLevel
    if (next) {
      next._prevZLevel = next.zLevel
      next.zLevel = Number.MAX_SAFE_INTEGER
    }
    this.hovered = next
  }
  convertToPixel(points: Array<{ timestamp: number; value: number }>) {
    return points.map(p => ({ x: p.timestamp / 1000, y: 1000 - p.value }))
  }
  convertFromPixel(cs: Array<{ x: number; y: number }>) {
    return cs.map(c => ({ timestamp: c.x * 1000, value: 1000 - c.y }))
  }
  scrollToTimestamp() {}
}

const flush = () => new Promise(r => setTimeout(r, 0))

async function setup(saved: unknown[] = []) {
  db.clear()
  db.set('market:m1', saved)
  const chart = new FakeChart()
  const selected: Array<string | null> = []
  const dm = new DrawingManager(chart as never, {
    onCountChange: () => {},
    onSelect: o => selected.push(o?.id ?? null),
    onToolDone: () => {},
    onTextRequest: async () => 'x'
  })
  await dm.setMarket('m1')
  dm.dataReady()
  return { chart, dm }
}

const seg = (ts: number, z?: number) => ({
  name: 'segment', points: [{ timestamp: ts, value: 10 }, { timestamp: ts + 1000, value: 20 }],
  styles: null, extendData: null, lock: false, visible: true, ...(z !== undefined ? { zLevel: z } : {})
})

/** Selects a drawing the way a click does (onSelected handler). */
function click(chart: FakeChart, id: string) {
  const o = chart.overlays.find(x => x.id === id) as FakeOverlay
  ;(o.onSelected as Fn)({ overlay: o })
}

async function saved(dm: InstanceType<typeof DrawingManager>) {
  dm.flushSave()
  await flush()
  return db.get('market:m1') as Array<{ zLevel?: number; points: Array<{ timestamp: number; value: number }> }>
}

describe('DrawingManager: persistence basics', () => {
  beforeEach(() => ls.clear())

  it('restores saved drawings and saves edits under the market key', async () => {
    const { chart, dm } = await setup([seg(1000), seg(5000)])
    expect(dm.count()).toBe(2)
    dm.setVisible(chart.overlays[0].id, false)
    const out = await saved(dm)
    expect(out.length).toBe(2)
    expect((out[0] as unknown as { visible: boolean }).visible).toBe(false)
  })

  it('undo / redo walk the history and are cleared on market switch', async () => {
    const { chart, dm } = await setup([seg(1000)])
    dm.setLocked(chart.overlays[0].id, true)
    dm.undo()
    expect(chart.overlays[0].lock).toBe(false)
    dm.redo()
    expect(chart.overlays[0].lock).toBe(true)
    await dm.setMarket('m2')
    dm.undo()
    expect(chart.overlays.length).toBe(0)
  })

  it('removeById records the removal once the library has dropped it', async () => {
    const { chart, dm } = await setup([seg(1000), seg(5000)])
    dm.removeById(chart.overlays[0].id)
    await flush()
    expect((await saved(dm)).length).toBe(1)
    dm.undo()
    expect(dm.count()).toBe(2)
  })

  it('duplicate is offset, keeps the look and is selected', async () => {
    const { chart, dm } = await setup([{ ...seg(10_000), look: { color: '#123456', size: 3, dashed: true } }])
    click(chart, chart.overlays[0].id)
    dm.duplicateSelected()
    expect(dm.count()).toBe(2)
    const [a, b] = chart.overlays
    expect(b.points[0].timestamp).toBe((a.points[0].timestamp as number) + 24_000)
    expect(b.points[0].value).toBe((a.points[0].value as number) + 24)
    expect(dm.lookOf(b.id)).toEqual({ color: '#123456', size: 3, dashed: true })
    expect(dm.selected).toBe(b.id)
  })

  it('per-tool looks are remembered in localStorage and garbage is ignored', async () => {
    ls.set('chartit:tool-looks', JSON.stringify({ segment: { color: '#ff0000', size: 4 }, ciRect: 'bad', rayLine: null }))
    const { dm } = await setup()
    dm.startTool('segment')
    expect(dm.look).toEqual({ color: '#ff0000', size: 4, dashed: false, textSize: undefined })
    dm.restyleSelected({ size: 1 })
    expect(JSON.parse(ls.get('chartit:tool-looks') as string).segment.size).toBe(1)
    dm.startTool('ciRect')
    expect(dm.look.size).toBe(1) // no memo for ciRect: carries the current look
  })
})

describe('DrawingManager: stacking order (zLevel) vs. the library hover', () => {
  beforeEach(() => ls.clear())

  // klinecharts raises a hovered drawing to zLevel MAX_SAFE_INTEGER and only
  // restores it on mouse leave. serialize() reads overlay.zLevel, so a commit
  // while the mouse rests on a drawing (end of a drag, restyle from the props
  // bar, Delete on another drawing...) saves MAX_SAFE_INTEGER for it.
  it('a commit while a drawing is hovered does not save the temporary hover zLevel (fixed)', async () => {
    const { chart, dm } = await setup([seg(1000), seg(5000)])
    const [a, b] = chart.overlays
    chart.hover(a.id)
    dm.setVisible(b.id, false) // any commit
    const out = await saved(dm)
    expect(out[0].zLevel ?? 0).toBeLessThan(1000)
  })

  // Right click → menu → "Traer al frente": the drawing is still hovered (the
  // mouse left the canvas for the HTML menu, which does not end the hover).
  // The new z is overwritten by _prevZLevel as soon as the mouse moves on.
  it('"Traer al frente" from the context menu survives the mouse leaving the drawing (fixed)', async () => {
    const { chart, dm } = await setup([seg(1000, 1), seg(5000, 2), seg(9000, 3)])
    const [a] = chart.overlays
    chart.hover(a.id)
    click(chart, a.id)
    dm.reorderSelected(true)
    chart.hover(null)
    const others = chart.overlays.filter(o => o !== a).map(o => o.zLevel)
    expect(a.zLevel).toBeGreaterThan(Math.max(...others))
  })

  it('"Enviar atrás" from the context menu survives the mouse leaving the drawing (fixed)', async () => {
    const { chart, dm } = await setup([seg(1000, 1), seg(5000, 2), seg(9000, 3)])
    const c = chart.overlays[2]
    chart.hover(c.id)
    click(chart, c.id)
    dm.reorderSelected(false)
    chart.hover(null)
    const others = chart.overlays.filter(o => o !== c).map(o => o.zLevel)
    expect(c.zLevel).toBeLessThan(Math.min(...others))
  })

  it('Ctrl+D on the hovered drawing does not give the copy a permanent MAX_SAFE_INTEGER zLevel (fixed)', async () => {
    const { chart, dm } = await setup([seg(1000, 1)])
    const [a] = chart.overlays
    chart.hover(a.id)
    click(chart, a.id)
    dm.duplicateSelected()
    expect(chart.overlays[1].zLevel).toBeLessThan(1000)
  })

  it('without hover, reorder works and is saved', async () => {
    const { chart, dm } = await setup([seg(1000, 1), seg(5000, 2), seg(9000, 3)])
    const [a] = chart.overlays
    click(chart, a.id)
    dm.reorderSelected(true)
    expect(a.zLevel).toBe(4)
    expect((await saved(dm))[0].zLevel).toBe(4)
  })
})

describe('DrawingManager: drawings shared by asset (seed from the market key)', () => {
  // Before "Mismos dibujos en todas las fuentes", drawings lived per market.
  // The first market opened seeds the asset key; any other market of the same
  // asset that already had its own drawings is never merged, so those
  // drawings disappear from view (still in IndexedDB, unreachable from the UI
  // unless the switch is turned off).
  it('per-market drawings of every exchange of the asset stay visible after switching to shared keys (fixed)', async () => {
    db.clear()
    db.set('market:hl:BTC', [seg(1000)])
    db.set('market:bn:BTCUSDT', [seg(5000), seg(9000)])
    const chart = new FakeChart()
    const dm = new DrawingManager(chart as never, {
      onCountChange: () => {}, onSelect: () => {}, onToolDone: () => {}, onTextRequest: async () => null
    })
    // First visit before the catalog knew the other exchange: only hl:BTC merges.
    await dm.setMarket('asset:crypto:BTC', ['hl:BTC'])
    dm.dataReady()
    expect(dm.count()).toBe(1)
    await flush()
    // Later the catalog lists bn:BTCUSDT too: its drawings join once, no duplicates.
    await dm.setMarket('asset:crypto:BTC', ['bn:BTCUSDT', 'hl:BTC'])
    dm.dataReady()
    expect(dm.count()).toBe(3)
    await flush()
    await dm.setMarket('asset:crypto:BTC', ['bn:BTCUSDT', 'hl:BTC'])
    dm.dataReady()
    expect(dm.count()).toBe(3)
    // The per-market originals are untouched.
    expect((db.get('market:bn:BTCUSDT') as unknown[]).length).toBe(2)
  })
})
