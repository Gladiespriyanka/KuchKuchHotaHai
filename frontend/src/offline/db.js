/*
 * Offline storage (IndexedDB via Dexie).
 *
 *  drafts  — lots created with no connection; they carry a client_ref so the
 *            backend can de-duplicate on sync.
 *  cache   — last-seen price board and recycler list, so both screens open
 *            offline instead of showing an error.
 */
import Dexie from 'dexie'

export const kcdb = new Dexie('kabadiwala-connect')
kcdb.version(1).stores({
  drafts: '++id, client_ref, created_at, synced',
  cache: 'key',
})

let usable = true
kcdb.open().catch(() => { usable = false })

export async function saveDraft(lot) {
  if (!usable) return null
  const client_ref = lot.client_ref || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    await kcdb.drafts.add({ ...lot, client_ref, created_at: Date.now(), synced: 0 })
  } catch { return null }
  return client_ref
}

export async function pendingDrafts() {
  if (!usable) return []
  try { return await kcdb.drafts.where('synced').equals(0).toArray() } catch { return [] }
}

export async function markSynced(ids) {
  if (!usable) return
  try { await kcdb.drafts.where('id').anyOf(ids).modify({ synced: 1 }) } catch { /* ignore */ }
}

export async function putCache(key, value) {
  if (!usable) return
  try { await kcdb.cache.put({ key, value, at: Date.now() }) } catch { /* quota */ }
}

export async function getCache(key) {
  if (!usable) return null
  try { return (await kcdb.cache.get(key))?.value ?? null } catch { return null }
}
