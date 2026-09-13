/*
 * In-browser demo engine.
 *
 * Mirrors the FastAPI backend (same seed shape, same price engine, same
 * weighted matching and anomaly rules) so the app is fully demonstrable with
 * no server — used by the single-file build and whenever the API is
 * unreachable. All data here is FICTIONAL prototype data.
 */

const rngSeed = { s: 26229 }
function rnd() {
  rngSeed.s = (rngSeed.s * 1664525 + 1013904223) % 4294967296
  return rngSeed.s / 4294967296
}
const between = (a, b) => a + rnd() * (b - a)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const round = (n, d = 0) => Number(n.toFixed(d))

export const MATERIALS = [
  { category: 'PCB', icon: '🔌', base: 150, drift: 0.003, subcategory: 'Motherboards, RAM, adapters', hazard: 'Never burn boards — fumes contain lead and brominated compounds.' },
  { category: 'Cable', icon: '🔗', base: 575, drift: 0, subcategory: 'Copper wire, chargers, LAN', hazard: 'Do not burn insulation. Strip mechanically only.' },
  { category: 'Battery', icon: '🔋', base: 130, drift: -0.003, subcategory: 'Li-ion, lead-acid packs', hazard: 'Never puncture, crush or open a battery.' },
  { category: 'LCD/LED panel', icon: '🖥️', base: 75, drift: 0, subcategory: 'Monitor and laptop panels', hazard: 'Older panels contain mercury lamps — do not break.' },
  { category: 'CRT', icon: '📺', base: 55, drift: 0, subcategory: 'TV and monitor tubes', hazard: 'Leaded glass under vacuum. Handle whole.' },
  { category: 'Motor & magnet-bearing', icon: '⚙️', base: 120, drift: 0.0028, subcategory: 'Fan, pump, drive motors', hazard: 'Heavy — lift with both hands, use gloves.' },
  { category: 'Motor & magnet-bearing', icon: '🧲', base: 178, drift: 0.002, subcategory: 'HDD, speaker magnets', hazard: 'Strong magnets pinch fingers and wipe cards.' },
  { category: 'Mixed plastic', icon: '♻️', base: 28, drift: 0, subcategory: 'Casings, housings', hazard: 'Do not melt or burn plastic casings.' },
]

const COLLECTORS = [
  ['Ramesh Kumar', 'collector@demo.com', 'hi', 'Malviya Nagar, Jaipur', 26.8535, 75.8135],
  ['Sunita Devi', 'sunita@demo.com', 'hi', 'Sanganer, Jaipur', 26.818, 75.79],
  ['Imran Shaikh', 'imran@demo.com', 'mr', 'Jhotwara, Jaipur', 26.944, 75.748],
  ['Lakshmi Bai', 'lakshmi@demo.com', 'hi', 'Vaishali Nagar, Jaipur', 26.912, 75.737],
  ['Govind Meena', 'govind@demo.com', 'hi', 'Amer Road, Jaipur', 26.98, 75.85],
  ['Prakash Jadhav', 'prakash@demo.com', 'mr', 'Mansarovar, Jaipur', 26.85, 75.762],
  ['Fatima Bano', 'fatima@demo.com', 'hi', 'Ramganj, Jaipur', 26.922, 75.83],
  ['Deepak Yadav', 'deepak@demo.com', 'hi', 'Jagatpura, Jaipur', 26.818, 75.862],
  ['Sanjay More', 'sanjay@demo.com', 'mr', 'Bais Godam, Jaipur', 26.901, 75.783],
  ['Kavita Sharma', 'kavita@demo.com', 'en', 'C-Scheme, Jaipur', 26.907, 75.793],
]

const RECYCLERS = [
  ['Green Recyclers', 'recycler@demo.com', 'Ajmer Road Industrial Belt, Jaipur', 26.913, 75.783, ['PCB', 'Cable', 'Battery', 'Motor & magnet-bearing', 'LCD/LED panel'], 'AUTH-12345', 'approved', '+91 98290 10001', 1.03, true, 25],
  ['Aravalli E-Waste Pvt Ltd', 'aravalli@demo.com', 'Sitapura Industrial Area, Jaipur', 26.786, 75.848, ['PCB', 'LCD/LED panel', 'CRT', 'Mixed plastic', 'Cable'], 'AUTH-20871', 'approved', '+91 98290 10002', 0.98, true, 30],
  ['Pink City Metals', null, 'Bais Godam, Jaipur', 26.889, 75.772, ['Cable', 'Motor & magnet-bearing'], 'AUTH-30442', 'approved', '+91 98290 10003', 1.01, false, 15],
  ['Jaipur Circular Systems', null, 'Jhotwara Industrial Area, Jaipur', 26.949, 75.735, ['PCB', 'Battery', 'Mixed plastic'], 'AUTH-40113', 'approved', '+91 98290 10004', 0.96, true, 20],
  ['Marudhara Recycling', null, 'Bagru, Jaipur', 26.813, 75.546, ['CRT', 'LCD/LED panel', 'Mixed plastic', 'Motor & magnet-bearing'], 'AUTH-50219', 'approved', '+91 98290 10005', 0.94, false, 35],
  ['Chambal Green Loop', null, 'Kota Road, Jaipur', 26.76, 75.81, ['Battery', 'PCB', 'Cable'], 'AUTH-60777', 'approved', '+91 98290 10006', 1.0, true, 28],
  ['Suraj Metal Recovery', null, 'Sanganer, Jaipur', 26.821, 75.788, ['Cable', 'Motor & magnet-bearing', 'Mixed plastic'], 'AUTH-70884', 'approved', '+91 98290 10007', 0.97, true, 18],
  ['Nirmal Urban Mining', null, 'Kukas, Jaipur', 27.048, 75.912, ['PCB', 'Motor & magnet-bearing', 'LCD/LED panel', 'Battery'], 'AUTH-80990', 'approved', '+91 98290 10008', 1.02, true, 32],
  ['Shakti Waste Solutions', null, 'Chomu, Jaipur', 27.167, 75.722, ['Cable', 'Battery', 'CRT'], 'AUTH-90551', 'pending', '+91 98290 10009', 0.99, true, 25],
  ['Vasundhara Recyclers', null, 'Tonk Road, Jaipur', 26.802, 75.806, ['PCB', 'LCD/LED panel', 'Mixed plastic'], 'AUTH-91662', 'pending', '+91 98290 10010', 1.0, false, 20],
]

const DEMO_PCB = {
  'Green Recyclers': 195,
  'Aravalli E-Waste Pvt Ltd': 186,
  'Jaipur Circular Systems': 178,
  'Chambal Green Loop': 189,
  'Nirmal Urban Mining': 188,
  'Vasundhara Recyclers': 184,
}

export const WEIGHTS = { authorization: 0.4, price: 0.25, distance: 0.15, pickup: 0.1, material: 0.1 }
const CONDITION_FACTOR = { good: 1, mixed: 0.92, damaged: 0.82 }
const SOURCE_FACTOR = { household: 1, commercial: 1.03, industrial: 1.05, scrap_collection: 0.98 }

const DAY = 86400000
const now = () => Date.now()

