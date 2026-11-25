import type { Chart, DeepPartial, Overlay, OverlayCreate, OverlayStyle, Point } from 'klinecharts'
import { drawingsDb } from '../store/db'
import { FREEHAND_TOOLS, TEXT_TOOLS } from './overlays'
import { DRAW_COLORS, drawingStyles } from './theme'

const GROUP = 'drawings'
const TOOL_LOOKS_KEY = 'chartit:tool-looks'

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
const HISTORY_MAX = 200

export interface SavedDrawing {
  name: string
  points: Array<Pick<Point, 'timestamp' | 'value'>>
  styles: DeepPartial<OverlayStyle> | null
  extendData: unknown
  lock: boolean
  visible: boolean
  zLevel?: number
  /** Chart-It's own style memo so the properties bar can show it */
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
  /** While true, removals/creations we trigger ourselves are not recorded. */
  private muted = false

  private activeTool: string | null = null
  private toolLooks: Record<string, Look> = readToolLooks()

  magnet = false
  stayInTool = false
  look: Look = { color: DRAW_COLORS[0], size: 2, dashed: false }

  constructor(private chart: Chart, private ev: DrawingEvents) {}

  // ---------------------------------------------------------------- market --

  async setMarket(id: string): Promise<void> {
    this.flushSave()
    this.marketId = id
    this.silently(() => this.chart.removeOverlay({ groupId: GROUP }))
    this.looks.clear()
    this.select(null)
    this.undoStack = []
    this.redoStack = []
    const saved = (await drawingsDb.get<SavedDrawing[]>(this.key(id)).catch(() => undefined)) ?? []
    if (this.marketId !== id) return
    this.lastSnapshot = JSON.stringify(saved)
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
      mode: this.magnet ? 'weak_magnet' : 'normal',
      styles: styleOf(look),
      ...this.handlers()
    }
    const id = this.chart.createOverlay(create)
    if (typeof id === 'string') this.looks.set(id, look)
  }

  /** Removes a drawing that was started but not finished. */
  cancelDrawing(): void {
    for (const o of this.chart.getOverlays({ groupId: GROUP })) {
      if (o.currentStep !== FINISHED) this.chart.removeOverlay({ id: o.id })
    }
  }

  setMagnet(on: boolean): void {
    this.magnet = on
    for (const o of this.finished()) this.chart.overrideOverlay({ id: o.id, mode: on ? 'weak_magnet' : 'normal' })
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
      zLevel: o.zLevel,
      mode: this.magnet ? 'weak_magnet' : 'normal',
      ...this.handlers()
    })
    if (typeof id === 'string') {
      this.looks.set(id, look)
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
    const levels = this.finished().map(x => x.zLevel ?? 0)
    const z = front ? Math.max(0, ...levels) + 1 : Math.min(0, ...levels) - 1
    this.chart.overrideOverlay({ id: o.id, zLevel: z })
    this.commit()
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
    return this.finished().map(o => ({
      name: o.name,
      points: o.points.map(p => ({ timestamp: p.timestamp ?? 0, value: p.value ?? 0 })),
      styles: o.styles,
      extendData: o.extendData,
      lock: o.lock,
      visible: o.visible,
      zLevel: o.zLevel || undefined,
      look: this.looks.get(o.id)
    }))
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
    for (const d of list) {
      const id = this.chart.createOverlay({
        name: d.name,
        groupId: GROUP,
        points: d.points,
        styles: d.styles,
        extendData: d.extendData,
        lock: d.lock,
        visible: d.visible,
        zLevel: d.zLevel ?? 0,
        mode: this.magnet ? 'weak_magnet' : 'normal',
        ...this.handlers()
      })
      if (typeof id === 'string' && d.look) this.looks.set(id, d.look)
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

  private scheduleSave(snap: string): void {
    if (!this.marketId) return
    this.ev.onCountChange(this.count())
    this.pendingSave = { key: this.key(this.marketId), snap }
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
