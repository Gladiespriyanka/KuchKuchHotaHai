import { useEffect, useState } from 'react'
import { BadgeCheck, MapPin, Phone, Truck } from 'lucide-react'
import { MATERIAL_NAMES, useI18n } from '../../i18n'
import { catalog } from '../../services/api'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { getCache, putCache } from '../../offline/db'
import { useGeolocation } from '../../hooks/useGeolocation'
import MapView from '../../components/MapView'
import { Loading, Notice } from '../../components/ui'

const CATEGORIES = Object.keys(MATERIAL_NAMES)

/**
 * Browse authorised recyclers without having a lot yet — the ♻️ tile on the
 * home screen. Distances use GPS when the collector allows it, otherwise the
 * registered area.
 */
export default function Recyclers() {
  const { t, tMaterial } = useI18n()
  const user = useCurrentUser()
  const { coords, state: gpsState, request: askGps } = useGeolocation()
  const [material, setMaterial] = useState('')
  const [rows, setRows] = useState(null)
  const [cached, setCached] = useState(false)

  const lat = coords?.latitude ?? user?.latitude ?? 26.9124
  const lng = coords?.longitude ?? user?.longitude ?? 75.7873

  useEffect(() => {
    let alive = true
    getCache('recyclers').then((c) => {
      if (alive && c && !rows) { setRows(c); setCached(true) }
    })
    catalog.recyclers({ lat, lng, material: material || undefined })
      .then((data) => {
        if (!alive) return
        setRows(data)
        setCached(false)
        if (!material) putCache('recyclers', data)
      })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, lat, lng])

  if (!rows) return <Loading />

  const points = [
    { name: 'You', lat, lng, kind: 'me' },
    ...rows.map((r) => ({
      name: r.name, lat: r.latitude, lng: r.longitude, kind: 'recycler', detail: r.location,
    })),
  ]

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">{t('findRecycler')}</h1>

      {cached && <Notice tone="warn">{t('offline')} — showing the last saved list.</Notice>}

      {gpsState !== 'granted' && (
        <button className="btn-ghost w-full justify-center" onClick={askGps}>
          <MapPin size={16} /> {t('gpsEnable')}
        </button>
      )}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={!material} onClick={() => setMaterial('')} label="All" />
        {CATEGORIES.map((c) => (
          <Chip key={c} active={material === c} onClick={() => setMaterial(c)} label={tMaterial(c)} />
        ))}
      </div>

      <MapView points={points} center={[lat, lng]} zoom={10} height={240} />

      <div className="space-y-2">
        {rows.length === 0 && <Notice>{t('noMatches')}</Notice>}
        {rows.map((r) => (
          <div key={r.recycler_id} className="plate p-3">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block font-bold leading-tight">♻️ {r.name}</span>
                <span className="block text-sm text-slate2">{r.location}</span>
              </span>
              {r.distance_km != null && (
                <span className="num whitespace-nowrap text-sm font-bold">
                  {r.distance_km} {t('kmAway')}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="chip bg-brass"><BadgeCheck size={12} /> {t('authorised')}</span>
              <span className={`chip ${r.pickup_available ? 'bg-board text-white' : 'bg-white'}`}>
                <Truck size={12} /> {r.pickup_available ? t('pickupAvailable') : t('noPickup')}
              </span>
              <a className="chip bg-white" href={`tel:${r.contact.replace(/\s/g, '')}`}>
                <Phone size={12} /> <span className="num">{r.contact}</span>
              </a>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-dashed border-ink/15 pt-2 text-sm">
              {Object.entries(r.offered_rate).slice(0, 4).map(([cat, rate]) => (
                <span key={cat} className="num">
                  {cat}: <b>₹{rate}</b>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="pb-2 text-center text-[11px] text-slate2">{t('onlyAuthorised')}</p>
    </div>
  )
}

function Chip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip whitespace-nowrap px-3 py-1.5 ${active ? 'bg-board text-white' : 'bg-white'}`}
    >
      {label}
    </button>
  )
}
