import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Crown, Gavel, ScanLine } from 'lucide-react'
import { useI18n } from '../../i18n'
import { offers as offersApi, recycler } from '../../services/api'
import {
  AuctionCountdown, Loading, Notice, PriorityCountdown, Stat, StatusChip, formatDate, rupee,
} from '../../components/ui'

export default function RecyclerDashboard() {
  const { t, tMaterial } = useI18n()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState([])
  const [draft, setDraft] = useState({})
  const [sent, setSent] = useState('')
  const [subBusy, setSubBusy] = useState(false)

  useEffect(() => {
    const load = () => {
      recycler.dashboard().then((d) => { setData(d); setError('') }).catch((e) => setError(e.message))
      offersApi.openLots().then(setOpen).catch(() => {})
    }
    load()
    const timer = setInterval(load, 6000)
    return () => clearInterval(timer)
  }, [])

  async function sendOffer(lot) {
    const rate = Number(draft[lot.lot_id] ?? lot.my_offer?.rate_per_kg ?? lot.suggested_rate)
    if (!(rate > 0)) return
    setBusy(lot.lot_id)
    try {
      await offersApi.make(lot.lot_id, { rate_per_kg: rate, pickup_offered: true })
      setOpen(await offersApi.openLots())
      setSent(lot.lot_id)
      setTimeout(() => setSent(''), 4000)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function toggleSubscription() {
    setSubBusy(true)
    try {
      await (data.recycler.is_premium ? recycler.cancelSubscription() : recycler.subscribe())
      setData(await recycler.dashboard())
    } catch (e) {
      setError(e.message)
    } finally {
      setSubBusy(false)
    }
  }

  async function decide(lotId, decision) {
    setBusy(lotId)
    try {
      await recycler.decide(lotId, decision)
      setData(await recycler.dashboard())
    } finally {
      setBusy(null)
    }
  }

  if (error && !data) return <Notice tone="warn">{error}</Notice>
  if (!data) return <Loading />
  const c = data.cards

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="font-display text-2xl leading-none">{data.recycler.name}</div>
            {data.recycler.is_premium && (
              <span className="chip bg-brass text-ink"><Crown size={12} /> {t('premiumBadge')}</span>
            )}
          </div>
          <div className="text-sm text-slate2">
            {data.recycler.location} · <span className="num">{data.recycler.authorization_id}</span> ·{' '}
            <span className="chip bg-board text-white">{t('authorised')}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className={data.recycler.is_premium ? 'btn-ghost' : 'btn-brass'}
            disabled={subBusy}
            onClick={toggleSubscription}
          >
            <Crown size={16} />
            {data.recycler.is_premium ? t('cancelPremium') : t('upgradeToPremium')}
          </button>
          <Link to="/recycler/scan" className="btn-primary">
            <ScanLine size={18} /> {t('scanLotQr')}
          </Link>
        </div>
      </div>
      {data.recycler.is_premium ? (
        <p className="text-xs text-slate2">
          {t('premiumActiveUntil')} {formatDate(data.recycler.premium_expires_at)}
        </p>
      ) : (
        <p className="text-xs text-slate2">{t('premiumSub')}</p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('activeLots')} value={c.active_lots} tone="board" />
        <Stat label={t('todaysCollection')} value={`${c.today_collection_kg} kg`} />
        <Stat label={t('pendingHandover')} value={c.pending_handover} tone="brass" />
        <Stat label={t('completed')} value={c.completed} sub={rupee(c.total_paid)} />
        {!data.recycler.is_premium && c.premium_locked_lots > 0 && (
          <Stat label={t('premiumLockedLots')} value={c.premium_locked_lots} tone="brass" />
        )}
      </div>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="eyebrow">{t('openLots')}</h2>
          <span className="num chip bg-white">{open.length}</span>
        </div>
        <div className="overflow-x-auto border-2 border-ink bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-mint text-left">
              <tr className="border-b-2 border-ink">
                {[t('lotId'), 'Material', t('weight'), 'Distance', t('estimatedValue'),
                  t('offers'), t('ratePerKg'), ''].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {open.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate2">
                  No open lots right now.
                </td></tr>
              )}
              {open.map((lot) => {
                const isAuction = lot.auction_status === 'open'
                const rate = Number(draft[lot.lot_id] ?? lot.my_offer?.rate_per_kg ?? lot.suggested_rate ?? 0)
                const tooLow = isAuction && lot.highest_bid && rate * lot.weight <= lot.highest_bid
                return (
                  <tr key={lot.lot_id} className="border-b border-ink/10">
                    <td className="num px-3 py-2">
                      {lot.lot_id}
                      {lot.priority_access && (
                        <div className="mt-1">
                          <PriorityCountdown endsAt={lot.priority_window_ends_at} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{tMaterial(lot.material_category)}</td>
                    <td className="num px-3 py-2">{lot.weight} kg</td>
                    <td className="num px-3 py-2">{lot.distance_km} km</td>
                    <td className="num px-3 py-2">
                      {rupee(lot.estimated_min)}–{rupee(lot.estimated_max)}
                    </td>
                    <td className="px-3 py-2">
                      {isAuction ? (
                        <div className="space-y-1">
                          <AuctionCountdown endsAt={lot.auction_ends_at} />
                          <div className="num text-xs text-slate2">
                            {t('highestBid')}: {lot.highest_bid ? rupee(lot.highest_bid) : '—'}
                          </div>
                        </div>
                      ) : lot.offer_count}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number" min="1" className="field num w-28 py-1"
                        value={draft[lot.lot_id] ?? lot.my_offer?.rate_per_kg ?? lot.suggested_rate ?? ''}
                        onChange={(e) => setDraft({ ...draft, [lot.lot_id]: e.target.value })}
                      />
                      {tooLow && <div className="mt-1 text-[11px] text-copper">{t('bidMustBeat')}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        className="btn-primary px-3 py-1.5 text-xs"
                        disabled={busy === lot.lot_id || tooLow}
                        onClick={() => sendOffer(lot)}
                      >
                        {isAuction
                          ? <><Gavel size={13} /> {lot.my_offer ? t('raiseBid') : t('placeBid')}</>
                          : (lot.my_offer ? t('reviseOffer') : t('makeOffer'))}
                      </button>
                      {sent === lot.lot_id && (
                        <span className="ml-2 text-xs font-semibold text-board">{t('offerSent')}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-2">{t('incomingLots')}</h2>
        <div className="overflow-x-auto border-2 border-ink bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-mint text-left">
              <tr className="border-b-2 border-ink">
                {[t('lotId'), t('materialLabel'), t('weight'), t('quotedPrice'), t('locationLabel'), t('status'), ''].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.incoming.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate2">{t('noLotsWaiting')}</td></tr>
              )}
              {data.incoming.map((lot) => (
                <tr key={lot.lot_id} className="border-b border-ink/10">
                  <td className="num px-3 py-2">{lot.lot_id}</td>
                  <td className="px-3 py-2">{tMaterial(lot.material_category)}</td>
                  <td className="num px-3 py-2">{lot.weight} kg</td>
                  <td className="num px-3 py-2">{rupee(lot.quoted_price)}</td>
                  <td className="px-3 py-2">{lot.location}</td>
                  <td className="px-3 py-2"><StatusChip status={lot.status} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <Link className="btn-primary px-3 py-1.5 text-xs" to={`/verify/${lot.lot_id}`}>
                        {t('verifyLot')}
                      </Link>
                      {lot.status === 'HANDOVER_PENDING' && (
                        <>
                          <button className="btn-ghost px-2 py-1.5 text-xs" disabled={busy === lot.lot_id}
                                  onClick={() => decide(lot.lot_id, 'accept')}>
                            {t('accept')}
                          </button>
                          <button className="btn-ghost px-2 py-1.5 text-xs" disabled={busy === lot.lot_id}
                                  onClick={() => decide(lot.lot_id, 'reject')}>
                            {t('reject')}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-2">{t('transactions')}</h2>
        <div className="overflow-x-auto border-2 border-ink bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-mint text-left">
              <tr className="border-b-2 border-ink">
                {[t('lotId'), t('finalWeight'), t('finalPrice'), t('paymentStatusLabel'), t('updatedLabel')].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recent.map((row) => (
                <tr key={row.transaction_id} className="border-b border-ink/10">
                  <td className="num px-3 py-2">{row.lot_id}</td>
                  <td className="num px-3 py-2">{row.final_weight || '—'} kg</td>
                  <td className="num px-3 py-2">{row.final_price ? rupee(row.final_price) : '—'}</td>
                  <td className="px-3 py-2"><StatusChip status={row.payment_status} /></td>
                  <td className="num px-3 py-2 text-slate2">{formatDate(row.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
