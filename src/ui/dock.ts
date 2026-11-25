import type { Overlay } from 'klinecharts'
import type { DrawingManager, Look } from '../chart/drawings'
import { DEFAULT_TOOL_FAVORITES, TEXT_TOOLS, TOOL_GROUPS, TOOLS, toolByName, type ToolDef } from '../chart/overlays'
import { DRAW_COLORS } from '../chart/theme'
import { Favorites } from './favorites'
import { dialog } from './feedback'
import { icon } from './icons'
import { closeButton, panelHeader, placeBelow, Popup } from './popup'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const GROUPS_KEY = 'chartit:palette-groups'

function vsep(): HTMLElement {
  const s = document.createElement('div')
  s.className = 'vsep'
  return s
}

/**
 * Bottom toolbar: on the left the "Dibujar" button, the cursor and the
 * starred tools; on the right magnet / undo / redo / hide / delete.
 * Plus the drawing palette (all tools by category) and the style bar of the
 * selected drawing.
 */
export class Dock {
  private tool = 'cursor'
  private favs = new Favorites('chartit:tool-favs', DEFAULT_TOOL_FAVORITES)
  private strip = $('tbTools')
  private actions = $('tbActions')
  private props = $('props')
  private palette = $('drawPalette')
  private paletteBody!: HTMLElement
  private paletteSearch!: HTMLInputElement
  private drawBtn!: HTMLButtonElement
  private popup!: Popup
  private countEl!: HTMLElement
  private hideBtn!: HTMLButtonElement
  private openGroups: Set<string>
  private propsDismissed = false