export const db = {
  users: [],
  collectors: [],
  recyclers: [],
  prices: [],
  lots: [],
  events: [],
  transactions: [],
  handovers: [],
  payments: [],
  session: null,
  lotSeq: 0,
  handoverSeq: 0,
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return round(2 * R * Math.asin(Math.sqrt(a)), 1)
}

function seed() {
  if (db.users.length) return
  const t0 = now()

  db.users.push({ id: 1, email: 'admin@demo.com', role: 'admin', name: 'Platform Admin', language: 'en' })
  let uid = 2
  COLLECTORS.forEach(([name, email, lang, area, lat, lng], i) => {
    db.users.push({ id: uid, email, role: 'collector', name, language: lang })
    db.collectors.push({
      collector_id: i + 1, user_id: uid, display_name: name, language: lang,
      operating_location: area, latitude: lat, longitude: lng,
      created_at: t0 - Math.floor(between(30, 300)) * DAY,
    })
    uid += 1
  })

  const currentRate = {}
  MATERIALS.forEach((m) => { currentRate[m.category] = m.base * (1 + m.drift * 90) })

  RECYCLERS.forEach((r, i) => {
    const [name, email, location, lat, lng, mats, authId, authStatus, contact, mult, pickup, radius] = r
    let userId = null
    if (email) {
      db.users.push({ id: uid, email, role: 'recycler', name, language: 'en' })
      userId = uid
      uid += 1
    }
    const rates = {}
    mats.forEach((m) => { rates[m] = Math.round(currentRate[m] * mult * between(0.97, 1.06)) })
    if (DEMO_PCB[name]) rates.PCB = DEMO_PCB[name]
    db.recyclers.push({
      recycler_id: i + 1, user_id: userId, name, location, latitude: lat, longitude: lng,
      accepted_materials: mats, authorization_id: authId, authorization_status: authStatus,
      contact, offered_rate: rates, pickup_available: pickup, service_area_km: radius,
      rating: round(between(3.9, 4.9), 1), documents_note: 'Demo document set (prototype data)',
    })
  })

  const locations = ['Malviya Nagar, Jaipur', 'Sanganer, Jaipur', 'Ajmer Road Industrial Belt, Jaipur']
  MATERIALS.forEach((m) => {
    for (let day = 90; day >= 0; day -= 1) {
      const date = t0 - day * DAY
      const season = 1 + m.drift * (90 - day)
      locations.forEach((loc) => {
        const buying = round(m.base * season * between(0.92, 1.08), 1)
        db.prices.push({
          material_category: m.category, location: loc, date,
          buying_price: buying, selling_price: round(buying * 1.18, 1),
          unit: 'kg', source: 'seed', recycler_id: null,
        })
      })
    }
  })

  const approved = db.recyclers.filter((r) => r.authorization_status === 'approved')
  const cats = MATERIALS.map((m) => m.category)

  const makeLot = (collector, category, weight, daysAgo, condition = 'good', source = 'household') => {
    db.lotSeq += 1
    const created = t0 - daysAgo * DAY - Math.floor(between(0, 12)) * 3600000
    const rate = currentRate[category]
    const lot = {
      lot_id: `KC-${new Date(created).getFullYear()}-${String(db.lotSeq).padStart(6, '0')}`,
      collector_id: collector.collector_id, collector_name: collector.display_name,
      material_category: category, description: `${category} from ${source.replace('_', ' ')}`,
      photo: '', weight, condition, source_type: source,
      estimated_min: Math.round(rate * 0.94 * weight), estimated_max: Math.round(rate * 1.1 * weight),
      quoted_price: 0,
      ai_prediction: { category, confidence: round(between(0.78, 0.96), 2), model_version: 'heuristic-demo-v1' },
      location: collector.operating_location, latitude: collector.latitude, longitude: collector.longitude,
      recycler_id: null, recycler_name: null, match_score: 0, status: 'PRICE_ESTIMATED',
      created_at: created,
    }
    db.lots.push(lot)
    addEvent(lot.lot_id, 'LOT_CREATED', `${weight} kg ${category}`, collector.display_name, created)
    addEvent(lot.lot_id, 'PRICE_ESTIMATED', `₹${lot.estimated_min} – ₹${lot.estimated_max}`, 'system', created)
    return lot
  }

  const complete = (lot, recycler, { stopAt = 'paid', anomalous = false, mode = 'cash' } = {}) => {
    const rate = recycler.offered_rate[lot.material_category] || currentRate[lot.material_category]
    lot.recycler_id = recycler.recycler_id
    lot.recycler_name = recycler.name
    lot.quoted_price = Math.round(rate * lot.weight)
    lot.match_score = round(between(78, 96), 1)
    lot.status = 'HANDOVER_PENDING'
    const txn = {
      transaction_id: db.transactions.length + 1, lot_id: lot.lot_id,
      collector_id: lot.collector_id, recycler_id: recycler.recycler_id,
      quoted_price: lot.quoted_price, final_price: 0, final_weight: 0,
      collection_location: lot.location, handover_location: '',
      payment_status: 'PENDING', transaction_status: 'RECYCLER_MATCHED',
      anomaly_flag: false, anomaly_reason: '',
      created_at: lot.created_at + 7200000, updated_at: lot.created_at + 7200000,
    }
    db.transactions.push(txn)
    addEvent(lot.lot_id, 'RECYCLER_MATCHED', `${recycler.name} at ₹${rate}/kg`, lot.collector_name, txn.created_at)
    addEvent(lot.lot_id, 'HANDOVER_PENDING', 'Waiting for recycler to scan the lot QR', 'system', txn.created_at)
    if (stopAt === 'pending_handover') return txn

    const handTime = lot.created_at + DAY
    const finalWeight = round(lot.weight * between(0.94, 1.02), 1)
    const finalPrice = Math.round(rate * finalWeight * (anomalous ? 0.55 : 1))
    const flag = checkAnomaly(lot.material_category, finalPrice, finalWeight, lot.weight)
    db.handoverSeq += 1
    const ref = `HR-${new Date(handTime).getFullYear()}-${String(db.handoverSeq).padStart(5, '0')}`
    db.handovers.push({
      handover_id: db.handovers.length + 1, reference_number: ref, lot_id: lot.lot_id,
      transaction_id: txn.transaction_id, photo: '', weight: finalWeight,
      gps_location: `${recycler.latitude.toFixed(4)},${recycler.longitude.toFixed(4)}`,
      recycler_confirmation: true, status: 'VERIFIED', timestamp: handTime,
    })
    Object.assign(txn, {
      final_weight: finalWeight, final_price: finalPrice, handover_location: recycler.location,
      transaction_status: 'HANDED_OVER', anomaly_flag: flag.flagged, anomaly_reason: flag.reason,
      updated_at: handTime,
    })
    lot.status = 'PAYMENT_PENDING'
    addEvent(lot.lot_id, 'RECYCLER_VERIFIED', `QR verified by ${recycler.name}`, recycler.name, handTime)
    addEvent(lot.lot_id, 'HANDED_OVER', `${finalWeight} kg at ₹${finalPrice} · ref ${ref}`, recycler.name, handTime)
    if (flag.flagged) addEvent(lot.lot_id, 'ANOMALY_FLAGGED', flag.reason, 'anomaly-service', handTime)
    if (stopAt === 'pending_payment') {
      addEvent(lot.lot_id, 'PAYMENT_PENDING', 'Awaiting payment confirmation', 'system', handTime)
      return txn
    }
    const payTime = handTime + 5 * 3600000
    db.payments.push({
      payment_id: db.payments.length + 1, transaction_id: txn.transaction_id,
      amount: finalPrice, mode, status: 'PAID', timestamp: payTime,
    })
    txn.payment_status = 'PAID'
    txn.transaction_status = 'COMPLETED'
    txn.updated_at = payTime
    lot.status = 'COMPLETED'
    addEvent(lot.lot_id, 'PAID', `₹${finalPrice} via ${mode.toUpperCase()}`, recycler.name, payTime)
    addEvent(lot.lot_id, 'COMPLETED', 'Traceability record closed', 'system', payTime)
    return txn
  }

  for (let i = 0; i < 30; i += 1) {
    const collector = db.collectors[i % db.collectors.length]
    const category = cats[i % cats.length]
    const lot = makeLot(collector, category, round(between(3, 28), 1), Math.floor(between(3, 75)),
      pick(['good', 'damaged', 'mixed']), pick(['household', 'commercial', 'industrial', 'scrap_collection']))
    const recycler = pick(approved.filter((r) => r.accepted_materials.includes(category)))
    if (i === 7 || i === 19) complete(lot, recycler, { anomalous: true })
    else if (i % 7 === 3) complete(lot, recycler, { stopAt: 'pending_payment' })
    else complete(lot, recycler, { mode: pick(['cash', 'upi']) })
  }
  for (let i = 0; i < 6; i += 1) {
    const collector = db.collectors[(i * 3) % db.collectors.length]
    const category = cats[(i * 2) % cats.length]
    const lot = makeLot(collector, category, round(between(4, 20), 1), Math.floor(between(0, 3)))
    const green = db.recyclers[0]
    const recycler = green.accepted_materials.includes(category)
      ? green
      : pick(approved.filter((r) => r.accepted_materials.includes(category)))
    complete(lot, recycler, { stopAt: 'pending_handover' })
  }
  for (let i = 0; i < 4; i += 1) makeLot(db.collectors[i], cats[i], round(between(5, 15), 1), i)
}

