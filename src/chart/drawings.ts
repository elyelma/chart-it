import { getSupportedOverlays, type Chart, type Coordinate, type DeepPartial, type Overlay, type OverlayCreate, type OverlayMode, type OverlayPerformEventParams, type OverlayStyle, type Point } from 'klinecharts'
import { drawingsDb } from '../store/db'
import { FREEHAND_TOOLS, TEXT_TOOLS, withHandles } from './overlays'
import { DRAW_COLORS, drawingStyles } from './theme'

const GROUP = 'drawings'
/** Read lazily: our own overlays register when overlays.ts loads. */
const KNOWN_OVERLAYS = { has: (name: string) => getSupportedOverlays().includes(name) }
const TOOL_LOOKS_KEY = 'chartit:tool-looks'
const MERGED_KEY = 'chartit:merged-markets'

/** Markets whose own drawings were already merged into their shared asset. */
function readMerged(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(MERGED_KEY) ?? '[]') as unknown
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeMerged(set: Set<string>): void {
  try {
    localStorage.setItem(MERGED_KEY, JSON.stringify([...set]))
  } catch {
    /* storage full: merging again later is harmless (duplicates are skipped) */
  }
}

/** Identity of a drawing for de-duplication when merging. */
function sameDrawing(d: SavedDrawing): string {
  return JSON.stringify([d?.name, d?.points, d?.extendData])
}

function readToolLooks(): Record<string, Look> {
  try {
    const raw = JSON.parse(localStorage.getItem(TOOL_LOOKS_KEY) ?? '{}') as Record<string, Look>
    const out: Record<string, Look> = {}
    for (const [k, v] of Object.entries(raw ?? {})) {
      if (v && typeof v.color === 'string' && typeof v.size === 'number') out[k] = { color: v.color, size: v.size, dashed: !!v.dashed, textSize: v.textSize }
    }
    return out
  } catch {
    return {}
  }
}
const FINISHED = -1

/** Tools whose first two points Shift lines up (flat, upright or at 45°). */
const ALIGN_TOOLS = new Set(['segment', 'rayLine', 'straightLine', 'ciArrow', 'parallelStraightLine', 'priceChannelLine', 'fibonacciLine', 'ciMeasure'])
const HISTORY_MAX = 200

export interface SavedDrawing {
  name: string
  points: Array<Pick<Point, 'timestamp' | 'value'>>
  styles: DeepPartial<OverlayStyle> | null
  extendData: unknown
  lock: boolean
  visible: boolean
  zLevel?: number
  /** Grafito's own style memo so the properties bar can show it */
  look?: Look
}

export interface Look {
  color: string
  size: number
  dashed: boolean
  /** Font size of text drawings */
  textSize?: number
}

function styleOf(l: Look) {
  return drawingStyles(l.color, l.size, l.dashed, l.textSize ?? 14)
}

export interface DrawingEvents {
  onCountChange(count: number): void
  onSelect(overlay: Overlay | null, look: Look | null): void
  onToolDone(): void
  onTextRequest(current: string): Promise<string | null>
  /** Right click on a drawing (it is already selected). */
  onContextMenu?(overlay: Overlay): void
  /** Saving to the browser failed (disk full, private mode…). */
  onSaveError?(err: unknown): void
}

/**
 * Owns every drawing on the chart: creation, persistence per market (shared
 * across timeframes), undo/redo and bulk actions. There is no limit on how many.
 */
export class DrawingManager {
  private marketId: string | null = null
  private pendingRestore: SavedDrawing[] | null = null
  private undoStack: string[] = []
  private redoStack: string[] = []
  private lastSnapshot = '[]'
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private selectedId: string | null = null
  private looks = new Map<string, Look>()
  /**
   * Our own record of each drawing's stacking order. The library bumps a
   * hovered drawing to the top by rewriting its zLevel, so that field cannot
   * be trusted when saving.
   */
  private zs = new Map<string, number>()
  /** Saved drawings this version cannot show (e.g. from a newer backup): kept as-is. */
  private unknown: SavedDrawing[] = []
  /** While true, removals/creations we trigger ourselves are not recorded. */
  private muted = false

  private activeTool: string | null = null
  private toolLooks: Record<string, Look> = readToolLooks()

  magnet = false
  stayInTool = false
  /** Keys held right now: Ctrl = magnet, Shift = line up. */
  private held = { ctrl: false, shift: false }
  look: Look = { color: DRAW_COLORS[0], size: 2, dashed: false }

