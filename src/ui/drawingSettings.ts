import type { Overlay, Point } from 'klinecharts'
import type { DrawingManager } from '../chart/drawings'
import {
  FIB_EXT,
  globalFibLevels,
  ownLevels,
  parseFibLevels,
  priceUnit,
  TEXT_TOOLS,
  toolByName,
  type PriceUnit
} from '../chart/overlays'
import { toast } from './feedback'
import { icon } from './icons'
import { panelHeader, Popup } from './popup'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const FIB = new Set(['fibonacciLine', 'ciFibExtension'])
const POSITIONS = new Set(['ciLong', 'ciShort', 'ciPosition'])
/** Drawings whose prices are not worth typing (time-only or freehand). */
const NO_PRICES = new Set(['verticalStraightLine', 'verticalRayLine', 'verticalSegment', 'ciDateRange', 'brush', 'ciMarker'])
const ONE_PRICE = new Set(['horizontalStraightLine', 'horizontalRayLine', 'horizontalSegment', 'priceLine', 'ciText', 'ciMarker', 'ciSignalUp', 'ciSignalDown'])

/** Numbers as people type them: "61 234,5", "61,234.5", "0,382". */
function readNumber(text: string): number | null {
  let t = text.trim().replace(/\s/g, '')
  if (!t) return null
  if (t.includes('.') && t.includes(',')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (t.includes(',')) t = t.replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * The gear of a drawing: what matters about that one drawing, in numbers.
 * Fibonacci → its own levels; buy / sell → entry, target and stop in price or
 * points / pips; other drawings → the price of each point.
 */
export class DrawingSettings {
  private el = $('drawSettings')
  private popup: Popup
  private closedAt = 0

  constructor(private dm: DrawingManager, private precision: () => number) {
    this.popup = new Popup(this.el, [], { onOpen: () => this.render(), onClose: () => (this.closedAt = performance.now()) })
  }

  get isOpen(): boolean {
    return this.popup.isOpen
  }

  open(): void {
    if (!this.dm.selectedOverlay()) return
    this.popup.open()
  }

  close(): void {
    this.popup.close()
  }

  /** For the gear button: the click outside that closed it must not reopen it. */
  toggle(): void {
    if (this.popup.isOpen) this.close()
    else if (performance.now() - this.closedAt > 250) this.open()
  }

  /** The selection changed: follow it, or close when nothing is selected. */
  selectionChanged(): void {
    if (!this.popup.isOpen) return
    if (this.dm.selectedOverlay()) this.render()
    else this.close()
  }

  private render(): void {
    const o = this.dm.selectedOverlay()
    const p = this.el
    p.innerHTML = ''
    if (!o) return
    p.appendChild(panelHeader(`${toolByName(o.name)?.label ?? 'Dibujo'} · ajustes`, () => this.close()))
    const body = document.createElement('div')
    body.className = 'panel-body ds-body'
    p.appendChild(body)
    // Each section is its own box, so Enter applies the one being typed in.
    const section = () => {
      const d = document.createElement('div')
      d.className = 'ds-section'
      body.appendChild(d)
      return d
    }
    if (FIB.has(o.name)) this.fibSection(section(), o)
    if (POSITIONS.has(o.name)) this.positionSection(section(), o)
    else if (!NO_PRICES.has(o.name)) this.pricesSection(section(), o)
    for (const d of [...body.querySelectorAll('.ds-section')]) if (!d.children.length) d.remove()
    if (TEXT_TOOLS.has(o.name)) {
      const b = document.createElement('button')
      b.className = 'btn ds-wide'
      b.innerHTML = `${icon('edit', 16)}<span>Editar texto</span>`
      b.onclick = () => {
        this.close()
        void this.dm.editSelectedText()
      }
      body.appendChild(b)
    }
    if (!body.children.length) {
      const e = document.createElement('p')
      e.className = 'settings-note'
      e.textContent = 'Este dibujo no tiene ajustes propios. Color, grosor y estilo están en la barra de abajo.'
      body.appendChild(e)
    }
  }

  // ------------------------------------------------------------ helpers --

  private heading(body: HTMLElement, text: string): void {
    const h = document.createElement('h4')
    h.textContent = text
    body.appendChild(h)
  }

  private input(value: string, label: string): HTMLInputElement {
    const i = document.createElement('input')
    i.className = 'ds-input'
    i.inputMode = 'decimal'
    i.value = value
    i.setAttribute('aria-label', label)
    i.spellcheck = false
    return i
  }

  private actions(body: HTMLElement, onApply: () => void, extra?: HTMLButtonElement): void {
    const row = document.createElement('div')
    row.className = 'ds-actions'
    if (extra) row.appendChild(extra)
    const ok = document.createElement('button')
    ok.className = 'btn primary'
    ok.textContent = 'Aplicar'
    ok.onclick = onApply
    row.appendChild(ok)
    body.appendChild(row)
    body.onkeydown = e => {
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
        e.preventDefault()
        onApply()
      }
    }
  }

  private fmt(v: number | undefined): string {
    return typeof v === 'number' ? v.toFixed(this.precision()) : ''
  }

  // ---------------------------------------------------------- fibonacci --

  private fibSection(body: HTMLElement, o: Overlay): void {
    const own = ownLevels(o.extendData)
    const fallback = o.name === 'fibonacciLine' ? globalFibLevels() : FIB_EXT
    this.heading(body, 'Niveles de este dibujo')
    const note = document.createElement('p')
    note.className = 'settings-note'
    note.textContent = own
      ? 'Este dibujo usa sus propios niveles.'
      : o.name === 'fibonacciLine'
        ? 'Ahora usa los niveles de ⚙ Ajustes. Escribe otros para usarlos solo aquí.'
        : 'Ahora usa los niveles habituales. Escribe otros para usarlos solo aquí.'
    body.appendChild(note)
    const field = this.input((own ?? fallback).join(', '), 'Niveles')
    field.classList.add('ds-full')
    body.appendChild(field)
    const reset = document.createElement('button')
    reset.className = 'btn ghost'
    reset.textContent = 'Usar los habituales'
    reset.disabled = !own
    reset.onclick = () => {
      this.dm.updateSelected({ extendData: null })
      this.render()
    }
    this.actions(body, () => {
      const levels = parseFibLevels(field.value)
      if ('error' in levels) return toast(levels.error, 'error')
      this.dm.updateSelected({ extendData: { levels: [...levels].sort((a, b) => a - b) } })
      this.render()
    }, reset)
  }

  // ----------------------------------------------------------- position --

  private positionSection(body: HTMLElement, o: Overlay): void {
    const pts = o.points
    const entry0 = pts[0]?.value ?? 0
    const long = o.name === 'ciLong' || (o.name === 'ciPosition' && (pts[1]?.value ?? entry0) >= entry0)
    const unit: PriceUnit = priceUnit(entry0)
    this.heading(body, long ? 'Compra' : 'Venta')

    const grid = document.createElement('div')
    grid.className = 'ds-grid'
    const head = (t: string) => {
      const s = document.createElement('span')
      s.className = 'ds-colhead'
      s.textContent = t
      grid.appendChild(s)
    }
    head('')
    head('Precio')
    head(unit.name === 'pips' ? 'Pips' : 'Puntos')

    const entry = this.input(this.fmt(pts[0]?.value), 'Precio de entrada')
    const rows: Array<{ price: HTMLInputElement; dist: HTMLInputElement; side: 1 | -1 }> = []
    const label = (t: string, cls = '') => {
      const s = document.createElement('span')
      s.className = 'ds-label ' + cls
      s.textContent = t
      grid.appendChild(s)
    }
    label('Entrada')
    grid.appendChild(entry)
    grid.appendChild(document.createElement('span'))

    const distOf = (price: number, e: number) => Math.abs(price - e) / unit.size
    const roundU = (n: number) => String(Math.round(n * 10) / 10)
    const addRow = (name: string, cls: string, value: number | undefined, side: 1 | -1) => {
      label(name, cls)
      const price = this.input(this.fmt(value), `Precio de ${name.toLowerCase()}`)
      const dist = this.input(typeof value === 'number' ? roundU(distOf(value, entry0)) : '', `${name} en ${unit.name}`)
      // Typing one fills the other.
      price.oninput = () => {
        const v = readNumber(price.value)
        const e = readNumber(entry.value)
        if (v !== null && e !== null) dist.value = roundU(distOf(v, e))
      }
      dist.oninput = () => {
        const d = readNumber(dist.value)
        const e = readNumber(entry.value)
        if (d !== null && e !== null) price.value = (e + side * Math.abs(d) * unit.size).toFixed(this.precision())
      }
      grid.append(price, dist)
      rows.push({ price, dist, side })
    }
    // Target goes up for a buy, down for a sell; the stop the other way.
    const up: 1 | -1 = long ? 1 : -1
    addRow('Objetivo', 'up', pts[1]?.value, up)
    addRow('Stop', 'down', pts[2]?.value, up === 1 ? -1 : 1)
    entry.oninput = () => {
      // Moving the entry keeps the distances in points / pips.
      const e = readNumber(entry.value)
      if (e === null) return
      for (const r of rows) {
        const d = readNumber(r.dist.value)
        if (d !== null) r.price.value = (e + r.side * Math.abs(d) * unit.size).toFixed(this.precision())
      }
    }
    body.appendChild(grid)

    const info = document.createElement('p')
    info.className = 'settings-note ds-info'
    const show = () => {
      const e = readNumber(entry.value) ?? 0
      const t = readNumber(rows[0].price.value) ?? e
      const st = readNumber(rows[1].price.value) ?? e
      const risk = Math.abs(e - st)
      const rr = risk > 0 ? (Math.abs(t - e) / risk).toFixed(2) : '—'
      info.textContent = `R:R ${rr} · 1 ${unit.name === 'pips' ? 'pip' : 'punto'} = ${unit.size} de precio`
    }
    show()
    grid.addEventListener('input', show)
    body.appendChild(info)

    this.actions(body, () => {
      const e = readNumber(entry.value)
      const t = readNumber(rows[0].price.value)
      const st = readNumber(rows[1].price.value)
      if (e === null || t === null || st === null) return toast('Revisa los precios: hay uno vacío o que no es un número.', 'error')
      if (long ? t <= e : t >= e) return toast(long ? 'En una compra el objetivo va por encima de la entrada.' : 'En una venta el objetivo va por debajo de la entrada.', 'error')
      if (long ? st >= e : st <= e) return toast(long ? 'En una compra el stop va por debajo de la entrada.' : 'En una venta el stop va por encima de la entrada.', 'error')
      const next = pts.map(p => ({ ...p })) as Array<Partial<Point>>
      next[0].value = e
      next[1].value = t
      next[2].value = st
      if (next[3]) next[3].value = e
      this.dm.updateSelected({ points: next })
      this.render()
    })
  }

  // ------------------------------------------------------------- prices --

  private pricesSection(body: HTMLElement, o: Overlay): void {
    const n = ONE_PRICE.has(o.name) ? 1 : o.name === 'ciRect' ? 2 : o.points.length
    if (!n) return
    this.heading(body, n === 1 ? 'Precio' : 'Precios')
    const grid = document.createElement('div')
    grid.className = 'ds-grid two'
    const names = o.name === 'ciRect' ? ['Esquina 1', 'Esquina 2'] : Array.from({ length: n }, (_, i) => (n === 1 ? 'Precio' : `Punto ${i + 1}`))
    const fields = names.map((name, i) => {
      const s = document.createElement('span')
      s.className = 'ds-label'
      s.textContent = name
      const f = this.input(this.fmt(o.points[i]?.value), name)
      grid.append(s, f)
      return f
    })
    body.appendChild(grid)
    this.actions(body, () => {
      const values = fields.map(f => readNumber(f.value))
      if (values.some(v => v === null)) return toast('Revisa los precios: hay uno vacío o que no es un número.', 'error')
      const next = o.points.map(p => ({ ...p })) as Array<Partial<Point>>
      values.forEach((v, i) => (next[i].value = v as number))
      // A rectangle's other handles follow its two corners.
      this.dm.updateSelected({ points: o.name === 'ciRect' ? next.slice(0, 2) : next })
      this.render()
    })
  }
}
