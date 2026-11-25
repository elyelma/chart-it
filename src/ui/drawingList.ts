import type { DrawingManager } from '../chart/drawings'
import { TEXT_TOOLS, toolByName } from '../chart/overlays'
import { icon } from './icons'
import { panelHeader, Popup } from './popup'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/**
 * Every drawing of the open market in one list: show/hide, lock, delete,
 * and click to bring it into view. With unlimited drawings, this is how
 * people keep them tidy.
 */
export class DrawingList {
  private panel = $('drawingList')
  private popup: Popup

  constructor(private dm: DrawingManager, trigger: HTMLElement, private precision: () => number) {
    this.popup = new Popup(this.panel, [trigger], { onOpen: () => this.render() })
  }

  /** Call when drawings change. */
  refresh(): void {
    if (this.popup.isOpen) this.render()
  }

  private render(): void {
    const p = this.panel
    const scroll = p.querySelector('.panel-body')?.scrollTop ?? 0
    p.innerHTML = ''
    const items = this.dm.list()
    p.appendChild(panelHeader(`Dibujos de este símbolo · ${items.length}`, () => this.popup.close()))
    const body = document.createElement('div')
    body.className = 'panel-body'
    p.appendChild(body)
    if (!items.length) {
      const e = document.createElement('div')
      e.className = 'panel-empty'
      e.textContent = 'Todavía no hay dibujos aquí. Abre Dibujos y empieza.'
      body.appendChild(e)
      return
    }
    for (const o of items) {
      const row = document.createElement('div')
      row.className = 'dl-row' + (o.visible ? '' : ' hidden-drawing')
      const look = this.dm.lookOf(o.id)
      const sw = document.createElement('span')
      sw.className = 'dl-color'
      sw.style.background = look.color
      const main = document.createElement('button')
      main.className = 'dl-main'
      main.dataset.tip = 'Ir al dibujo'
      main.innerHTML = icon(o.name, 16)
      const label = document.createElement('span')
      label.className = 'dl-label'
      label.textContent = toolByName(o.name)?.label ?? o.name
      const sub = document.createElement('small')
      const text = TEXT_TOOLS.has(o.name) && typeof o.extendData === 'string' ? o.extendData.split('\n')[0] : ''
      const price = o.points[0]?.value
      sub.textContent = text || (price !== undefined ? price.toFixed(this.precision()) : '')
      main.append(label, sub)
      main.onclick = () => this.dm.focus(o.id)
      const btn = (ic: string, tip: string, on: boolean, run: () => void, cls = '') => {
        const b = document.createElement('button')
        b.className = `star-btn dl-act ${cls}` + (on ? ' active' : '')
        b.innerHTML = icon(ic, 15)
        b.dataset.tip = tip
        b.onclick = () => {
          run()
          this.render()
        }
        return b
      }
      row.append(
        sw,
        main,
        btn(o.visible ? 'eye' : 'eyeOff', o.visible ? 'Ocultar' : 'Mostrar', !o.visible, () => this.dm.setVisible(o.id, !o.visible)),
        btn(o.lock ? 'lock' : 'unlock', o.lock ? 'Desbloquear' : 'Bloquear', o.lock, () => this.dm.setLocked(o.id, !o.lock)),
        btn('trash', 'Borrar', false, () => this.dm.removeById(o.id), 'del')
      )
      body.appendChild(row)
    }
    body.scrollTop = scroll
  }
}