function addEvent(lotId, status, note, actor, at) {
  db.events.push({ lot_id: lotId, status, note, actor: actor || 'system', at: at || now() })
}

/* ---------------------------------------------------------------- pricing */
function rowsFor(category, days, location) {
  const since = now() - days * DAY
  const all = db.prices.filter((p) => p.material_category === category && p.date >= since)
  if (location) {
    const loc = all.filter((p) => p.location === location)
    if (loc.length >= 5) return loc
  }
  return all
}

export function currentRange(category, location) {
  const recent = rowsFor(category, 7, location).length
    ? rowsFor(category, 7, location)
    : rowsFor(category, 45, location)
  if (!recent.length) return { min_price: 0, max_price: 0, avg: 0, trend: 'stable', change_pct: 0 }
  const sorted = recent.map((p) => p.buying_price).sort((a, b) => a - b)
  const lo = Math.round(sorted[Math.floor(sorted.length * 0.1)])
  let hi = Math.round(sorted[Math.floor(sorted.length * 0.9)] ?? sorted[0])
  if (hi <= lo) hi = Math.round(lo * 1.12)
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length
  const older = rowsFor(category, 30, location).filter((p) => p.date < now() - 14 * DAY)
  let changePct = 0
  if (older.length) {
    const oldAvg = older.reduce((a, b) => a + b.buying_price, 0) / older.length
    if (oldAvg) changePct = round(((avg - oldAvg) / oldAvg) * 100, 1)
  }
  const trend = changePct > 2.5 ? 'rising' : changePct < -2.5 ? 'falling' : 'stable'
  return { min_price: lo, max_price: hi, avg: round(avg, 2), trend, change_pct: changePct }
}

export function priceBoard(location) {
  return MATERIALS.map((m) => {
    const s = currentRange(m.category, location)
    return { category: m.category, icon: m.icon, unit: 'kg', ...s }
  })
}

export function priceHistory(category, days = 45) {
  const buckets = {}
  rowsFor(category, days).forEach((p) => {
    const key = new Date(p.date).toISOString().slice(0, 10)
    buckets[key] = buckets[key] || []
    buckets[key].push(p.buying_price)
  })
  return Object.entries(buckets)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, arr]) => ({ date, price: round(arr.reduce((x, y) => x + y, 0) / arr.length, 1) }))
}

export function estimate(category, weight, condition, sourceType, location) {
  const s = currentRange(category, location)
  const factor = (CONDITION_FACTOR[condition] ?? 1) * (SOURCE_FACTOR[sourceType] ?? 1)
  const estMax = Math.round(s.max_price * weight * factor)
  return {
    estimated_min: Math.round(s.min_price * weight * factor),
    estimated_max: estMax,
    rate_min: s.min_price, rate_max: s.max_price, trend: s.trend, change_pct: s.change_pct,
    condition_factor: round(factor, 3),
    informal_estimate: Math.round(estMax * 0.88),
  }
}

/* -------------------------------------------------------------- anomalies */
function checkAnomaly(category, finalPrice, finalWeight, declaredWeight) {
  const reasons = []
  if (finalWeight <= 0) return { flagged: true, reason: 'Final weight is zero or negative.' }
  const values = rowsFor(category, 45).map((p) => p.buying_price)
  const rate = finalPrice / finalWeight
  if (values.length >= 5) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1
    const z = (rate - mean) / sd
    const dev = Math.abs(rate - mean) / mean
    if (z < -2 && dev > 0.15)
      reasons.push(`Price ₹${rate.toFixed(0)}/kg is far below the historical range (avg ₹${mean.toFixed(0)}/kg) for ${category}.`)
    else if (z > 2.5 && dev > 0.15)
      reasons.push(`Price ₹${rate.toFixed(0)}/kg is unusually above the historical range (avg ₹${mean.toFixed(0)}/kg) for ${category}.`)
  }
  if (declaredWeight > 0) {
    const drift = Math.abs(finalWeight - declaredWeight) / declaredWeight
    if (drift > 0.25)
      reasons.push(`Final weight ${finalWeight} kg differs from the declared ${declaredWeight} kg by ${(drift * 100).toFixed(0)}%.`)
  }
  return { flagged: reasons.length > 0, reason: reasons.join(' ') }
}

