/**
 * A starred list kept in localStorage. Used for drawing tools and timeframes
 * (and later indicators): starred items are the ones always on screen.
 */
export class Favorites {
  private items: string[]
  private listeners: Array<() => void> = []

  constructor(private key: string, defaults: string[]) {
    let saved: unknown = null
    try {
      saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    } catch {
      /* corrupted: use defaults */
    }
    this.items = Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : [...defaults]
  }

  list(): string[] {
    return [...this.items]
  }

  has(id: string): boolean {
    return this.items.includes(id)
  }

  toggle(id: string): void {
    this.items = this.has(id) ? this.items.filter(x => x !== id) : [...this.items, id]
    this.save()
  }

  add(id: string): void {
    if (!this.has(id)) this.toggle(id)
  }

  remove(id: string): void {
    if (this.has(id)) this.toggle(id)
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn)
  }

  private save(): void {
    localStorage.setItem(this.key, JSON.stringify(this.items))
    for (const fn of this.listeners) fn()
  }
}
