import { useEffect, useState } from 'react'
import { CalendarClock, MapPin } from 'lucide-react'
import { useI18n } from '../../i18n'
import { lots as lotsApi, pickups } from '../../services/api'
import { Empty, Loading, Notice } from '../../components/ui'

const WEEKDAYS = ['day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_sun']

export default function Pickups() {
  const { t, tMaterial } = useI18n()
  const [rows, setRows] = useState(null)
  const [myLots, setMyLots] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const [choice, setChoice] = useState({}) // scheduleId:date -> lot_id
  const [done, setDone] = useState('')

  const load = () => {
    pickups.nearby().then(setRows).catch((e) => setError(e.message))
    lotsApi.list().then((all) =>
      setMyLots(all.filter((l) => ['LOT_CREATED', 'PRICE_ESTIMATED'].includes(l.status) && !l.recycler_id))
    ).catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function book(scheduleId, date) {
    const lotId = choice[`${scheduleId}:${date}`]
    if (!lotId) return
    setBusy(`${scheduleId}:${date}`)
    setError('')
    try {
      await pickups.book(scheduleId, lotId, date)
      setDone(`${scheduleId}:${date}`)
      setTimeout(() => setDone(''), 4000)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (error && !rows) return <Notice tone="warn">{error}</Notice>
  if (!rows) return <Loading />

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">{t('nearbyRounds')}</h1>
      {error && <Notice tone="warn">{error}</Notice>}

      {rows.length === 0 ? (
        <Empty title={t('nearbyRounds')} body={t('noRoundsNearby')} />
      ) : (
        rows.map((s) => (
          <div key={s.schedule_id} className="plate-lg p-4">
            <div className="flex items-center gap-2 font-bold">
              <CalendarClock size={16} />
              {t('everyWeekday').replace('{day}', t(WEEKDAYS[s.weekday]))}
            </div>
            <div className="mt-1 flex items-center gap-1 text-sm text-slate2">
              <MapPin size={13} /> {s.recycler_name} · {s.area}
              {s.distance_km != null && <> · <span className="num">{s.distance_km} km</span></>}
            </div>

            <div className="mt-3 space-y-2">
              {s.upcoming.map((occ) => {
                const full = occ.booked >= occ.capacity
                const key = `${s.schedule_id}:${occ.date}`
                return (
                  <div key={occ.date} className="plate flex flex-wrap items-center gap-2 p-2.5">
                    <span className="num text-sm font-bold">{occ.date}</span>
                    <span className={`num chip ${full ? 'bg-copper text-white' : 'bg-white'}`}>
                      {occ.booked}/{occ.capacity}
                    </span>
                    {!full && (
                      <>
                        <select
                          className="field num ml-auto w-auto py-1 text-xs"
                          value={choice[key] || ''}
                          onChange={(e) => setChoice({ ...choice, [key]: e.target.value })}
                        >
                          <option value="">{t('chooseLotToBook')}</option>
                          {myLots.map((l) => (
                            <option key={l.lot_id} value={l.lot_id}>
                              {l.lot_id} · {tMaterial(l.material_category)} · {l.weight} kg
                            </option>
                          ))}
                        </select>
                        <button
                          type="button" className="btn-primary px-3 py-1.5 text-xs"
                          disabled={!choice[key] || busy === key}
                          onClick={() => book(s.schedule_id, occ.date)}
                        >
                          {t('bookSlot')}
                        </button>
                      </>
                    )}
                    {done === key && (
                      <span className="w-full text-xs font-semibold text-board">{t('slotBooked')}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