/* --------------------------------------------------------------- matching */
export function matchRecyclers(lot, limit = 6) {
  const candidates = db.recyclers.filter(
    (r) => r.authorization_status === 'approved' && r.accepted_materials.includes(lot.material_category)
  )
  const bestRate = Math.max(...candidates.map((r) => r.offered_rate[lot.material_category] || 0), 1)
  return candidates
    .map((r) => {
      const rate = r.offered_rate[lot.material_category] || 0
      const distance = haversineKm(lot.latitude, lot.longitude, r.latitude, r.longitude)
      if (rate <= 0 || distance > Math.max(r.service_area_km, 5) * 1.5) return null
      const sPrice = Math.min(rate / bestRate, 1)
      const sDist = Math.max(0, 1 - distance / Math.max(r.service_area_km, 1))
      const sPickup = r.pickup_available ? 1 : 0.35
      const breakdown = {
        authorization: round(WEIGHTS.authorization * 100, 1),
        price: round(WEIGHTS.price * sPrice * 100, 1),
        distance: round(WEIGHTS.distance * sDist * 100, 1),
        pickup: round(WEIGHTS.pickup * sPickup * 100, 1),
        material: round(WEIGHTS.material * 100, 1),
      }
      const score = Object.values(breakdown).reduce((a, b) => a + b, 0)
      return {
        ...r, distance_km: distance, rate_for_material: rate,
        offer_value: Math.round(rate * lot.weight), match_score: round(score, 1), breakdown,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.match_score - a.match_score || b.rate_for_material - a.rate_for_material)
    .slice(0, limit)
}

/* ------------------------------------------------------------ classifier */
/*
 * Demo-mode classifier — mirrors backend/app/ai/classifier.py v2.
 *
 * Same idea: reject photos that are clearly not e-waste (foliage, petals,
 * sky, skin, blank surfaces) instead of confidently calling a leaf a circuit
 * board. Texture, not colour, is the discriminator.
 */
export async function classify(dataUrl, hint) {
  const NOTE =
    'Prototype classifier (rule-based, not a trained model). A suggestion only — ' +
    'confirm or correct it before the lot is priced.'
  if (hint && MATERIALS.some((m) => m.category === hint)) {
    return {
      category: hint, confidence: 0.95, verdict: 'E_WASTE', is_ewaste: true,
      reason: 'Material chosen by the collector.', alternatives: [],
      features: {}, model_version: 'heuristic-demo-v2', note: NOTE,
    }
  }
  const f = await imageFeatures(dataUrl)
  if (!f) {
    return {
      category: null, confidence: 0, verdict: 'UNCERTAIN', is_ewaste: true,
      reason: 'The photo could not be read. Take it again or choose the material manually.',
      alternatives: [], features: {}, model_version: 'heuristic-demo-v2', note: NOTE,
    }
  }
  const rejection = rejectReason(f)
  if (rejection) {
    return {
      category: null, confidence: 0, verdict: 'NOT_E_WASTE', is_ewaste: false, reason: rejection,
      alternatives: [], features: f, model_version: 'heuristic-demo-v2', note: NOTE,
    }
  }
  const ranked = scoreCategories(f)
  const [top, second] = ranked
  const total = ranked.reduce((a, [, v]) => a + v, 0) || 1
  const margin = top[1] ? (top[1] - (second?.[1] ?? 0)) / top[1] : 0
  const confidence = round(Math.min(Math.max(0.34 + 0.62 * margin, 0.2), 0.85), 2)
  const alternatives = ranked.slice(1, 3).map(([category, v]) => ({
    category, confidence: round(v / total, 2),
  }))
  if (confidence < 0.45) {
    return {
      category: null, confidence, verdict: 'UNCERTAIN', is_ewaste: true,
      reason: 'Not confident enough to name the material — please choose it below.',
      alternatives, features: f, model_version: 'heuristic-demo-v2', note: NOTE,
    }
  }
  return {
    category: top[0], confidence, verdict: 'E_WASTE', is_ewaste: true, reason: '',
    alternatives, features: f, model_version: 'heuristic-demo-v2', note: NOTE,
  }
}

const BASE_REJECTION =
  'This image does not appear to be electronic waste. Please upload a photo of ' +
  'the material you want to sell.'

export function rejectReason(f) {
  const smooth = f.strong_edge_frac < 0.05
  const manufactured = f.grey_frac > 0.15
  if (f.vegetation_frac > 0.3 && smooth && !manufactured)
    return `${BASE_REJECTION} (It looks like a plant or leaves.)`
  if (f.petal_frac > 0.2 && f.saturation_mean > 0.45 && smooth && !manufactured)
    return `${BASE_REJECTION} (It looks like a flower.)`
  if (f.sky_frac > 0.4)
    return `${BASE_REJECTION} (It looks like sky or an outdoor scene.)`
  if (f.skin_frac > 0.35 && smooth && !manufactured)
    return `${BASE_REJECTION} (It looks like a person.)`
  if (f.saturation_mean > 0.5 && smooth && !manufactured)
    return `${BASE_REJECTION} (Try a plain surface in good light.)`
  if (f.edge_density < 0.012 && f.value_std < 0.03)
    return `${BASE_REJECTION} (The photo is too blurred or too plain to read — move closer.)`
  return null
}

export function scoreCategories(f) {
  const [r, g, b] = f.mean_rgb
  const { edge_density: edges, strong_edge_frac: strong, saturation_mean: sat,
    value_mean: val, value_std: vstd, grey_frac: grey } = f
  const s = {}
  MATERIALS.forEach((m) => { s[m.category] = 0.06 })

  if (g > r && g > b) s.PCB += strong > 0.1 ? 0.3 : 0.02
  s.PCB += Math.min(strong * 1.4, 0.35)
  if (sat > 0.2 && sat < 0.65 && strong > 0.1) s.PCB += 0.1

  if (val < 0.42) s.Cable += 0.28
  if (strong > 0.12) s.Cable += 0.22
  if (grey > 0.15 && grey < 0.6) s.Cable += 0.12

  if (grey > 0.55 && sat < 0.25) s.Battery += 0.24
  if (val > 0.35 && val < 0.62 && edges > 0.03 && edges < 0.09) s.Battery += 0.2
  if (strong > 0.05 && strong < 0.15) s.Battery += 0.12

  if (b >= r && b >= g) s['LCD/LED panel'] += 0.26
  if (val < 0.45 && edges < 0.06) s['LCD/LED panel'] += 0.2
  if (grey > 0.3 && grey < 0.7) s['LCD/LED panel'] += 0.1

  if (grey > 0.8 && val > 0.62 && edges < 0.06) s.CRT += 0.32
  if (vstd > 0.1) s.CRT += 0.1

  if (grey > 0.8 && sat < 0.1 && val > 0.4 && val < 0.62) s['Motor & magnet-bearing'] += 0.3
  if (vstd < 0.09 && edges < 0.06) s['Motor & magnet-bearing'] += 0.12

  if (val < 0.45 && grey > 0.55) s['Motor & magnet-bearing'] += 0.24
  if (vstd > 0.16 && strong < 0.12) s['Motor & magnet-bearing'] += 0.12

  if (val > 0.68 && edges < 0.035) s['Mixed plastic'] += 0.3
  if (sat < 0.12 && grey > 0.8 && vstd < 0.08) s['Mixed plastic'] += 0.14

  return Object.entries(s).sort((a, b2) => b2[1] - a[1])
}

/** Same statistics as backend/app/ai/features.py, computed on a canvas. */
export function pixelFeatures(data, n) {
  const SIZE = Math.round(Math.sqrt(n))
  const grey = new Float32Array(n)
  let satT = 0, valT = 0, valSq = 0
  let veg = 0, petal = 0, sky = 0, skin = 0, neutral = 0
  let rT = 0, gT = 0, bT = 0
  for (let i = 0; i < n; i += 1) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    rT += r; gT += g; bT += b
    grey[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    const rn = r / 255, gn = g / 255, bn = b / 255
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min
    const v = max
    const sa = max === 0 ? 0 : d / max
    let h = 0
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d) % 6
      else if (max === gn) h = (bn - rn) / d + 2
      else h = (rn - gn) / d + 4
      h *= 60
      if (h < 0) h += 360
    }
    satT += sa; valT += v; valSq += v * v
    if (sa < 0.18) neutral += 1
    if (h >= 65 && h <= 165 && sa > 0.3 && v > 0.18) veg += 1
    if (sa > 0.45 && v > 0.45 && (h <= 60 || h >= 280)) petal += 1
    if (h >= 190 && h <= 255 && sa > 0.15 && sa < 0.75 && v > 0.55) sky += 1
    if (h >= 5 && h <= 45 && sa > 0.15 && sa < 0.62 && v > 0.35 && r > g && g > b) skin += 1
  }
  const valMean = valT / n
  let gradT = 0, strong = 0, inner = 0
  for (let y = 1; y < SIZE - 1; y += 1) {
    for (let x = 1; x < SIZE - 1; x += 1) {
      const i = y * SIZE + x
      const tl = grey[i - SIZE - 1], t = grey[i - SIZE], tr = grey[i - SIZE + 1]
      const ml = grey[i - 1], mr = grey[i + 1]
      const bl = grey[i + SIZE - 1], bo = grey[i + SIZE], br = grey[i + SIZE + 1]
      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl)
      const gy = (bl + 2 * bo + br) - (tl + 2 * t + tr)
      const mag = Math.sqrt(gx * gx + gy * gy) / 4
      gradT += mag
      if (mag > 0.22) strong += 1
      inner += 1
    }
  }
  return {
    edge_density: round(gradT / inner, 4),
    strong_edge_frac: round(strong / inner, 4),
    saturation_mean: round(satT / n, 4),
    value_mean: round(valMean, 4),
    value_std: round(Math.sqrt(Math.max(valSq / n - valMean * valMean, 0)), 4),
    vegetation_frac: round(veg / n, 4),
    petal_frac: round(petal / n, 4),
    sky_frac: round(sky / n, 4),
    skin_frac: round(skin / n, 4),
    grey_frac: round(neutral / n, 4),
    mean_rgb: [Math.round(rT / n), Math.round(gT / n), Math.round(bT / n)],
  }
}

