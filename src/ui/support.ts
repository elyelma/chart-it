import { SUPPORT_EVM } from '../config'
import { dialog, toast } from './feedback'

/** The tip address, only if it really looks like one. */
export const supportAddress: string = /^0x[0-9a-fA-F]{40}$/.test(SUPPORT_EVM.trim()) ? SUPPORT_EVM.trim() : ''

/** "Buy me a coffee", crypto style: show the address and copy it. */
export async function openSupport(): Promise<void> {
  if (!supportAddress) return
  const ok = await dialog({
    title: 'Apoya Grafito ☕',
    message:
      'Grafito es gratis y lo seguirá siendo. Si te sirve y quieres invitarme un café, envía USDT o USDC a esta dirección. ' +
      'Usa Arbitrum, Base o Polygon, donde la comisión es de centavos. Es la misma dirección en cualquier red EVM. ¡Gracias!',
    input: supportAddress,
    ok: 'Copiar dirección'
  })
  if (ok === null) return
  if (await copy(supportAddress)) toast('Dirección copiada. ¡Gracias!')
  else toast('No se pudo copiar: selecciona la dirección y cópiala a mano.', 'error')
}

/** Clipboard API first; the old selection trick where it is blocked (embedded views, older Safari). */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const t = document.createElement('textarea')
    t.value = text
    t.setAttribute('readonly', '')
    t.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.appendChild(t)
    t.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    t.remove()
    return ok
  }
}
