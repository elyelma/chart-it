import type { Overlay } from 'klinecharts'
import type { DrawingManager, Look } from '../chart/drawings'
import { TOOLS } from '../chart/overlays'
import { DRAW_COLORS } from '../chart/theme'
import { dialog } from './feedback'
import { icon } from './icons'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/** Floating tool dock + the properties bar for the selected drawing. */
export class Dock {
  private tool = 'cursor'
  private dock = $('dock')
  private props = $('props')
  private countEl!: HTMLElement
  private hideBtn!: HTMLButtonElement

  constructor(private dm: DrawingManager) {
    this.build()
  }

  get currentTool(): string {
    return this.tool
  }

  select(name: string): void {
    this.tool = name
    this.dock.querySelectorAll<HTMLElement>('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === name))
    if (name === 'cursor') this.dm.cancelDrawing()
    else this.dm.startTool(name)
    if (!this.dm.selected) this.showProps(null, null)
  }

  setCount(n: number): void {
    this.countEl.innerHTML = `<b>${n.toLocaleString('es')}</b> dibujos · sin límite`
    this.hideBtn.innerHTML = icon(this.dm.allHidden() ? 'eyeOff' : 'eye')
    this.hideBtn.classList.toggle('on', this.dm.allHidden())
  }

  /** Selected drawing → its properties; no selection but a tool active → style of the next drawing. */
  showProps(o: Overlay | null, look: Look | null): void {
    if (!o && this.tool !== 'cursor') look = this.dm.look
    if (!look) {
      this.props.hidden = true
      return
    }
    this.props.hidden = false
    this.props.innerHTML = ''
    const add = (el: HTMLElement) => this.props.appendChild(el)
    const sep = () => {
      const s = document.createElement('div')
      s.className = 'sep'
      add(s)
    }
    for (const c of DRAW_COLORS) {
      const b = document.createElement('button')
      b.className = 'swatch' + (c.toLowerCase() === look.color.toLowerCase() ? ' on' : '')
      b.style.background = c
      b.title = c
      b.onclick = () => this.dm.restyleSelected({ color: c })
      add(b)
    }
    sep()
    for (const w of [1, 2, 3, 4]) {
      const b = this.pbtn(`${w}px`, `Grosor ${w}`, look.size === w)
      b.onclick = () => this.dm.restyleSelected({ size: w })
      add(b)
    }
    const dash = this.pbtn(icon('dash', 16), 'Línea punteada', look.dashed)
    dash.onclick = () => this.dm.restyleSelected({ dashed: !look.dashed })
    add(dash)
    if (!o) {
      const hint = document.createElement('span')
      hint.className = 'label'
      hint.style.marginLeft = '6px'
      hint.textContent = 'estilo del próximo dibujo'
      add(hint)
      return
    }
    sep()
    if (o.name === 'ciText') {
      const ed = this.pbtn(icon('edit', 16), 'Editar texto', false)
      ed.onclick = () => void this.dm.editSelectedText()
      add(ed)
    }
    const lock = this.pbtn(icon(o.lock ? 'lock' : 'unlock', 16), o.lock ? 'Desbloquear' : 'Bloquear', o.lock)
    lock.onclick = () => this.dm.toggleLockSelected()
    add(lock)
    const del = this.pbtn(icon('trash', 16), 'Borrar (Supr)', false)
    del.classList.add('danger')
    del.onclick = () => this.dm.removeSelected()
    add(del)
  }

  private pbtn(html: string, tip: string, on: boolean): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'pbtn' + (on ? ' on' : '')
    b.innerHTML = html
    b.dataset.tip = tip
    return b
  }

  private btn(name: string, tip: string, key?: string): HTMLButtonElement {
    const b = document.createElement('button')
    b.innerHTML = icon(name)
    b.dataset.tip = tip
    if (key) b.dataset.key = key
    this.dock.appendChild(b)
    return b
  }

  private sep(): void {
    const s = document.createElement('div')
    s.className = 'sep'
    this.dock.appendChild(s)
  }

  private build(): void {
    TOOLS.forEach((t, i) => {
      const b = this.btn(t.name, t.label, t.key)
      b.dataset.tool = t.name
      b.onclick = () => this.select(this.tool === t.name && t.name !== 'cursor' ? 'cursor' : t.name)
      if (i === 0 || i === 1) this.sep()
    })
    this.dock.querySelector('[data-tool="cursor"]')?.classList.add('on')
    this.sep()

    const magnet = this.btn('magnet', 'Imán: pega los puntos a las velas')
    magnet.classList.add('toggle')
    magnet.onclick = () => {
      this.dm.setMagnet(!this.dm.magnet)
      magnet.classList.toggle('on', this.dm.magnet)
    }
    const stay = this.btn('stay', 'Seguir dibujando con la misma herramienta')
    stay.classList.add('toggle')
    stay.onclick = () => {
      this.dm.stayInTool = !this.dm.stayInTool
      stay.classList.toggle('on', this.dm.stayInTool)
    }
    this.hideBtn = this.btn('eye', 'Ocultar / mostrar todos los dibujos')
    this.hideBtn.classList.add('toggle')
    this.hideBtn.onclick = () => this.dm.setAllVisible(this.dm.allHidden())
    this.sep()
    this.btn('undo', 'Deshacer', 'Ctrl+Z').onclick = () => this.dm.undo()
    this.btn('redo', 'Rehacer', 'Ctrl+Y').onclick = () => this.dm.redo()
    this.btn('trash', 'Borrar todos los dibujos de este símbolo').onclick = async () => {
      const n = this.dm.count()
      if (n === 0) return
      const ok = await dialog({
        title: 'Borrar todos los dibujos',
        message: `Se borrarán los ${n} dibujos de este símbolo. Puedes recuperarlos con Deshacer (Ctrl+Z) mientras no cambies de símbolo.`,
        ok: 'Borrar todo',
        danger: true
      })
      if (ok !== null) this.dm.clearAll()
    }
    this.sep()
    this.countEl = document.createElement('div')
    this.countEl.className = 'count'
    this.dock.appendChild(this.countEl)
    this.setCount(0)
  }
}
