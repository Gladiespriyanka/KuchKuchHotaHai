import { useEffect, useState } from 'react'
import { CalendarClock, MapPin, Route as RouteIcon, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { pickups } from '../../services/api'
import { Loading, Notice } from '../../components/ui'

const WEEKDAYS = ['day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_sun']

export default function PickupSchedule() {
  const { t } = useI18n()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    area: '', weekday: 1, start_time: '09:00', end_time: '13:00', capacity: 6, radius_km: 8,
  })
  const [routeFor, setRouteFor] = useState(null)
  const [route, setRoute] = useState(null)

  const load = () => pickups.mine().then(setRows).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  async function createRound(e) {
    e.preventDefault()
    if (!form.area.trim()) return
    setBusy(true)
    setError('')
    try {
      await pickups.create({ ...form, weekday: Number(form.weekday), capacity: Number(form.capacity), radius_km: Number(form.radius_km) })
      setForm({ ...form, area: '' })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(scheduleId) {
    setBusy(true)
    try {
      await pickups.deactivate(scheduleId)
      load()
    } finally {
      setBusy(false)
    }
  }

  async function viewRoute(scheduleId, date) {
    setRouteFor(`${scheduleId}:${date}`)
    setRoute(null)
    try {
      setRoute(await pickups.route(scheduleId, date))
    } catch (e) {
      setError(e.message)
    }
  }

  if (!rows) return <Loading />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">{t('pickupSchedules')}</h1>
      {error && <Notice tone="warn">{error}</Notice>}

      <form onSubmit={createRound} className="plate-lg space-y-3 p-4">
        <div className="eyebrow">{t('newRound')}</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="col-span-2 block">
            <span className="eyebrow mb-1 block">{t('area')}</span>
            <input className="field" value={form.area}
                   onChange={(e) => setForm({ ...form, area: e.target.value })}
                   placeholder="e.g. Malviya Nagar" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{t('weekday')}</span>
            <select className="field" value={form.weekday}
                    onChange={(e) => setForm({ ...form, weekday: e.target.value })}>
              {WEEKDAYS.map((key, i) => <option key={key} value={i}>{t(key)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{t('capacity')}</span>
            <input type="number" min="1" max="50" className="field num" value={form.capacity}
                   onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{t('startTime')}</span>
            <input type="time" className="field num" value={form.start_time}
                   onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{t('endTime')}</span>
            <input type="time" className="field num" value={form.end_time}
                   onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">{t('radiusKm')}</span>
            <input type="number" min="1" max="50" className="field num" value={form.radius_km}
                   onChange={(e) => setForm({ ...form, radius_km: e.target.value })} />
          </label>
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>{t('createRound')}</button>
      </form>

      {rows.length === 0 ? (
        <Notice>{t('noRoundsYet')}</Notice>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <div key={s.schedule_id} className="plate-lg p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-bold">
                    <CalendarClock size={16} />
                    {t('everyWeekday').replace('{day}', t(WEEKDAYS[s.weekday]))}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-sm text-slate2">
                    <MapPin size={13} /> {s.area} · {s.start_time}–{s.end_time} · {s.radius_km} km
                  </div>
                </div>
                <button type="button" className="btn-ghost px-2 py-1.5" disabled={busy}
                        onClick={() => remove(s.schedule_id)} aria-label={t('cancel') || 'Cancel'}>
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                {s.upcoming.map((occ) => {
                  const full = occ.booked >= occ.capacity
                  const key = `${s.schedule_id}:${occ.date}`
                  return (
                    <div key={occ.date} className="plate p-2.5">
                      <div className="num text-sm font-bold">{occ.date}</div>
                      <div className={`num text-xs ${full ? 'text-copper' : 'text-slate2'}`}>
                        {t('slotsBooked').replace('{booked}', occ.booked).replace('{capacity}', occ.capacity)}
                        {full && ` · ${t('roundFull')}`}
                      </div>
                      <button type="button" className="btn-ghost mt-2 w-full justify-center py-1.5 text-xs"
                              disabled={occ.booked === 0}
                              onClick={() => viewRoute(s.schedule_id, occ.date)}>
                        <RouteIcon size={13} /> {t('viewRoute')}
                      </button>
                      {routeFor === key && route && (
                        <div className="mt-2 border-t-2 border-ink/10 pt-2">
                          <div className="eyebrow mb-1">{t('suggestedRoute')}</div>
                          <ol className="space-y-1 text-xs">
                            {route.stops.map((stop) => (
                              <li key={stop.lot_id} className="flex justify-between">
                                <span>{stop.stop}. {stop.location}</span>
                                <span className="num">{stop.distance_from_previous_km} km</span>
                              </li>
                            ))}
                          </ol>
                          <div className="num mt-1 text-right text-xs font-bold">
                            {t('totalDistance')}: {route.total_distance_km} km
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
