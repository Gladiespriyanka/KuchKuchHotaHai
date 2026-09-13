import { useEffect, useState } from 'react'
import { MATERIAL_NAMES, useI18n } from '../../i18n'
import { recycler } from '../../services/api'
import { Loading, Notice } from '../../components/ui'

const CATEGORIES = Object.keys(MATERIAL_NAMES)

export default function Rates() {
  const { t, tMaterial } = useI18n()
  const [profile, setProfile] = useState(null)
  const [rates, setRates] = useState({})
  const [accepted, setAccepted] = useState([])
  const [pickup, setPickup] = useState(false)
  const [area, setArea] = useState(20)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    recycler.profile().then((p) => {
      setProfile(p)
      setRates(p.offered_rate || {})
      setAccepted(p.accepted_materials || [])
      setPickup(Boolean(p.pickup_available))
      setArea(p.service_area_km ?? 20)
    }).catch((e) => setError(e.message))
  }, [])

  async function save() {
    setBusy(true)
    const payload = {
      offered_rate: Object.fromEntries(
        accepted.filter((c) => Number(rates[c]) > 0).map((c) => [c, Number(rates[c])])
      ),
      accepted_materials: accepted,
      pickup_available: pickup,
      service_area_km: Number(area),
    }
    try {
      const updated = await recycler.update(payload)
      setProfile(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 4000)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !profile) return <Notice tone="warn">{error}</Notice>
  if (!profile) return <Loading />

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-2xl">{t('buyingRates')}</h1>
        <p className="text-sm text-slate2">
          Changing a rate writes a new record into the price dataset, so collectors see the new
          number on the rate board straight away.
        </p>
      </div>

      {saved && <Notice tone="good">{t('ratesSaved')}</Notice>}
      {error && <Notice tone="warn">{error}</Notice>}

      <div className="border-2 border-ink bg-white">
        <table className="w-full text-sm">
          <thead className="bg-mint">
            <tr className="border-b-2 border-ink text-left">
              <th className="px-3 py-2">{t('acceptedMaterials')}</th>
              <th className="px-3 py-2 w-40">₹ / {t('perKg')}</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => {
              const on = accepted.includes(c)
              return (
                <tr key={c} className="border-b border-ink/10">
                  <td className="px-3 py-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox" checked={on} className="h-4 w-4 accent-[#0F4D38]"
                        onChange={() =>
                          setAccepted(on ? accepted.filter((x) => x !== c) : [...accepted, c])
                        }
                      />
                      {tMaterial(c)}
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number" min="0" disabled={!on} value={rates[c] ?? ''}
                      onChange={(e) => setRates({ ...rates, [c]: e.target.value })}
                      className="field num py-1.5 disabled:bg-mint disabled:text-slate2"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="plate p-3">
          <div className="eyebrow">Pickup</div>
          <label className="mt-2 flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={pickup} className="h-4 w-4 accent-[#0F4D38]"
                   onChange={(e) => setPickup(e.target.checked)} />
            {t('pickupAvailable')}
          </label>
        </div>
        <div className="plate p-3">
          <label className="eyebrow" htmlFor="area">{t('serviceArea')}</label>
          <input id="area" type="number" min="1" className="field num mt-2" value={area}
                 onChange={(e) => setArea(e.target.value)} />
        </div>
      </div>

      <div className="plate p-3 text-sm">
        <div className="eyebrow mb-2">{t('profile')}</div>
        <div className="grid gap-1 sm:grid-cols-2">
          <div><span className="text-slate2">Name: </span>{profile.name}</div>
          <div><span className="text-slate2">Facility: </span>{profile.location}</div>
          <div><span className="text-slate2">Authorisation: </span><span className="num">{profile.authorization_id}</span></div>
          <div><span className="text-slate2">Status: </span>{profile.authorization_status}</div>
          <div><span className="text-slate2">Contact: </span><span className="num">{profile.contact}</span></div>
          <div><span className="text-slate2">Rating: </span><span className="num">{profile.rating}</span></div>
        </div>
      </div>

      <button className="btn-primary w-full text-lg" disabled={busy} onClick={save}>
        {t('saveChanges')}
      </button>
    </div>
  )
}