function imageFeatures(dataUrl) {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        const S = 96
        const c = document.createElement('canvas')
        c.width = S; c.height = S
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0, S, S)
        resolve(pixelFeatures(ctx.getImageData(0, 0, S, S).data, S * S))
      }
      img.onerror = () => resolve(null)
      img.src = dataUrl
    } catch { resolve(null) }
  })
}

/* ------------------------------------------------------------- operations */
export function login(email, password) {
  seed()
  const user = db.users.find((u) => u.email === String(email).toLowerCase().trim())
  if (!user || password !== 'password123') {
    const err = new Error('Email or password is incorrect')
    err.status = 401
    throw err
  }
  const profile =
    user.role === 'collector'
      ? db.collectors.find((c) => c.user_id === user.id)
      : user.role === 'recycler'
        ? db.recyclers.find((r) => r.user_id === user.id)
        : null
  db.session = {
    id: user.id, name: user.name, email: user.email, role: user.role, language: user.language,
    profile_id: profile?.collector_id ?? profile?.recycler_id ?? null,
    location: profile?.operating_location ?? profile?.location ?? 'Jaipur',
    latitude: profile?.latitude ?? 26.9124, longitude: profile?.longitude ?? 75.7873,
  }
  return { token: `demo.${user.id}`, user: db.session }
}

export function registerCollector({ name, email, language, operating_location, latitude, longitude }) {
  seed()
  const id = Math.max(...db.users.map((u) => u.id)) + 1
  db.users.push({ id, email: email.toLowerCase(), role: 'collector', name, language })
  const collector = {
    collector_id: db.collectors.length + 1, user_id: id, display_name: name, language,
    operating_location, latitude: latitude || 26.9124, longitude: longitude || 75.7873,
    created_at: now(),
  }
  db.collectors.push(collector)
  return login(email, 'password123')
}

// Fall back to the first seeded profile if the session came from the live
// backend (different id space) — keeps demo fallback usable mid-session.
const currentCollector = () =>
  db.collectors.find((c) => c.user_id === db.session?.id) ||
  db.collectors.find((c) => c.display_name === db.session?.name) ||
  db.collectors[0]
const currentRecycler = () =>
  db.recyclers.find((r) => r.user_id === db.session?.id) ||
  db.recyclers.find((r) => r.name === db.session?.name) ||
  db.recyclers[0]

export function createLot(payload) {
  seed()
  const collector = currentCollector()
  const location = payload.location || collector.operating_location
  const est = estimate(payload.material_category, payload.weight, payload.condition, payload.source_type, location)
  db.lotSeq += 1
  const lot = {
    lot_id: `KC-${new Date().getFullYear()}-${String(db.lotSeq).padStart(6, '0')}`,
    collector_id: collector.collector_id, collector_name: collector.display_name,
    material_category: payload.material_category, description: payload.description || '',
    photo: payload.photo || '', weight: payload.weight, condition: payload.condition,
    source_type: payload.source_type, estimated_min: est.estimated_min, estimated_max: est.estimated_max,
    quoted_price: 0, ai_prediction: payload.ai_prediction || {}, location,
    latitude: payload.latitude || collector.latitude, longitude: payload.longitude || collector.longitude,
    recycler_id: null, recycler_name: null, match_score: 0, status: 'PRICE_ESTIMATED',
    created_at: now(),
  }
  db.lots.push(lot)
  addEvent(lot.lot_id, 'LOT_CREATED', `${lot.weight} kg ${lot.material_category}`, collector.display_name)
  addEvent(lot.lot_id, 'PRICE_ESTIMATED', `₹${lot.estimated_min} – ₹${lot.estimated_max}`)
  return lot
}

export function listLots() {
  seed()
  const role = db.session?.role
  if (role === 'collector') {
    const c = currentCollector()
    return db.lots.filter((l) => l.collector_id === c.collector_id).sort((a, b) => b.created_at - a.created_at)
  }
  if (role === 'recycler') {
    const r = currentRecycler()
    return db.lots.filter((l) => l.recycler_id === r.recycler_id).sort((a, b) => b.created_at - a.created_at)
  }
  return [...db.lots].sort((a, b) => b.created_at - a.created_at)
}

export function getLot(lotId) {
  seed()
  const lot = db.lots.find((l) => l.lot_id === lotId)
  if (!lot) { const e = new Error(`No lot with ID ${lotId}`); e.status = 404; throw e }
  const txn = db.transactions.find((t) => t.lot_id === lotId) || null
  return {
    ...lot,
    transaction: txn,
    timeline: db.events.filter((e) => e.lot_id === lotId).sort((a, b) => a.at - b.at),
  }
}

export function getMatches(lotId) {
  const lot = db.lots.find((l) => l.lot_id === lotId)
  const informal = Math.round(lot.estimated_max * 0.88)
  return {
    lot_id: lotId, weights: WEIGHTS, informal_estimate: informal,
    matches: matchRecyclers(lot).map((m) => ({ ...m, extra_vs_informal: Math.round(m.offer_value - informal) })),
  }
}