  constructor(private chart: Chart, private ev: DrawingEvents) {}

  // ---------------------------------------------------------------- market --

  /**
   * Loads the drawings stored under `id`. When drawings are shared by asset,
   * `seedIds` are the asset's markets on every exchange: drawings each of them
   * had on its own are merged in once (and the originals are left untouched).
   */
  async setMarket(id: string, seedIds: string[] = []): Promise<void> {
    this.flushSave()
    this.marketId = id
    this.silently(() => this.chart.removeOverlay({ groupId: GROUP }))
    this.looks.clear()
    this.zs.clear()
    this.unknown = []
    this.select(null)
    this.undoStack = []
    this.redoStack = []
    let stored = await drawingsDb.get<SavedDrawing[]>(this.key(id)).catch(() => undefined)
    const merged = readMerged()
    const pending = seedIds.filter(s => s !== id && !merged.has(s))
    if (pending.length) {
      const list: SavedDrawing[] = Array.isArray(stored) ? [...stored] : []
      const seen = new Set(list.map(sameDrawing))
      let added = 0
      for (const sid of pending) {
        const own = await drawingsDb.get<SavedDrawing[]>(this.key(sid)).catch(() => null)
        if (own === null) continue // read failed: try again next time
        merged.add(sid)
        for (const d of Array.isArray(own) ? own : []) {
          const k = sameDrawing(d)
          if (seen.has(k)) continue
          seen.add(k)
          list.push(d)
          added++
        }
      }
      writeMerged(merged)
      if (added) {
        stored = list
        drawingsDb.put(this.key(id), list).catch(err => this.ev.onSaveError?.(err))
      }
    }
    const saved = Array.isArray(stored) ? stored : []
    if (this.marketId !== id) return
    this.lastSnapshot = JSON.stringify(saved)
    this.savedSnap.set(this.key(id), this.lastSnapshot)
    this.pendingRestore = saved
    this.ev.onCountChange(saved.length)
  }

  /** Call once the first candles of the market are on screen. */
  dataReady(): void {
    if (!this.pendingRestore) return
    const list = this.pendingRestore
    this.pendingRestore = null
    this.apply(list)
  }

  // ----------------------------------------------------------------- tools --

  startTool(name: string): void {
    this.cancelDrawing()
    this.activeTool = name
    // Each tool remembers the style it was last given.
    const look = { ...(this.toolLooks[name] ?? this.look) }
    this.look = { ...look }
    const create: OverlayCreate = {
      name,
      groupId: GROUP,
      mode: this.mode(),
      styles: styleOf(look),
      ...this.handlers()
    }
    const id = this.chart.createOverlay(create)
    if (typeof id === 'string') {
      this.looks.set(id, look)
      this.decorate(id)
    }
  }

  /** Removes a drawing that was started but not finished. */
  cancelDrawing(): void {
    for (const o of this.chart.getOverlays({ groupId: GROUP })) {
      if (o.currentStep !== FINISHED) this.chart.removeOverlay({ id: o.id })
    }
  }

  setMagnet(on: boolean): void {
    this.magnet = on
    this.applyMode()
  }

  /** Magnet on, by the button or by holding Ctrl. */
  get magnetActive(): boolean {
    return this.magnet || this.held.ctrl
  }

  /** Ctrl held: strong magnet. Shift held: lines snap flat, upright or to 45°. */
  setHeldKeys(keys: { ctrl?: boolean; shift?: boolean }): void {
    const ctrl = this.held.ctrl
    Object.assign(this.held, keys)
    if (ctrl !== this.held.ctrl) this.applyMode()
  }

  private mode(): OverlayMode {
    return this.held.ctrl ? 'strong_magnet' : this.magnet ? 'weak_magnet' : 'normal'
  }

  /** Every drawing, the one in progress too, so it applies mid-gesture. */
  private applyMode(): void {
    const mode = this.mode()
    for (const o of this.chart.getOverlays({ groupId: GROUP })) this.chart.overrideOverlay({ id: o.id, mode })
  }

  /** Hooks the line-up behaviour into a line drawing (the library calls these as points move). */
  private decorate(id: string): void {
    const o = this.chart.getOverlays({ id })[0] as (Overlay & Record<string, unknown>) | undefined
    if (!o || !ALIGN_TOOLS.has(o.name)) return
    for (const hook of ['performEventMoveForDrawing', 'performEventPressedMove'] as const) {
      const own = o[hook] as ((p: OverlayPerformEventParams) => void) | null
      o[hook] = (p: OverlayPerformEventParams) => {
        if (this.held.shift) this.align(o, p)
        own?.call(o, p)
      }
    }
  }

