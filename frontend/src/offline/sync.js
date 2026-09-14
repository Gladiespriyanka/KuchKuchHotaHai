import { lots as lotsApi } from '../services/api'
import { markSynced, pendingDrafts } from './db'

/** Push every offline draft to the backend, then mark them synced. */
export async function syncDrafts() {
  const drafts = await pendingDrafts()
  if (!drafts.length) return { synced: 0 }
  const payload = drafts.map((d) => ({
    material_category: d.material_category,
    weight: Number(d.weight),
    condition: d.condition,
    source_type: d.source_type,
    description: d.description || '',
    photo: d.photo || '',
    location: d.location || '',
    latitude: d.latitude || 0,
    longitude: d.longitude || 0,
    ai_prediction: d.ai_prediction || {},
    client_ref: d.client_ref,
  }))
  const result = await lotsApi.syncMany(payload)
  await markSynced(drafts.map((d) => d.id))
  return { synced: result.synced ?? drafts.length, lots: result.lots ?? [] }
}