export function selectRecycler(lotId, recyclerId) {
  const lot = db.lots.find((l) => l.lot_id === lotId)
  const recycler = db.recyclers.find((r) => r.recycler_id === recyclerId)
  if (!recycler || recycler.authorization_status !== 'approved') {
    const e = new Error('That recycler is not authorised on the platform'); e.status = 400; throw e
  }
  const rate = recycler.offered_rate[lot.material_category] || 0
  const match = matchRecyclers(lot, 20).find((m) => m.recycler_id === recyclerId)
  lot.recycler_id = recyclerId
  lot.recycler_name = recycler.name
  lot.quoted_price = Math.round(rate * lot.weight)
  lot.match_score = match?.match_score ?? 0
  lot.status = 'HANDOVER_PENDING'
  const txn = {
    transaction_id: db.transactions.length + 1, lot_id: lot.lot_id, collector_id: lot.collector_id,
    recycler_id: recyclerId, quoted_price: lot.quoted_price, final_price: 0, final_weight: 0,
    collection_location: lot.location, handover_location: '', payment_status: 'PENDING',
    transaction_status: 'RECYCLER_MATCHED', anomaly_flag: false, anomaly_reason: '',
    created_at: now(), updated_at: now(),
  }
  db.transactions.push(txn)
  addEvent(lot.lot_id, 'RECYCLER_MATCHED', `${recycler.name} at ₹${rate}/kg`, lot.collector_name)
  addEvent(lot.lot_id, 'HANDOVER_PENDING', 'Waiting for recycler to scan the lot QR')
  return { ...lot, qr_payload: `/verify/${lot.lot_id}`, transaction_id: txn.transaction_id }
}

export function verifyLot(lotId) {
  const lot = db.lots.find((l) => l.lot_id === lotId)
  if (!lot) { const e = new Error(`No lot with ID ${lotId}`); e.status = 404; throw e }
  const txn = db.transactions.find((t) => t.lot_id === lotId) || null
  const handover = db.handovers.find((h) => h.lot_id === lotId) || null
  const payment = txn ? db.payments.find((p) => p.transaction_id === txn.transaction_id) || null : null
  return {
    lot, transaction: txn, handover, payment,
    timeline: db.events.filter((e) => e.lot_id === lotId).sort((a, b) => a.at - b.at),
  }
}

export function confirmHandover({ lot_id, final_weight, final_price }) {
  const lot = db.lots.find((l) => l.lot_id === lot_id)
  const txn = db.transactions.find((t) => t.lot_id === lot_id)
  const recycler = db.recyclers.find((r) => r.recycler_id === lot.recycler_id)
  const flag = checkAnomaly(lot.material_category, final_price, final_weight, lot.weight)
  db.handoverSeq += 1
  const ref = `HR-${new Date().getFullYear()}-${String(db.handoverSeq).padStart(5, '0')}`
  db.handovers.push({
    handover_id: db.handovers.length + 1, reference_number: ref, lot_id, transaction_id: txn.transaction_id,
    photo: lot.photo, weight: final_weight,
    gps_location: `${recycler.latitude.toFixed(4)},${recycler.longitude.toFixed(4)}`,
    recycler_confirmation: true, status: 'VERIFIED', timestamp: now(),
  })
  Object.assign(txn, {
    final_weight, final_price, handover_location: recycler.location, transaction_status: 'HANDED_OVER',
    payment_status: 'PENDING', anomaly_flag: flag.flagged, anomaly_reason: flag.reason, updated_at: now(),
  })
  lot.status = 'PAYMENT_PENDING'
  addEvent(lot_id, 'RECYCLER_VERIFIED', `QR verified by ${recycler.name}`, recycler.name)
  addEvent(lot_id, 'HANDED_OVER', `${final_weight} kg at ₹${final_price} · ref ${ref}`, recycler.name)
  addEvent(lot_id, 'PAYMENT_PENDING', 'Awaiting payment confirmation')
  if (flag.flagged) addEvent(lot_id, 'ANOMALY_FLAGGED', flag.reason, 'anomaly-service')
  return {
    reference_number: ref, lot_id, material: lot.material_category, declared_weight: lot.weight,
    final_weight, final_price, quoted_price: txn.quoted_price, recycler: recycler.name,
    collection_location: txn.collection_location, handover_location: txn.handover_location,
    status: 'VERIFIED', transaction_id: txn.transaction_id, anomaly_flag: flag.flagged,
    anomaly_reason: flag.reason, timestamp: now(),
  }
}

export function markPaid({ transaction_id, mode }) {
  const txn = db.transactions.find((t) => t.transaction_id === transaction_id)
  const lot = db.lots.find((l) => l.lot_id === txn.lot_id)
  const recycler = db.recyclers.find((r) => r.recycler_id === txn.recycler_id)
  db.payments.push({
    payment_id: db.payments.length + 1, transaction_id, amount: txn.final_price,
    mode, status: 'PAID', timestamp: now(),
  })
  txn.payment_status = 'PAID'
  txn.transaction_status = 'COMPLETED'
  txn.updated_at = now()
  lot.status = 'COMPLETED'
  addEvent(lot.lot_id, 'PAID', `₹${txn.final_price} via ${mode.toUpperCase()}`, recycler.name)
  addEvent(lot.lot_id, 'COMPLETED', 'Traceability record closed')
  return { transaction_id, amount: txn.final_price, mode, status: 'PAID', lot_id: lot.lot_id }
}

export function earnings() {
  const c = currentCollector()
  const txns = db.transactions.filter((t) => t.collector_id === c.collector_id)
    .sort((a, b) => b.created_at - a.created_at)
  const paid = txns.filter((t) => t.payment_status === 'PAID')
  const pending = txns.filter((t) => t.payment_status !== 'PAID' && ['HANDED_OVER', 'RECYCLER_VERIFIED'].includes(t.transaction_status))
  const d = new Date()
  const thisMonth = paid.filter((t) => {
    const x = new Date(t.updated_at)
    return x.getMonth() === d.getMonth() && x.getFullYear() === d.getFullYear()
  })
  return {
    total_earnings: Math.round(paid.reduce((a, t) => a + t.final_price, 0)),
    this_month: Math.round(thisMonth.reduce((a, t) => a + t.final_price, 0)),
    pending: Math.round(pending.reduce((a, t) => a + (t.final_price || t.quoted_price), 0)),
    total_weight_kg: round(paid.reduce((a, t) => a + t.final_weight, 0), 1),
    transactions: txns.map((t) => {
      const lot = db.lots.find((l) => l.lot_id === t.lot_id)
      return {
        lot_id: t.lot_id, material: lot?.material_category ?? '', weight: t.final_weight || lot?.weight || 0,
        amount: t.final_price || t.quoted_price, payment_status: t.payment_status,
        transaction_status: t.transaction_status, date: t.updated_at || t.created_at,
      }
    }),
  }
}

