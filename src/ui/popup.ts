import { icon } from './icons'

/**
 * Everything that opens behaves the same way: its button opens it and the
 * same button closes it, it has a visible X, Esc closes it, and a click
 * anywhere else closes it. Only one is open at a time.
 */

const all = new Set<Popup>()

export class Popup {
  private openNow = false

  constructor(
    readonly el: HTMLElement,
    private triggers: HTMLElement[],
    private hooks: { onOpen?: () => void; onClose?: () => void; keepOthers?: boolean } = {}
  ) {
    all.add(this)
    for (const t of triggers) t.addEventListener('click', () => this.toggle())
  }

  get isOpen(): boolean {
    return this.openNow
  }

  open(): void {
    if (this.openNow) return
    if (!this.hooks.keepOthers) for (const p of all) if (p !== this && !p.hooks.keepOthers) p.close()
    this.openNow = true
    this.el.hidden = false
    for (const t of this.triggers) t.classList.add('on')
    this.hooks.onOpen?.()
  }

  close(): void {
    if (!this.openNow) return
    this.openNow = false
    this.el.hidden = true
    for (const t of this.triggers) t.classList.remove('on')
    this.hooks.onClose?.()
  }

  toggle(): void {
    if (this.openNow) this.close()
    else this.open()
  }

  /** True if the click happened on the popup itself or on one of its buttons. */
  owns(target: Node): boolean {
    return this.el.contains(target) || this.triggers.some(t => t.contains(target))
  }
}

/** Closes the most recently opened popup. Returns false if none was open. */
export function closeTopPopup(): boolean {
  const open = [...all].filter(p => p.isOpen && !p.el.dataset.sticky)
  const last = open[open.length - 1]
  last?.close()
  return !!last
}

document.addEventListener(
  'mousedown',
  e => {
    const target = e.target as Node
    // Clicks inside a modal dialog (e.g. confirm) do not close what is behind it.
    if ((target as HTMLElement).closest?.('.modal-backdrop')) return
    for (const p of all) if (p.isOpen && !p.el.dataset.sticky && !p.owns(target)) p.close()
  },
  true
)

/** The visible ✕ every panel carries. */
export function closeButton(onClick: () => void, tip = 'Cerrar (Esc)'): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'x-btn'
  b.innerHTML = icon('close', 18)
  b.dataset.tip = tip
  b.setAttribute('aria-label', 'Cerrar')
  b.onclick = e => {
    e.stopPropagation()
    onClick()
  }
  return b
}

/** Panel header: title on the left, extra controls, ✕ on the right. */
export function panelHeader(title: string, onClose: () => void, ...extra: HTMLElement[]): HTMLElement {
  const h = document.createElement('div')
  h.className = 'panel-head'
  const t = document.createElement('span')
  t.className = 'panel-title'
  t.textContent = title
  h.append(t, ...extra, closeButton(onClose))
  return h
}

/** Puts a floating panel right under the button that opened it. */
export function placeBelow(panel: HTMLElement, anchor: HTMLElement): void {
  const r = anchor.getBoundingClientRect()
  panel.style.top = `${r.bottom + 6}px`
  panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8))}px`
}
