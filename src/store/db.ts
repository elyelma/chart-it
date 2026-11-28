/**
 * Tiny IndexedDB key-value store for drawings. Everything stays on the user's
 * device: no account, no server, no limits beyond the browser's own disk quota.
 */
// Internal name from before the product was called Grafito: renaming it would lose everyone's drawings.
const DB_NAME = 'chart-it'
const STORE = 'drawings'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        // Resolve only once the data is really on disk (a quota error aborts the transaction).
        t.oncomplete = () => resolve(req.result)
        t.onabort = () => reject(t.error ?? req.error ?? new Error('IndexedDB abort'))
        t.onerror = () => reject(t.error ?? req.error)
      })
  )
}

export const drawingsDb = {
  get<T>(key: string): Promise<T | undefined> {
    return tx<T | undefined>('readonly', s => s.get(key) as IDBRequest<T | undefined>)
  },
  put(key: string, value: unknown): Promise<IDBValidKey> {
    return tx('readwrite', s => s.put(value, key))
  },
  del(key: string): Promise<undefined> {
    return tx('readwrite', s => s.delete(key))
  },
  /** Every stored entry, for backups. */
  async entries(): Promise<Array<[string, unknown]>> {
    const db = await open()
    return new Promise((resolve, reject) => {
      const out: Array<[string, unknown]> = []
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor()
      req.onsuccess = () => {
        const c = req.result
        if (!c) return resolve(out)
        out.push([String(c.key), c.value])
        c.continue()
      }
      req.onerror = () => reject(req.error)
    })
  }
}

/** Ask the browser not to evict our data under storage pressure. */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.()
}