  /** Moves the point being dragged so the line from the other end is flat, upright or at 45° on screen. */
  private align(o: Overlay, p: OverlayPerformEventParams): void {
    const i = p.performPointIndex
    const other = i === 0 ? p.points[1] : i === 1 ? p.points[0] : undefined
    const me = p.performPoint
    if (!other || other.value === undefined || me.value === undefined) return
    const [a, b] = this.chart.convertToPixel([other, me], { paneId: o.paneId }) as Coordinate[]
    if (!a || !b) return
    const dx = b.x - a.x
    const dy = b.y - a.y
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    const cos = Math.round(Math.cos(angle))
    const sin = Math.round(Math.sin(angle))
    if (sin === 0) {
      me.value = other.value
    } else if (cos === 0) {
      me.timestamp = other.timestamp
      me.dataIndex = other.dataIndex
    } else {
      const y = a.y + sin * Math.abs(dx)
      const v = (this.chart.convertFromPixel([{ x: b.x, y }], { paneId: o.paneId }) as Array<Partial<Point>>)[0]?.value
      if (v !== undefined) me.value = v
    }
  }

  // -------------------------------------------------------------- selection --

  get selected(): string | null {
    return this.selectedId
  }

  private select(id: string | null): void {
    this.selectedId = id
    const o = id ? this.chart.getOverlays({ id })[0] ?? null : null
    this.ev.onSelect(o, o ? this.looks.get(o.id) ?? this.look : null)
  }

  restyleSelected(patch: Partial<Look>): void {
    const id = this.selectedId
    if (!id) {
      // No selection: this becomes the style of the drawing in progress / the next one.
      this.look = { ...this.look, ...patch }
      if (this.activeTool) this.rememberToolLook(this.activeTool, this.look)
      for (const o of this.chart.getOverlays({ groupId: GROUP })) {
        if (o.currentStep === FINISHED) continue
        this.looks.set(o.id, { ...this.look })
        this.chart.overrideOverlay({ id: o.id, styles: styleOf(this.look) })
      }
      this.ev.onSelect(null, null)
      return
    }
    const look = { ...(this.looks.get(id) ?? this.look), ...patch }
    this.looks.set(id, look)
    this.look = { ...look }
    const name = this.chart.getOverlays({ id })[0]?.name
    if (name) this.rememberToolLook(name, look)
    this.chart.overrideOverlay({ id, styles: styleOf(look) })
    this.commit()
    this.select(id)
  }

  private rememberToolLook(name: string, look: Look): void {
    this.toolLooks[name] = { ...look }
    try {
      localStorage.setItem(TOOL_LOOKS_KEY, JSON.stringify(this.toolLooks))
    } catch {
      /* storage full: keep it for this session */
    }
  }

  // ----------------------------------------------------------- list panel --

  /** Finished drawings of this market, newest first. */
  list(): Overlay[] {
    return this.finished().reverse()
  }

  lookOf(id: string): Look {
    return this.looks.get(id) ?? this.look
  }

  setVisible(id: string, visible: boolean): void {
    this.chart.overrideOverlay({ id, visible })
    this.commit()
  }

  setLocked(id: string, lock: boolean): void {
    this.chart.overrideOverlay({ id, lock })
    this.commit()
  }

  removeById(id: string): void {
    this.chart.removeOverlay({ id })
    if (this.selectedId === id) this.select(null)
  }

  /** Scrolls the chart so the drawing's first point is in view. */
  focus(id: string): void {
    const ts = this.chart.getOverlays({ id })[0]?.points[0]?.timestamp
    if (ts) this.chart.scrollToTimestamp(ts, 300)
  }

  toggleLockSelected(): void {
    const o = this.selectedId ? this.chart.getOverlays({ id: this.selectedId })[0] : undefined
    if (!o) return
    this.chart.overrideOverlay({ id: o.id, lock: !o.lock })
    this.commit()
    this.select(o.id)
  }

  removeSelected(): void {
    if (!this.selectedId) return
    this.chart.removeOverlay({ id: this.selectedId })
    this.select(null)
  }

