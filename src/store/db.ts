/**
 * Tiny IndexedDB key-value store for drawings. Everything stays on the user's
 * device: no account, no server, no limits beyond the browser's own disk quota.
 */
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
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
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
  }
}

/** Ask the browser not to evict our data under storage pressure. */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.()
}
