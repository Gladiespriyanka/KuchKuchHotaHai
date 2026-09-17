import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Crown, Gavel, MapPin, Package, ScanLine, Trophy, Users } from 'lucide-react'
import { useI18n } from '../../i18n'
import { offers as offersApi, recycler } from '../../services/api'
import {
  AuctionCountdown, Loading, Notice, PriorityCountdown, Stat, StatusChip, formatDate, rupee,
} from '../../components/ui'

// Same emoji set the backend seeds materials with (see CATEGORY_ICON in
// import_datasets.py) — purely decorative, keeps the bidding cards scannable
// at a glance without another API round trip.
const MATERIAL_ICON = {
  PCB: '🔌', Cable: '🔗', Battery: '🔋', 'LCD/LED panel': '🖥️',
  CRT: '📺', 'Motor & magnet-bearing': '⚙️', 'Mixed plastic': '♻️',
}

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
      // Reflect this facility's actual pickup capability rather than always
      // claiming pickup is offered — collectors see this flag on the offer.
      await offersApi.make(lot.lot_id, {
        rate_per_kg: rate,
        pickup_offered: Boolean(data.recycler.pickup_available),
      })
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
  const auctionLots = open.filter((lot) => lot.auction_status === 'open')
  const directLots = open.filter((lot) => lot.auction_status !== 'open')

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
        <div className="mb-1 flex items-baseline gap-2">
          <h2 className="font-display text-xl leading-none">{t('biddingGround')}</h2>
          <span className="num chip bg-brass text-ink">{auctionLots.length}</span>
        </div>
        <p className="mb-3 text-xs text-slate2">{t('biddingGroundSub')}</p>

        {auctionLots.length === 0 ? (
          <div className="plate p-6 text-center text-sm text-slate2">
            <Gavel size={22} className="mx-auto mb-2 text-slate2/60" />
            {t('noAuctionsRightNow')}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {auctionLots.map((lot) => {
              const rate = Number(draft[lot.lot_id] ?? lot.my_offer?.rate_per_kg ?? lot.suggested_rate ?? 0)
              const amount = rate * lot.weight
              const tooLow = lot.highest_bid && amount <= lot.highest_bid
              const leading = lot.my_offer && lot.highest_bid && lot.my_offer.amount >= lot.highest_bid
              return (
                <div
                  key={lot.lot_id}
                  className={`plate-lg flex flex-col gap-3 border-[3px] p-4 ${
                    leading ? 'border-board bg-mint/40' : 'border-ink bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 font-display text-lg leading-none">
                        <span>{MATERIAL_ICON[lot.material_category] || <Package size={16} />}</span>
                        {tMaterial(lot.material_category)}
                      </div>
                      <div className="num mt-1 text-xs text-slate2">{lot.lot_id}</div>
                    </div>
                    <AuctionCountdown endsAt={lot.auction_ends_at} />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate2">
                    <span className="num">{lot.weight} kg</span>
                    <span className="flex items-center gap-1"><MapPin size={12} /> <span className="num">{lot.distance_km != null ? `${lot.distance_km} km` : t('sameCity')}</span></span>
                    <span className="num">{rupee(lot.estimated_min)}–{rupee(lot.estimated_max)}</span>
                  </div>

                  {lot.priority_access && (
                    <PriorityCountdown endsAt={lot.priority_window_ends_at} />
                  )}

                  <div className="grid grid-cols-2 gap-2 border-t-2 border-ink/10 pt-3">
                    <div>
                      <div className="eyebrow">{t('highestBid')}</div>
                      <div className="num text-lg font-bold">
                        {lot.highest_bid ? rupee(lot.highest_bid) : t('noBidsYet')}
                      </div>
                    </div>
                    <div>
                      <div className="eyebrow">{t('yourBid')}</div>
                      <div className="num text-lg font-bold">
                        {lot.my_offer ? rupee(lot.my_offer.amount) : '—'}
                      </div>
                    </div>
                  </div>

                  {lot.my_offer && (
                    <div className={`chip w-fit ${leading ? 'bg-board text-white' : 'bg-copper text-white'}`}>
                      <Trophy size={12} /> {leading ? t('youAreLeading') : t('youAreOutbid')}
                    </div>
                  )}

                  <div className="border-y-2 border-ink/10 py-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="eyebrow flex items-center gap-1"><Users size={12} /> Live bid board</span>
                      <span className="num text-xs text-slate2">{lot.bid_board?.length || 0} bids</span>
                    </div>
                    {lot.bid_board?.length ? (
                      <div className="space-y-1">
                        {lot.bid_board.slice(0, 4).map((bid) => (
                          <div key={bid.recycler_id} className={`flex items-center gap-2 text-xs ${bid.recycler_id === lot.my_offer?.recycler_id ? 'font-bold text-board' : ''}`}>
                            <span className="num flex h-5 w-5 items-center justify-center border border-ink/20 bg-mint">{bid.rank}</span>
                            <span className="min-w-0 flex-1 truncate">{bid.recycler_name}</span>
                            <span className="num font-semibold">{rupee(bid.amount)}</span>
                          </div>
                        ))}
                        {lot.bid_board.length > 4 && <div className="text-[11px] text-slate2">+ {lot.bid_board.length - 4} more live bids</div>}
                      </div>
                    ) : (
                      <div className="text-xs text-slate2">Be the first recycler to set the pace.</div>
                    )}
                  </div>

                  <div className="mt-auto flex items-end gap-2">
                    <div className="flex-1">
                      <label className="eyebrow" htmlFor={`rate-${lot.lot_id}`}>{t('yourRate')}</label>
                      <input
                        id={`rate-${lot.lot_id}`}
                        type="number" min="1" className="field num mt-1 w-full py-1.5"
                        value={draft[lot.lot_id] ?? lot.my_offer?.rate_per_kg ?? lot.suggested_rate ?? ''}
                        onChange={(e) => setDraft({ ...draft, [lot.lot_id]: e.target.value })}
                      />
                    </div>
                    <button
                      className="btn-primary shrink-0 px-4 py-2 text-sm"
                      disabled={busy === lot.lot_id || tooLow}
                      onClick={() => sendOffer(lot)}
                    >
                      <Gavel size={14} /> {lot.my_offer ? t('raiseBid') : t('placeBid')}
                    </button>
                  </div>
                  {tooLow && <div className="text-[11px] text-copper">{t('bidMustBeat')}</div>}
                  {sent === lot.lot_id && (
                    <div className="text-xs font-semibold text-board">{t('offerSent')}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="eyebrow">{t('directOffers')}</h2>
          <span className="num chip bg-white">{directLots.length}</span>
        </div>
        <p className="mb-2 text-xs text-slate2">{t('directOffersSub')}</p>
        <div className="overflow-x-auto border-2 border-ink bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-mint text-left">
              <tr className="border-b-2 border-ink">
                {[t('lotId'), t('materialLabel'), t('weight'), t('distanceLabel'), t('estimatedValue'),
                  t('offers'), t('ratePerKg'), ''].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {directLots.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate2">
                  {t('noDirectOffersRightNow')}
                </td></tr>
              )}
              {directLots.map((lot) => (
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
                  <td className="num px-3 py-2">{lot.distance_km != null ? `${lot.distance_km} km` : t('sameCity')}</td>
                  <td className="num px-3 py-2">
                    {rupee(lot.estimated_min)}–{rupee(lot.estimated_max)}
                  </td>
                  <td className="px-3 py-2">{lot.offer_count}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number" min="1" className="field num w-28 py-1"
                      value={draft[lot.lot_id] ?? lot.my_offer?.rate_per_kg ?? lot.suggested_rate ?? ''}
                      onChange={(e) => setDraft({ ...draft, [lot.lot_id]: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="btn-primary px-3 py-1.5 text-xs"
                      disabled={busy === lot.lot_id}
                      onClick={() => sendOffer(lot)}
                    >
                      {lot.my_offer ? t('reviseOffer') : t('makeOffer')}
                    </button>
                    {sent === lot.lot_id && (
                      <span className="ml-2 text-xs font-semibold text-board">{t('offerSent')}</span>
                    )}
                  </td>
                </tr>
              ))}
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
                {[t('lotId'), t('materialLabel'), t('weight'), t('quotedPrice'), t('locationLabel'), t('collectorContact'), t('status'), ''].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.incoming.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate2">{t('noLotsWaiting')}</td></tr>
              )}
              {data.incoming.map((lot) => (
                <tr key={lot.lot_id} className="border-b border-ink/10">
                  <td className="num px-3 py-2">{lot.lot_id}</td>
                  <td className="px-3 py-2">{tMaterial(lot.material_category)}</td>
                  <td className="num px-3 py-2">{lot.weight} kg</td>
                  <td className="num px-3 py-2">{rupee(lot.quoted_price)}</td>
                  <td className="px-3 py-2">{lot.location}</td>
                  <td className="num px-3 py-2">
                    {lot.collector_contact
                      ? <a className="font-semibold text-board underline" href={`tel:${lot.collector_contact}`}>{lot.collector_contact}</a>
                      : <span className="text-xs text-slate2">{t('contactRevealedNote')}</span>}
                  </td>
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