export function recyclerDashboard() {
  const r = currentRecycler()
  const lots = db.lots.filter((l) => l.recycler_id === r.recycler_id)
  const txns = db.transactions.filter((t) => t.recycler_id === r.recycler_id)
  const completed = txns.filter((t) => t.transaction_status === 'COMPLETED')
  const today = new Date().toDateString()
  return {
    recycler: r,
    cards: {
      active_lots: lots.filter((l) => ['HANDOVER_PENDING', 'RECYCLER_VERIFIED'].includes(l.status)).length,
      today_collection_kg: round(txns.filter((t) => new Date(t.updated_at).toDateString() === today)
        .reduce((a, t) => a + t.final_weight, 0), 1),
      pending_handover: lots.filter((l) => l.status === 'HANDOVER_PENDING').length,
      completed: completed.length,
      total_paid: Math.round(completed.reduce((a, t) => a + t.final_price, 0)),
    },
    incoming: lots.filter((l) => ['HANDOVER_PENDING', 'RECYCLER_VERIFIED'].includes(l.status))
      .sort((a, b) => b.created_at - a.created_at),
    recent: txns.sort((a, b) => b.updated_at - a.updated_at).slice(0, 15).map((t) => ({
      transaction_id: t.transaction_id, lot_id: t.lot_id, final_price: t.final_price,
      final_weight: t.final_weight, payment_status: t.payment_status,
      status: t.transaction_status, at: t.updated_at,
    })),
  }
}

export function decideOnLot(lotId, decision) {
  const lot = db.lots.find((l) => l.lot_id === lotId)
  const rec = currentRecycler()
  const txnIndex = db.transactions.findIndex((t) => t.lot_id === lotId)
  if (decision === 'accept') {
    lot.status = 'RECYCLER_VERIFIED'
    if (txnIndex > -1) {
      db.transactions[txnIndex].transaction_status = 'ACCEPTED'
      db.transactions[txnIndex].updated_at = now()
    }
    addEvent(lotId, 'RECYCLER_VERIFIED', `${rec.name} accepted the lot`, rec.name)
  } else {
    lot.recycler_id = null
    lot.recycler_name = null
    lot.quoted_price = 0
    lot.match_score = 0
    lot.status = 'PRICE_ESTIMATED'
    if (txnIndex > -1) db.transactions.splice(txnIndex, 1)
    addEvent(lotId, 'PRICE_ESTIMATED',
      `${rec.name} could not take this lot — choose another recycler`, rec.name)
  }
  return { lot_id: lotId, decision, status: lot.status }
}

export function updateRecyclerProfile(patch) {
  const r = currentRecycler()
  if (patch.offered_rate) {
    Object.entries(patch.offered_rate).forEach(([cat, rate]) => {
      if (Number(r.offered_rate[cat]) !== Number(rate)) {
        // A rate change writes a new price observation — the dataset is live.
        db.prices.push({
          material_category: cat, location: r.location, date: now(),
          buying_price: Number(rate), selling_price: round(Number(rate) * 1.18, 1),
          unit: 'kg', recycler_id: r.recycler_id, source: 'recycler_update',
        })
      }
    })
  }
  Object.assign(r, patch)
  return r
}

export function listRecyclers({ material, lat, lng } = {}) {
  seed()
  return db.recyclers
    .filter((r) => r.authorization_status === 'approved')
    .filter((r) => !material || r.accepted_materials.includes(material))
    .map((r) => ({
      ...r,
      distance_km: lat != null ? haversineKm(lat, lng, r.latitude, r.longitude) : null,
    }))
    .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
}

export function adminStats() {
  seed()
  const completed = db.transactions.filter((t) => t.transaction_status === 'COMPLETED')
  const totalKg =
    completed.reduce((a, t) => a + t.final_weight, 0) +
    db.lots.filter((l) => l.status !== 'COMPLETED').reduce((a, l) => a + l.weight, 0)
  return {
    collectors: db.collectors.length,
    recyclers: db.recyclers.length,
    authorized_recyclers: db.recyclers.filter((r) => r.authorization_status === 'approved').length,
    pending_recyclers: db.recyclers.filter((r) => r.authorization_status === 'pending').length,
    total_lots: db.lots.length,
    total_kg: round(totalKg, 1),
    total_tons: round(totalKg / 1000, 2),
    formal_transactions: completed.length,
    pending_transactions: db.transactions.filter((t) => t.payment_status !== 'PAID').length,
    total_value: Math.round(completed.reduce((a, t) => a + t.final_price, 0)),
    anomalies: db.transactions.filter((t) => t.anomaly_flag).length,
  }
}

export function adminCharts() {
  seed()
  const mix = {}
  db.lots.forEach((l) => { mix[l.material_category] = (mix[l.material_category] || 0) + l.weight })
  const monthly = {}
  db.transactions.forEach((t) => {
    const d = new Date(t.updated_at || t.created_at)
    const key = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' })
    monthly[key] = monthly[key] || { kg: 0, value: 0, count: 0, sort: d.getFullYear() * 12 + d.getMonth() }
    monthly[key].kg += t.final_weight
    monthly[key].value += t.final_price
    monthly[key].count += 1
  })
  const paid = db.transactions.filter((t) => t.payment_status === 'PAID').length
  const trends = {}
  MATERIALS.forEach((m) => { trends[m.category] = priceHistory(m.category, 45) })
  return {
    material_distribution: Object.entries(mix)
      .map(([category, kg]) => ({ category, kg: round(kg, 1) }))
      .sort((a, b) => b.kg - a.kg),
    monthly: Object.entries(monthly)
      .sort(([, a], [, b]) => a.sort - b.sort)
      .slice(-8)
      .map(([month, v]) => ({ month, kg: round(v.kg, 1), value: Math.round(v.value), count: v.count })),
    payment_status: [
      { name: 'Paid', value: paid },
      { name: 'Pending', value: db.transactions.length - paid },
    ],
    price_trends: trends,
  }
}

export function adminRecyclers() { seed(); return db.recyclers }

export function verifyRecycler(recyclerId, decision) {
  const r = db.recyclers.find((x) => x.recycler_id === recyclerId)
  r.authorization_status = decision
  return r
}

export function adminAnomalies() {
  seed()
  return db.transactions.filter((t) => t.anomaly_flag).map((t) => {
    const lot = db.lots.find((l) => l.lot_id === t.lot_id)
    const rec = db.recyclers.find((r) => r.recycler_id === t.recycler_id)
    return {
      transaction_id: t.transaction_id, lot_id: t.lot_id, material: lot?.material_category,
      final_weight: t.final_weight, final_price: t.final_price,
      rate: t.final_weight ? round(t.final_price / t.final_weight, 1) : 0,
      recycler: rec?.name, reason: t.anomaly_reason, at: t.updated_at,
    }
  })
}

export function adminTransactions() {
  seed()
  return [...db.transactions].sort((a, b) => b.created_at - a.created_at).map((t) => {
    const lot = db.lots.find((l) => l.lot_id === t.lot_id)
    const rec = db.recyclers.find((r) => r.recycler_id === t.recycler_id)
    const col = db.collectors.find((c) => c.collector_id === t.collector_id)
    return {
      ...t, material: lot?.material_category ?? '', collector: col?.display_name ?? '',
      recycler: rec?.name ?? '',
    }
  })
}

export function adminPrices() {
  seed()
  return [...db.prices].sort((a, b) => b.date - a.date).slice(0, 120)
    .map((p, i) => ({ price_id: i + 1, ...p }))
}

export function adminMap() {
  seed()
  return {
    recyclers: db.recyclers.map((r) => ({
      type: 'recycler', name: r.name, lat: r.latitude, lng: r.longitude,
      status: r.authorization_status, location: r.location,
    })),
    lots: db.lots.slice(-60).map((l) => ({
      type: 'lot', name: l.lot_id, lat: l.latitude, lng: l.longitude,
      material: l.material_category, status: l.status,
    })),
  }
}