  /** Copy of the selected drawing, a little to the right and up. */
  duplicateSelected(): void {
    const o = this.selectedOverlay()
    if (!o) return
    const px = this.chart.convertToPixel(o.points, { paneId: o.paneId }) as Array<{ x?: number; y?: number }>
    const moved = this.chart.convertFromPixel(
      px.map(p => ({ x: (p.x ?? 0) + 24, y: (p.y ?? 0) - 24 })),
      { paneId: o.paneId }
    ) as Array<Partial<Point>>
    const look = { ...(this.looks.get(o.id) ?? this.look) }
    const id = this.chart.createOverlay({
      name: o.name,
      groupId: GROUP,
      points: moved.map(p => ({ timestamp: p.timestamp, value: p.value })),
      styles: o.styles,
      extendData: o.extendData,
      zLevel: this.zOf(o.id),
      mode: this.mode(),
      ...this.handlers()
    })
    if (typeof id === 'string') {
      this.decorate(id)
      this.looks.set(id, look)
      this.zs.set(id, this.zOf(o.id))
      this.commit()
      this.select(id)
    }
  }

  hideSelected(): void {
    const o = this.selectedOverlay()
    if (!o) return
    this.chart.overrideOverlay({ id: o.id, visible: false })
    this.select(null)
    this.commit()
  }

  /** Brings the selected drawing above (or below) every other one. */
  reorderSelected(front: boolean): void {
    const o = this.selectedOverlay()
    if (!o) return
    let z = 0
    for (const x of this.finished()) {
      if (x.id === o.id) continue
      const v = this.zOf(x.id)
      z = front ? Math.max(z, v + 1) : Math.min(z, v - 1)
    }
    this.zs.set(o.id, z)
    this.chart.overrideOverlay({ id: o.id, zLevel: z })
    // While hovered, the library restores this value when the mouse leaves.
    ;(o as unknown as { setPrevZLevel?: (z: number) => void }).setPrevZLevel?.(z)
    this.commit()
  }

  private zOf(id: string): number {
    return this.zs.get(id) ?? 0
  }

  private selectedOverlay(): Overlay | undefined {
    return this.selectedId ? this.chart.getOverlays({ id: this.selectedId })[0] : undefined
  }

  async editSelectedText(): Promise<void> {
    const o = this.selectedId ? this.chart.getOverlays({ id: this.selectedId })[0] : undefined
    if (!o || !TEXT_TOOLS.has(o.name)) return
    await this.editText(o)
  }

  // ------------------------------------------------------------ bulk / undo --

  count(): number {
    return this.finished().length
  }

  clearAll(): void {
    this.silently(() => this.chart.removeOverlay({ groupId: GROUP }))
    this.select(null)
    this.commit()
  }

  setAllVisible(visible: boolean): void {
    for (const o of this.finished()) this.chart.overrideOverlay({ id: o.id, visible })
    this.commit()
  }

  allHidden(): boolean {
    const list = this.finished()
    return list.length > 0 && list.every(o => !o.visible)
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (prev === undefined) return
    this.redoStack.push(this.lastSnapshot)
    this.replaceWith(prev)
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (next === undefined) return
    this.undoStack.push(this.lastSnapshot)
    this.replaceWith(next)
  }

  // --------------------------------------------------------------- internals --

  private key(id: string): string {
    return `market:${id}`
  }

  private finished(): Overlay[] {
    return this.chart.getOverlays({ groupId: GROUP }).filter(o => o.currentStep === FINISHED)
  }

  private handlers(): Partial<OverlayCreate> {
    return {
      onDrawEnd: ({ overlay }) => {
        const full = withHandles(overlay.name, overlay.points)
        if (full !== overlay.points) this.chart.overrideOverlay({ id: overlay.id, points: full })
        if (TEXT_TOOLS.has(overlay.name)) {
          void this.editText(overlay, true)
        } else {
          this.commit()
        }
        if (this.stayInTool || FREEHAND_TOOLS.has(overlay.name)) {
          // keep drawing with the same tool
          setTimeout(() => this.startTool(overlay.name), 0)
        } else {
          this.ev.onToolDone()
        }
      },
      onPressedMoveEnd: () => this.commit(),
      onRemoved: ({ overlay }) => {
        this.looks.delete(overlay.id)
        if (this.selectedId === overlay.id) this.select(null)
        // The library fires this before taking the overlay out of its list,
        // so record the new state right after. Our own bulk removals are muted.
        if (overlay.currentStep === FINISHED && !this.muted) setTimeout(() => this.commit(), 0)
      },
      onSelected: ({ overlay }) => this.select(overlay.id),
      onDeselected: ({ overlay }) => {
        if (this.selectedId === overlay.id) this.select(null)
      },
      onDoubleClick: ({ overlay }) => {
        if (TEXT_TOOLS.has(overlay.name)) void this.editText(overlay)
      },
      onRightClick: event => {
        // Right click never deletes by accident: it selects instead.
        event.preventDefault?.()
        this.select(event.overlay.id)
        this.ev.onContextMenu?.(event.overlay)
      }
    }
  }

