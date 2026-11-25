/** Toasts, text/confirm dialog and hover tooltips. */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

export function toast(message: string, kind: 'info' | 'error' = 'info', ms = 4000): void {
  const el = document.createElement('div')
  el.className = `toast ${kind === 'error' ? 'error' : ''}`
  el.textContent = message
  $('toasts').appendChild(el)
  setTimeout(() => el.remove(), ms)
}

interface DialogOpts {
  title: string
  message?: string
  input?: string | null
  ok?: string
  danger?: boolean
}

let closeCurrent: ((v: string | null) => void) | null = null

/** Resolves with the text (or "" for confirm dialogs) or null when cancelled. */
export function dialog(opts: DialogOpts): Promise<string | null> {
  // A new dialog replaces one that is still open: the old one counts as cancelled.
  closeCurrent?.(null)
  const root = $('dialog')
  const text = $<HTMLTextAreaElement>('dialogText')
  const okBtn = $<HTMLButtonElement>('dialogOk')
  const cancelBtn = $<HTMLButtonElement>('dialogCancel')
  $('dialogTitle').textContent = opts.title
  const msg = $('dialogMsg')
  msg.textContent = opts.message ?? ''
  msg.hidden = !opts.message
  const hasInput = opts.input !== undefined && opts.input !== null
  text.hidden = !hasInput
  text.value = hasInput ? (opts.input as string) : ''
  okBtn.textContent = opts.ok ?? 'Aceptar'
  okBtn.className = `btn ${opts.danger ? 'danger' : 'primary'}`
  root.hidden = false
  if (hasInput) text.focus()
  else okBtn.focus()

  return new Promise(resolve => {
    const done = (v: string | null) => {
      closeCurrent = null
      root.hidden = true
      okBtn.onclick = cancelBtn.onclick = root.onmousedown = null
      text.onkeydown = null
      document.removeEventListener('keydown', onKey, true)
      resolve(v)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        done(null)
      }
    }
    okBtn.onclick = () => done(hasInput ? text.value : '')
    cancelBtn.onclick = () => done(null)
    root.onmousedown = e => {
      if (e.target === root) done(null)
    }
    text.onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        done(text.value)
      }
    }
    document.addEventListener('keydown', onKey, true)
    closeCurrent = done
  })
}

/**
 * Icon-only buttons carry their name in data-tip (shown as a tooltip). Mirror
 * it into aria-label so screen readers announce it too, now and for anything
 * rendered later.
 */
function syncLabel(el: HTMLElement): void {
  const tip = el.dataset.tip
  if (!tip) return
  if (!el.hasAttribute('aria-label') || el.dataset.autoLabel) {
    el.setAttribute('aria-label', tip)
    el.dataset.autoLabel = '1'
  }
}

function installAccessibleLabels(): void {
  document.querySelectorAll<HTMLElement>('[data-tip]').forEach(syncLabel)
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'attributes') syncLabel(r.target as HTMLElement)
      r.addedNodes.forEach(n => {
        if (!(n instanceof HTMLElement)) return
        if (n.dataset.tip) syncLabel(n)
        n.querySelectorAll<HTMLElement>('[data-tip]').forEach(syncLabel)
      })
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tip'] })
}

export function installTooltips(): void {
  installAccessibleLabels()
  const tip = document.createElement('div')
  tip.className = 'tip'
  tip.hidden = true
  document.body.appendChild(tip)
  document.addEventListener('mouseover', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]')
    if (!el) {
      tip.hidden = true
      return
    }
    const key = el.dataset.key
    tip.innerHTML = ''
    tip.append(el.dataset.tip ?? '')
    if (key) {
      const k = document.createElement('kbd')
      k.textContent = key.toUpperCase()
      tip.append(k)
    }
    tip.hidden = false
    const r = el.getBoundingClientRect()
    const t = tip.getBoundingClientRect()
    const above = r.top - t.height - 8
    tip.style.top = `${above > 4 ? above : r.bottom + 8}px`
    tip.style.left = `${Math.min(window.innerWidth - t.width - 4, Math.max(4, r.left + r.width / 2 - t.width / 2))}px`
  })
  document.addEventListener('mousedown', () => (tip.hidden = true))
}