export function trace(lotId) {
  seed()
  const id = String(lotId).trim().toUpperCase()
  const lot = db.lots.find((l) => l.lot_id === id)
  if (!lot) { const e = new Error(`No lot with ID ${id}`); e.status = 404; throw e }
  const txn = db.transactions.find((t) => t.lot_id === id) || null
  return {
    lot,
    collector: db.collectors.find((c) => c.collector_id === lot.collector_id) || null,
    recycler: db.recyclers.find((r) => r.recycler_id === lot.recycler_id) || null,
    transaction: txn,
    handover: db.handovers.find((h) => h.lot_id === id) || null,
    payment: txn ? db.payments.find((p) => p.transaction_id === txn.transaction_id) || null : null,
    timeline: db.events.filter((e) => e.lot_id === id).sort((a, b) => a.at - b.at),
  }
}

/** Demo-mode equivalent of PATCH /api/auth/me. */
export function updateSessionProfile(patch) {
  if (!db.session) return null
  if (patch.name) db.session.name = patch.name
  if (patch.language) db.session.language = patch.language
  const user = db.users.find((u) => u.id === db.session.id)
  if (user) Object.assign(user, { name: db.session.name, language: db.session.language })
  const col = db.collectors.find((c) => c.user_id === db.session.id)
  if (col) col.display_name = db.session.name
  const rec = db.recyclers.find((r) => r.user_id === db.session.id)
  if (rec) rec.name = db.session.name
  return { ...db.session }
}

/* ---------------------------------------------------------------- offers */
db.offers = db.offers || []
const OPEN_STATUSES = ['LOT_CREATED', 'PRICE_ESTIMATED']

export function openLots() {
  seed()
  const rec = currentRecycler()
  return db.lots
    .filter((l) => OPEN_STATUSES.includes(l.status) && !l.recycler_id)
    .filter((l) => l.material_category === 'Other' || rec.accepted_materials.includes(l.material_category))
    .map((l) => {
      const distance = haversineKm(l.latitude, l.longitude, rec.latitude, rec.longitude)
      const mine = db.offers.find(
        (o) => o.lot_id === l.lot_id && o.recycler_id === rec.recycler_id && o.status === 'PENDING'
      )
      return {
        ...l, distance_km: distance,
        suggested_rate: Number(rec.offered_rate[l.material_category] || 0),
        offer_count: db.offers.filter((o) => o.lot_id === l.lot_id && o.status === 'PENDING').length,
        my_offer: mine ? decorateOffer(mine) : null,
      }
    })
    .filter((l) => l.distance_km <= Math.max(rec.service_area_km, 5) * 1.5)
    .sort((a, b) => b.created_at - a.created_at)
}

function decorateOffer(o) {
  const rec = db.recyclers.find((r) => r.recycler_id === o.recycler_id)
  const lot = db.lots.find((l) => l.lot_id === o.lot_id)
  return {
    ...o,
    recycler_name: rec?.name ?? null,
    recycler_location: rec?.location ?? null,
    authorization_id: rec?.authorization_id ?? null,
    distance_km: lot && rec ? haversineKm(lot.latitude, lot.longitude, rec.latitude, rec.longitude) : null,
  }
}

export function makeOffer(lotId, { rate_per_kg, note = '', pickup_offered = false }) {
  const lot = db.lots.find((l) => l.lot_id === lotId)
  const rec = currentRecycler()
  const amount = Math.round(rate_per_kg * lot.weight)
  let offer = db.offers.find(
    (o) => o.lot_id === lotId && o.recycler_id === rec.recycler_id && o.status === 'PENDING'
  )
  if (offer) {
    Object.assign(offer, { rate_per_kg, amount, note, pickup_offered, updated_at: now() })
    addEvent(lotId, 'OFFER_RECEIVED', `${rec.name} revised to ₹${rate_per_kg}/kg`, rec.name)
  } else {
    offer = {
      offer_id: db.offers.length + 1, lot_id: lotId, recycler_id: rec.recycler_id,
      rate_per_kg, amount, note, pickup_offered, status: 'PENDING',
      created_at: now(), updated_at: now(),
    }
    db.offers.push(offer)
    addEvent(lotId, 'OFFER_RECEIVED', `${rec.name} offered ₹${rate_per_kg}/kg (₹${amount})`, rec.name)
  }
  return decorateOffer(offer)
}

export function offersForLot(lotId) {
  seed()
  if (db.session?.role === 'recycler') {
    const rec = currentRecycler()
    return db.offers.filter((o) => o.lot_id === lotId && o.recycler_id === rec.recycler_id).map(decorateOffer)
  }
  return db.offers.filter((o) => o.lot_id === lotId)
    .sort((a, b) => b.rate_per_kg - a.rate_per_kg).map(decorateOffer)
}

export function myOffers() {
  seed()
  if (db.session?.role === 'recycler') {
    const rec = currentRecycler()
    return db.offers.filter((o) => o.recycler_id === rec.recycler_id).map(decorateOffer)
  }
  const c = currentCollector()
  const ids = db.lots.filter((l) => l.collector_id === c.collector_id).map((l) => l.lot_id)
  return db.offers.filter((o) => ids.includes(o.lot_id) && o.status === 'PENDING').map(decorateOffer)
}

export function acceptOffer(offerId) {
  const offer = db.offers.find((o) => o.offer_id === offerId)
  const lot = db.lots.find((l) => l.lot_id === offer.lot_id)
  const rec = db.recyclers.find((r) => r.recycler_id === offer.recycler_id)
  lot.recycler_id = rec.recycler_id
  lot.recycler_name = rec.name
  lot.quoted_price = offer.amount
  const match = matchRecyclers(lot, 20).find((m) => m.recycler_id === rec.recycler_id)
  lot.match_score = match?.match_score ?? 0
  lot.status = 'HANDOVER_PENDING'
  offer.status = 'ACCEPTED'
  db.offers.filter((o) => o.lot_id === lot.lot_id && o.offer_id !== offerId && o.status === 'PENDING')
    .forEach((o) => { o.status = 'DECLINED' })
  const txn = {
    transaction_id: db.transactions.length + 1, lot_id: lot.lot_id, collector_id: lot.collector_id,
    recycler_id: rec.recycler_id, quoted_price: offer.amount, final_price: 0, final_weight: 0,
    collection_location: lot.location, handover_location: '', payment_status: 'PENDING',
    transaction_status: 'RECYCLER_MATCHED', anomaly_flag: false, anomaly_reason: '',
    created_at: now(), updated_at: now(),
  }
  db.transactions.push(txn)
  addEvent(lot.lot_id, 'OFFER_ACCEPTED', `${rec.name} at ₹${offer.rate_per_kg}/kg`, lot.collector_name)
  addEvent(lot.lot_id, 'RECYCLER_MATCHED', `${rec.name} accepted by collector`, lot.collector_name)
  addEvent(lot.lot_id, 'HANDOVER_PENDING', 'Waiting for recycler to scan the lot QR')
  return { ...lot, qr_payload: `/verify/${lot.lot_id}`, transaction_id: txn.transaction_id,
    accepted_offer: decorateOffer(offer) }
}

export function ensureSeeded() { seed() }
export function setSession(user) { db.session = user }
