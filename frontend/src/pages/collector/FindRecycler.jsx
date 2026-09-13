import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BadgeCheck, MapPin, Star, Truck } from 'lucide-react'
import { useI18n } from '../../i18n'
import { lots as lotsApi } from '../../services/api'
import MapView from '../../components/MapView'
import { Loading, Notice, rupee } from '../../components/ui'

export default function FindRecycler() {
  const { lotId } = useParams()
  const { t, tMaterial } = useI18n()
  const navigate = useNavigate()
  const [lot, setLot] = useState(null)
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [openScore, setOpenScore] = useState(null)

  useEffect(() => {
    Promise.all([lotsApi.get(lotId), lotsApi.matches(lotId)])
      .then(([l, m]) => { setLot(l); setData(m) })
      .catch((e) => setError(e.message))
  }, [lotId])

  async function choose(recyclerId) {
    setBusy(true)
    try {
      await lotsApi.selectRecycler(lotId, recyclerId)
      navigate(`/app/lots/${lotId}`)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  if (error) return <Notice tone="warn">{error}</Notice>
  if (!data || !lot) return <Loading />

  const [best, ...rest] = data.matches
  if (!best) return <Notice tone="warn">{t('noMatches')}</Notice>
  const outOfArea = best.out_of_service_area

  const points = [
    { name: 'You', lat: lot.latitude, lng: lot.longitude, kind: 'me', detail: lot.location },
    ...data.matches.map((m) => ({
      name: m.name, lat: m.latitude, lng: m.longitude, kind: 'recycler',
      detail: `₹${m.rate_for_material}/kg · ${m.distance_km} km`,
    })),
  ]

  return (
    <div className="space-y-4">
      <div>
        <div className="eyebrow">{t('lotId')}</div>
        <div className="num text-lg font-bold">{lot.lot_id}</div>
        <div className="text-sm text-slate2">
          {tMaterial(lot.material_category)} · <span className="num">{lot.weight} kg</span>
        </div>
      </div>

      {/* Nothing was inside a service area — say so plainly. */}
      {outOfArea && <Notice tone="warn">{t('outOfServiceArea')}</Notice>}

      {/* Best match */}
      <div className="border-[3px] border-ink bg-white shadow-plate">
        <div className="flex items-center gap-2 bg-board px-3 py-1.5 text-white">
          <Star size={15} fill="#E0A526" stroke="#E0A526" />
          <span className="font-display tracking-wide">{t('bestMatch')}</span>
          <span className="num ml-auto text-brass font-bold">{best.match_score}% {t('match')}</span>
        </div>
        <div className="p-4">
          <div className="font-display text-2xl leading-tight">♻️ {best.name}</div>
          <div className="mt-0.5 text-sm text-slate2">{best.location}</div>
          <div className="num mt-3 text-4xl font-bold text-board">₹{best.rate_for_material}
            <span className="text-base font-semibold text-slate2">/{t('perKg')}</span>
          </div>
          <div className="mt-1 text-sm">
            {t('offerFor')}: <span className="num text-lg font-bold">{rupee(best.offer_value)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="chip bg-white">
              <MapPin size={12} />
              {best.distance_km == null ? t('sameCity') : `${best.distance_km} ${t('kmAway')}`}
            </span>
            <span className={`chip ${best.pickup_available ? 'bg-board text-white' : 'bg-white'}`}>
              <Truck size={12} /> {best.pickup_available ? t('pickupAvailable') : t('noPickup')}
            </span>
            <span className="chip bg-brass"><BadgeCheck size={12} /> {t('authorised')}</span>
          </div>

          <button className="btn-primary mt-4 w-full text-lg" disabled={busy}
                  onClick={() => choose(best.recycler_id)}>
            {t('chooseThis')}
          </button>
          <ScoreBreakdown item={best} open={openScore === best.recycler_id}
                          onToggle={() => setOpenScore(openScore === best.recycler_id ? null : best.recycler_id)} />
        </div>
      </div>

      {/* Economic incentive */}
      <div className="plate-lg bg-brass/20 p-4">
        <div className="font-display text-xl">🟢 {t('earnMore')}</div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="eyebrow">{t('informalOffer')}</div>
            <div className="num text-xl font-bold text-slate2 line-through">{rupee(data.informal_estimate)}</div>
          </div>
          <div>
            <div className="eyebrow">{t('formalOffer')}</div>
            <div className="num text-xl font-bold text-board">{rupee(best.offer_value)}</div>
          </div>
        </div>
        <div className="mt-3 border-t-2 border-ink/20 pt-2 text-sm font-bold">
          {t('extraValue')}: <span className="num text-lg text-board">+{rupee(best.extra_vs_informal)}</span>
        </div>
        <p className="mt-2 text-[11px] text-slate2">
          Demo comparison. The informal figure assumes the typical margin taken in the informal chain
          (about 12% below the formal rate) — it is an estimate, not a recorded offer.
        </p>
      </div>

      <MapView points={points} center={[lot.latitude, lot.longitude]} zoom={11} height={260} />

      <div>
        <div className="eyebrow mb-2">{t('otherOptions')}</div>
        <div className="space-y-2">
          {rest.map((m) => (
            <div key={m.recycler_id} className="plate p-3">
              <div className="flex items-baseline gap-2">
                <span className="font-bold">{m.name}</span>
                <span className="num ml-auto text-sm font-bold">{m.match_score}%</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate2">
                <span className="num font-bold text-board">₹{m.rate_for_material}/{t('perKg')}</span>
                <span className="num">{m.distance_km} km</span>
                <span>{m.pickup_available ? '🚚' : '—'}</span>
                <span className="num ml-auto font-bold text-ink">{rupee(m.offer_value)}</span>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn-ghost flex-1 justify-center py-2" disabled={busy}
                        onClick={() => choose(m.recycler_id)}>
                  {t('chooseThis')}
                </button>
                <button className="btn-ghost px-3 py-2"
                        onClick={() => setOpenScore(openScore === m.recycler_id ? null : m.recycler_id)}>
                  %
                </button>
              </div>
              <ScoreBreakdown item={m} open={openScore === m.recycler_id} />
            </div>
          ))}
        </div>
      </div>

      <p className="pb-2 text-center text-[11px] text-slate2">{t('onlyAuthorised')}</p>
    </div>
  )
}

function ScoreBreakdown({ item, open, onToggle }) {
  const { t } = useI18n()
  if (!open) {
    return onToggle ? (
      <button className="mt-2 w-full text-xs font-semibold underline" onClick={onToggle}>
        {t('whyThisScore')}
      </button>
    ) : null
  }
  const rows = [
    ['authorization', 40],
    ['price', 25],
    ['distance', 15],
    ['pickup', 10],
    ['material', 10],
  ]
  return (
    <div className="mt-3 border-2 border-ink bg-mint p-2.5">
      <div className="eyebrow mb-1">{t('whyThisScore')}</div>
      {rows.map(([key, max]) => (
        <div key={key} className="mb-1 flex items-center gap-2 text-xs">
          <span className="w-24 capitalize">{key}</span>
          <span className="h-2.5 flex-1 border border-ink bg-white">
            <span className="block h-full bg-board" style={{ width: `${(item.breakdown[key] / max) * 100}%` }} />
          </span>
          <span className="num w-14 text-right">{item.breakdown[key]}/{max}</span>
        </div>
      ))}
    </div>
  )
}
