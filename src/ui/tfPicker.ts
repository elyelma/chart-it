import {
  DEFAULT_TF_FAVORITES, longName, parseTimeframe, partsOf, PRESETS, timeframeById, UNIT_ORDER, UNIT_TITLE
} from '../data/timeframes'
import type { Timeframe } from '../data/types'
import { Favorites } from './favorites'
import { icon } from './icons'
import { panelHeader, placeBelow, Popup } from './popup'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const CUSTOM_KEY = 'chartit:tf-custom'

/**
 * Timeframes in the top bar: the starred ones are always visible; the arrow
 * on their left opens every timeframe, plus the ones the person writes
 * (2m, 7H, 2D…).
 */
export class TimeframePicker {
  private favs = new Favorites('chartit:tf-favs', DEFAULT_TF_FAVORITES)
  private custom: string[]
  private group = $('tfGroup')
  private panel = $('tfPicker')
  private body!: HTMLElement
  private input!: HTMLInputElement
  private error!: HTMLElement
  private popup: Popup
  private current: Timeframe

  constructor(initial: Timeframe, private onPick: (tf: Timeframe) => void) {
    this.current = initial
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]')
      this.custom = Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : []
    } catch {
      this.custom = []
    }
    const more = $('tfMore')
    more.innerHTML = icon('chevDown', 18)
    this.popup = new Popup(this.panel, [more], {
      onOpen: () => {
        this.input.value = ''
        this.error.hidden = true
        this.render()
        placeBelow(this.panel, more)
        this.input.focus()
      }
    })
    this.build()
    this.favs.onChange(() => {
      this.renderGroup()
      if (this.popup.isOpen) this.render()
    })
    this.renderGroup()
  }

  setCurrent(tf: Timeframe): void {
    this.current = tf
    this.renderGroup()
    if (this.popup.isOpen) this.render()
  }

  get isOpen(): boolean {
    return this.popup.isOpen
  }

  // ---------------------------------------------------------------- bar --

  private renderGroup(): void {
    const ids = this.favs.list()
    if (!ids.includes(this.current.id)) ids.push(this.current.id)
    const tfs = ids.map(timeframeById).sort((a, b) => a.ms - b.ms)
    this.group.innerHTML = ''
    for (const t of tfs) {
      const b = document.createElement('button')
      b.textContent = t.label
      b.dataset.tf = t.id
      b.dataset.tip = longName(t)
      b.classList.toggle('on', t.id === this.current.id)
      b.classList.toggle('temp', !this.favs.has(t.id))
      b.onclick = () => this.pick(t)
      this.group.appendChild(b)
    }
  }

  private pick(t: Timeframe): void {
    this.popup.close()
    this.current = t
    this.renderGroup()
    this.onPick(t)
  }

  // -------------------------------------------------------------- panel --

  private build(): void {
    this.panel.append(panelHeader('Temporalidades', () => this.popup.close()))
    const form = document.createElement('form')
    form.className = 'tf-add'
    this.input = document.createElement('input')
    this.input.placeholder = 'Crea la tuya: 2m, 7H, 2D, 1S…'
    this.input.spellcheck = false
    this.input.autocomplete = 'off'
    const add = document.createElement('button')
    add.type = 'submit'
    add.className = 'btn primary'
    add.innerHTML = `${icon('plus', 16)}<span>Añadir</span>`
    form.append(this.input, add)
    this.error = document.createElement('div')
    this.error.className = 'tf-error'
    this.error.hidden = true
    form.onsubmit = e => {
      e.preventDefault()
      this.addCustom()
    }
    this.input.oninput = () => (this.error.hidden = true)
    const hint = document.createElement('div')
    hint.className = 'panel-hint'
    hint.innerHTML = `m = minutos · H = horas · D = días · S = semanas · M = meses. Toca ${icon('star', 13)} para dejarla siempre visible arriba.`
    this.body = document.createElement('div')
    this.body.className = 'panel-body'
    this.panel.append(form, this.error, hint, this.body)
  }

  private addCustom(): void {
    const res = parseTimeframe(this.input.value)
    if ('error' in res) {
      this.error.textContent = res.error
      this.error.hidden = false
      return
    }
    if (!PRESETS.includes(res.id) && !this.custom.includes(res.id)) {
      this.custom.push(res.id)
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(this.custom))
    }
    this.favs.add(res.id)
    this.pick(res)
  }

  private removeCustom(id: string): void {
    this.custom = this.custom.filter(x => x !== id)
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(this.custom))
    this.favs.remove(id)
    this.render()
  }

  private render(): void {
    this.body.innerHTML = ''
    const all = [...new Set([...PRESETS, ...this.custom])].map(timeframeById)
    for (const unit of UNIT_ORDER) {
      const list = all.filter(t => partsOf(t).unit === unit).sort((a, b) => a.ms - b.ms)
      if (!list.length) continue
      const h = document.createElement('h4')
      h.textContent = UNIT_TITLE[unit]
      this.body.appendChild(h)
      const grid = document.createElement('div')
      grid.className = 'tf-grid'
      for (const t of list) grid.appendChild(this.row(t))
      this.body.appendChild(grid)
    }
  }

  private row(t: Timeframe): HTMLElement {
    const row = document.createElement('div')
    row.className = 'tf-row' + (t.id === this.current.id ? ' on' : '')
    const name = document.createElement('button')
    name.className = 'tf-name'
    name.innerHTML = `<b>${t.label}</b><span>${longName(t)}</span>`
    name.onclick = () => this.pick(t)
    const fav = this.favs.has(t.id)
    const star = document.createElement('button')
    star.className = 'star-btn' + (fav ? ' on' : '')
    star.innerHTML = icon('star', 16)
    star.dataset.tip = fav ? 'Quitar de la barra' : 'Dejar siempre visible'
    star.onclick = () => this.favs.toggle(t.id)
    row.append(name, star)
    if (this.custom.includes(t.id)) {
      const del = document.createElement('button')
      del.className = 'star-btn del'
      del.innerHTML = icon('close', 14)
      del.dataset.tip = 'Borrar esta temporalidad'
      del.onclick = () => this.removeCustom(t.id)
      row.appendChild(del)
    }
    return row
  }
}