  constructor(private dm: DrawingManager) {
    let saved: unknown = null
    try {
      saved = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? 'null')
    } catch {
      /* defaults */
    }
    this.openGroups = new Set(Array.isArray(saved) ? (saved as string[]) : ['lines'])
    this.buildStrip()
    this.buildActions()
    this.buildPalette()
    this.favs.onChange(() => {
      this.renderStrip()
      this.renderPalette()
    })
  }

  get currentTool(): string {
    return this.tool
  }

  get paletteOpen(): boolean {
    return this.popup.isOpen
  }

  select(name: string): void {
    this.tool = name
    this.propsDismissed = false
    if (name === 'cursor') this.dm.cancelDrawing()
    else this.dm.startTool(name)
    this.renderStrip()
    if (this.popup.isOpen) this.renderPalette()
    if (!this.dm.selected) this.showProps(null, null)
  }

  setCount(n: number): void {
    this.countEl.innerHTML = `<b>${n.toLocaleString('es')}</b> dibujos · sin límite`
    this.hideBtn.innerHTML = icon(this.dm.allHidden() ? 'eyeOff' : 'eye', 20)
    this.hideBtn.classList.toggle('on', this.dm.allHidden())
  }

  // ------------------------------------------------------------ style bar --

  /** Selected drawing → its properties; no selection but a tool active → style of the next drawing. */
  showProps(o: Overlay | null, look: Look | null): void {
    if (o) this.propsDismissed = false
    if (!o && this.tool !== 'cursor') look = this.dm.look
    if (!look || this.propsDismissed) {
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
    if (!o) {
      const hint = document.createElement('span')
      hint.className = 'label'
      hint.textContent = 'Próximo dibujo'
      add(hint)
    }
    for (const c of DRAW_COLORS) {
      const b = document.createElement('button')
      b.className = 'swatch' + (c.toLowerCase() === look.color.toLowerCase() ? ' on' : '')
      b.style.background = c
      b.dataset.tip = 'Color'
      b.onclick = () => this.dm.restyleSelected({ color: c })
      add(b)
    }
    sep()
    for (const w of [1, 2, 3, 4]) {
      const b = this.pbtn(`<span class="weight" style="height:${w + 1}px"></span>`, `Grosor ${w}`, look.size === w)
      b.onclick = () => this.dm.restyleSelected({ size: w })
      add(b)
    }
    const dash = this.pbtn(icon('dash', 20), 'Línea punteada', look.dashed)
    dash.onclick = () => this.dm.restyleSelected({ dashed: !look.dashed })
    add(dash)
    if (o) {
      sep()
      if (TEXT_TOOLS.has(o.name)) {
        const ed = this.pbtn(icon('edit', 20), 'Editar texto', false)
        ed.onclick = () => void this.dm.editSelectedText()
        add(ed)
      }
      const lock = this.pbtn(icon(o.lock ? 'lock' : 'unlock', 20), o.lock ? 'Desbloquear' : 'Bloquear', o.lock)
      lock.onclick = () => this.dm.toggleLockSelected()
      add(lock)
      const del = this.pbtn(icon('trash', 20), 'Borrar (Supr)', false)
      del.classList.add('danger')
      del.onclick = () => this.dm.removeSelected()
      add(del)
    }
    sep()
    add(
      closeButton(() => {
        this.propsDismissed = true
        this.props.hidden = true
      }, 'Ocultar esta barra')
    )
  }

  private pbtn(html: string, tip: string, on: boolean): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'pbtn' + (on ? ' on' : '')
    b.innerHTML = html
    b.dataset.tip = tip
    return b
  }

  // ---------------------------------------------------------- left strip --

  private toolButton(t: ToolDef): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'tool'
    b.innerHTML = icon(t.name, 20)
    b.dataset.tool = t.name
    b.dataset.tip = t.label
    if (t.key) b.dataset.key = t.key
    b.onclick = () => this.select(this.tool === t.name && t.name !== 'cursor' ? 'cursor' : t.name)
    return b
  }

  private buildStrip(): void {
    this.drawBtn = $<HTMLButtonElement>('drawBtn')
    this.drawBtn.innerHTML = `${icon('draw', 18)}<span>Dibujos</span>`
    this.renderStrip()
  }

  private renderStrip(): void {
    this.strip.innerHTML = ''
    const cursor = toolByName('cursor') as ToolDef
    const list = this.favs.list().map(toolByName).filter((t): t is ToolDef => !!t)
    this.strip.appendChild(this.toolButton(cursor))
    this.strip.appendChild(vsep())
    for (const t of list) this.strip.appendChild(this.toolButton(t))
    // The tool in use is shown even if it is not starred.
    if (this.tool !== 'cursor' && !this.favs.has(this.tool)) {
      const t = toolByName(this.tool)
      if (t) {
        const b = this.toolButton(t)
        b.classList.add('temp')
        this.strip.appendChild(b)
      }
    }
    this.strip.querySelectorAll<HTMLElement>('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === this.tool))
  }

  // ------------------------------------------------------------- actions --

  private actionBtn(name: string, tip: string, key?: string): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'tool'
    b.innerHTML = icon(name, 20)
    b.dataset.tip = tip
    if (key) b.dataset.key = key
    this.actions.appendChild(b)
    return b
  }

  private buildActions(): void {
    this.countEl = document.createElement('div')
    this.countEl.className = 'count'
    this.actions.appendChild(this.countEl)
    this.actions.appendChild(vsep())

    const magnet = this.actionBtn('magnet', 'Imán: pega los puntos a las velas')
    magnet.classList.add('toggle')
    magnet.onclick = () => {
      this.dm.setMagnet(!this.dm.magnet)
      magnet.classList.toggle('on', this.dm.magnet)
    }
    const stay = this.actionBtn('stay', 'Seguir dibujando con la misma herramienta')
    stay.classList.add('toggle')
    stay.onclick = () => {
      this.dm.stayInTool = !this.dm.stayInTool
      stay.classList.toggle('on', this.dm.stayInTool)
    }
    this.hideBtn = this.actionBtn('eye', 'Ocultar / mostrar todos los dibujos')
    this.hideBtn.classList.add('toggle')
    this.hideBtn.onclick = () => this.dm.setAllVisible(this.dm.allHidden())
    this.actions.appendChild(vsep())
    this.actionBtn('undo', 'Deshacer', 'Ctrl+Z').onclick = () => this.dm.undo()
    this.actionBtn('redo', 'Rehacer', 'Ctrl+Y').onclick = () => this.dm.redo()
    this.actions.appendChild(vsep())
    const trash = this.actionBtn('trash', 'Borrar todos los dibujos de este símbolo')
    trash.classList.add('danger')
    trash.onclick = async () => {
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
    this.setCount(0)
  }

  // ------------------------------------------------------------- palette --

  private buildPalette(): void {
    this.paletteSearch = document.createElement('input')
    this.paletteSearch.type = 'search'
    this.paletteSearch.placeholder = 'Buscar herramienta…'
    this.paletteSearch.className = 'panel-search'
    this.paletteSearch.oninput = () => this.renderPalette()
    this.paletteSearch.onkeydown = e => {
      if (e.key === 'Enter') {
        const first = this.paletteBody.querySelector<HTMLElement>('.prow')
        first?.click()
      }
    }
    this.popup = new Popup(this.palette, [this.drawBtn], {
      onOpen: () => {
        this.paletteSearch.value = ''
        this.renderPalette()
        placeBelow(this.palette, this.drawBtn)
        this.paletteSearch.focus()
      }
    })
    this.palette.append(panelHeader('Herramientas de dibujo', () => this.popup.close()))
    const searchWrap = document.createElement('div')
    searchWrap.className = 'panel-search-wrap'
    searchWrap.innerHTML = icon('search', 16)
    searchWrap.appendChild(this.paletteSearch)
    const hint = document.createElement('div')
    hint.className = 'panel-hint'
    hint.innerHTML = `Toca ${icon('star', 13)} para tenerla siempre en la barra de abajo.`
    this.paletteBody = document.createElement('div')
    this.paletteBody.className = 'panel-body'
    this.palette.append(searchWrap, hint, this.paletteBody)
  }

  private renderPalette(): void {
    const q = this.paletteSearch.value.trim().toLowerCase()
    const body = this.paletteBody
    body.innerHTML = ''
    for (const g of TOOL_GROUPS) {
      const tools = TOOLS.filter(t => t.group === g.id && (!q || t.label.toLowerCase().includes(q)))
      if (tools.length === 0) continue
      const open = q !== '' || this.openGroups.has(g.id)
      const head = document.createElement('button')
      head.className = 'pgroup' + (open ? ' open' : '')
      const starred = tools.filter(t => this.favs.has(t.name)).length
      head.innerHTML = `${icon('caret', 14)}<span>${g.label}</span><small>${starred ? `${starred} ★` : ''}</small>`
      head.onclick = () => {
        if (this.openGroups.has(g.id)) this.openGroups.delete(g.id)
        else this.openGroups.add(g.id)
        localStorage.setItem(GROUPS_KEY, JSON.stringify([...this.openGroups]))
        this.renderPalette()
      }
      body.appendChild(head)
      if (!open) continue
      for (const t of tools) body.appendChild(this.paletteRow(t))
    }
    if (!body.childElementCount) {
      const none = document.createElement('div')
      none.className = 'panel-empty'
      none.textContent = 'Ninguna herramienta se llama así.'
      body.appendChild(none)
    }
  }

  private paletteRow(t: ToolDef): HTMLElement {
    const row = document.createElement('div')
    row.className = 'prow' + (this.tool === t.name ? ' on' : '')
    row.tabIndex = 0
    row.innerHTML = `${icon(t.name, 18)}<span class="prow-label">${t.label}</span>${t.key ? `<kbd>${t.key.toUpperCase()}</kbd>` : ''}`
    const star = document.createElement('button')
    const fav = this.favs.has(t.name)
    star.className = 'star-btn' + (fav ? ' on' : '')
    star.innerHTML = icon('star', 15)
    star.dataset.tip = fav ? 'Quitar de la barra' : 'Tener siempre en la barra'
    star.onclick = e => {
      e.stopPropagation()
      this.favs.toggle(t.name)
    }
    row.appendChild(star)
    row.onclick = () => {
      this.popup.close()
      this.select(t.name)
    }
    row.onkeydown = e => {
      if (e.key === 'Enter') row.click()
    }
    return row
  }
}