  private async editText(o: Overlay, isNew = false): Promise<void> {
    const text = await this.ev.onTextRequest(typeof o.extendData === 'string' ? o.extendData : '')
    if (text === null || text.trim() === '') {
      if (isNew) this.chart.removeOverlay({ id: o.id })
      return
    }
    this.chart.overrideOverlay({ id: o.id, extendData: text })
    this.commit()
  }

  private serialize(): SavedDrawing[] {
    return this.finished().map<SavedDrawing>(o => ({
      name: o.name,
      points: o.points.map(p => ({ timestamp: p.timestamp ?? 0, value: p.value ?? 0 })),
      styles: o.styles,
      extendData: o.extendData,
      lock: o.lock,
      visible: o.visible,
      zLevel: this.zOf(o.id) || undefined,
      look: this.looks.get(o.id)
    })).concat(this.unknown)
  }

  private apply(list: SavedDrawing[]): void {
    this.muted = true
    try {
      this.applyUnmuted(list)
    } finally {
      this.muted = false
    }
    this.ev.onCountChange(list.length)
  }

  private silently(fn: () => void): void {
    this.muted = true
    try {
      fn()
    } finally {
      this.muted = false
    }
  }

  private applyUnmuted(list: SavedDrawing[]): void {
    this.chart.removeOverlay({ groupId: GROUP })
    this.looks.clear()
    this.zs.clear()
    this.unknown = []
    for (const d of list) {
      // Skip broken entries (hand-edited or damaged backups) instead of failing the whole load.
      if (!d || typeof d.name !== 'string' || !Array.isArray(d.points)) continue
      if (!KNOWN_OVERLAYS.has(d.name)) {
        this.unknown.push(d)
        continue
      }
      // Repairs values saved while the library had a drawing raised on hover.
      const z = Number.isFinite(d.zLevel) && Math.abs(d.zLevel as number) < 1e6 ? (d.zLevel as number) : 0
      const id = this.chart.createOverlay({
        name: d.name,
        groupId: GROUP,
        points: withHandles(d.name, d.points),
        styles: d.styles,
        extendData: d.extendData,
        lock: d.lock,
        visible: d.visible,
        zLevel: z,
        mode: this.mode(),
        ...this.handlers()
      })
      if (typeof id !== 'string') continue
      this.decorate(id)
      this.zs.set(id, z)
      if (d.look) this.looks.set(id, d.look)
    }
  }

  private replaceWith(snapshot: string): void {
    this.select(null)
    this.apply(JSON.parse(snapshot) as SavedDrawing[])
    this.lastSnapshot = snapshot
    this.scheduleSave(snapshot)
  }

  /** Records the current state: undo history + persistence. */
  private commit(): void {
    if (this.muted || !this.marketId || this.pendingRestore) return
    const snap = JSON.stringify(this.serialize())
    if (snap === this.lastSnapshot) return
    this.undoStack.push(this.lastSnapshot)
    if (this.undoStack.length > HISTORY_MAX) this.undoStack.shift()
    this.redoStack = []
    this.lastSnapshot = snap
    this.ev.onCountChange(this.count())
    this.scheduleSave(snap)
  }

  private pendingSave: { key: string; snap: string } | null = null
  /** What each key held when last read or written, for the safety copy. */
  private savedSnap = new Map<string, string>()

  private scheduleSave(snap: string): void {
    if (!this.marketId) return
    this.ev.onCountChange(this.count())
    const key = this.key(this.marketId)
    // Safety copy: a list that had drawings is about to be saved empty.
    if (snap === '[]' && this.savedSnap.get(key) && this.savedSnap.get(key) !== '[]') {
      drawingsDb.put(`${key}:antes-de-vaciar`, JSON.parse(this.savedSnap.get(key) as string)).catch(() => {})
    }
    this.savedSnap.set(key, snap)
    this.pendingSave = { key, snap }
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flushSave(), 250)
  }

  flushSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    const p = this.pendingSave
    this.pendingSave = null
    if (p) drawingsDb.put(p.key, JSON.parse(p.snap)).catch(err => this.ev.onSaveError?.(err))
  }
}
