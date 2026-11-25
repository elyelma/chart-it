import type { Overlay } from 'klinecharts'
import type { DrawingManager } from '../chart/drawings'
import { TEXT_TOOLS, toolByName } from '../chart/overlays'
import { icon } from './icons'
import { Popup } from './popup'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/** Right-click menu of a drawing. */
export class DrawingMenu {
  private el = $('drawingMenu')
  private popup = new Popup(this.el, [])
  private at = { x: 0, y: 0 }

  constructor(private dm: DrawingManager) {
    const chart = $('chart')
    // Remember where the right click happened; the chart reports the drawing a moment later.
    chart.addEventListener('pointerdown', e => {
      if (e.button === 2) this.at = { x: e.clientX, y: e.clientY }
    }, true)
    chart.addEventListener('contextmenu', e => e.preventDefault())
  }

  get isOpen(): boolean {
    return this.popup.isOpen
  }

  /**
   * The chart reports the right click on pointerdown, before the mousedown that
   * closes open menus; open right after that so the menu stays.
   */
  open(o: Overlay): void {
    setTimeout(() => this.show(o), 30)
  }

  private show(o: Overlay): void {
    const m = this.el
    m.innerHTML = ''
    const title = document.createElement('div')
    title.className = 'cm-title'
    title.textContent = toolByName(o.name)?.label ?? 'Dibujo'
    m.appendChild(title)
    const item = (ic: string, label: string, run: () => void, key?: string, danger = false) => {
      const b = document.createElement('button')
      b.className = 'cm-item' + (danger ? ' danger' : '')
      b.innerHTML = `${icon(ic, 16)}<span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}`
      b.onclick = () => {
        this.popup.close()
        run()
      }
      m.appendChild(b)
    }
    const sep = () => {
      const s = document.createElement('div')
      s.className = 'cm-sep'
      m.appendChild(s)
    }
    if (TEXT_TOOLS.has(o.name)) item('edit', 'Editar texto', () => void this.dm.editSelectedText())
    item('copy', 'Duplicar', () => this.dm.duplicateSelected(), 'Ctrl D')
    item(o.lock ? 'unlock' : 'lock', o.lock ? 'Desbloquear' : 'Bloquear', () => this.dm.toggleLockSelected())
    item('eyeOff', 'Ocultar', () => this.dm.hideSelected())
    sep()
    item('front', 'Traer al frente', () => this.dm.reorderSelected(true))
    item('front', 'Enviar atrás', () => this.dm.reorderSelected(false))
    sep()
    item('trash', 'Borrar', () => this.dm.removeSelected(), 'Supr', true)

    this.popup.open()
    const w = m.offsetWidth
    const h = m.offsetHeight
    m.style.left = `${Math.min(this.at.x, window.innerWidth - w - 8)}px`
    m.style.top = `${Math.min(this.at.y, window.innerHeight - h - 8)}px`
  }

  close(): void {
    this.popup.close()
  }
}
