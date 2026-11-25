import { TOOLS } from '../chart/overlays'
import { panelHeader, Popup } from './popup'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const GENERAL: Array<[string, string]> = [
  ['Ctrl K  ·  /', 'Buscar símbolo'],
  ['Ctrl Z', 'Deshacer'],
  ['Ctrl Y', 'Rehacer'],
  ['Supr', 'Borrar el dibujo seleccionado'],
  ['Esc', 'Cerrar lo abierto · soltar la herramienta'],
  ['?', 'Esta ayuda']
]

/** "?" opens a sheet with every keyboard shortcut. */
export class ShortcutsSheet {
  private panel = $('shortcutsPanel')
  private popup = new Popup(this.panel, [], { onOpen: () => this.render() })

  open(): void {
    this.popup.open()
  }

  toggle(): void {
    this.popup.toggle()
  }

  private render(): void {
    const p = this.panel
    p.innerHTML = ''
    p.appendChild(panelHeader('Atajos de teclado', () => this.popup.close()))
    const body = document.createElement('div')
    body.className = 'panel-body shortcuts'
    const col = (title: string, rows: Array<[string, string]>) => {
      const c = document.createElement('div')
      const h = document.createElement('h4')
      h.textContent = title
      c.appendChild(h)
      for (const [k, label] of rows) {
        const r = document.createElement('div')
        r.className = 'sc-row'
        const l = document.createElement('span')
        l.textContent = label
        const keys = document.createElement('span')
        keys.className = 'sc-keys'
        for (const part of k.split('  ·  ')) {
          const kb = document.createElement('kbd')
          kb.textContent = part
          keys.appendChild(kb)
        }
        r.append(l, keys)
        c.appendChild(r)
      }
      body.appendChild(c)
    }
    col('General', GENERAL)
    col(
      'Herramientas',
      TOOLS.filter(t => t.key).map(t => [t.key!.toUpperCase(), t.label] as [string, string])
    )
    p.appendChild(body)
  }
}
