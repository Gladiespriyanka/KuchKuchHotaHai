import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BadgeCheck, ChevronRight, Crown, Download, Package, Users2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { lots as lotsApi, offers as offersApi } from '../../services/api'
import QRBlock from '../../components/QRBlock'
import { AuctionCountdown, Empty, Loading, Notice, StatusChip, Timeline, formatDate, rupee } from '../../components/ui'
import { fairnessSentence, speak } from '../../services/voice'

export function MyLots() {
  const { t, tMaterial } = useI18n()
  const [rows, setRows] = useState(null)
  const navigate = useNavigate()

  const [error, setError] = useState('')

  useEffect(() => {
    lotsApi.list().then(setRows).catch((e) => { setError(e.message); setRows([]) })
  }, [])

  if (error) return <Notice tone="warn">{error}</Notice>
  if (!rows) return <Loading />
  if (!rows.length)
    return (
      <Empty
        title={t('myLots')}
        body={t('noTransactions')}
        action={<Link className="btn-primary" to="/app/new">{t('sellEwaste')}</Link>}
      />
    )

  return (
    <div className="space-y-3">
      <h1 className="font-display text-2xl">{t('myLots')}</h1>
      {rows.map((lot) => (
        <Link key={lot.lot_id} to={`/app/lots/${lot.lot_id}`} className="plate flex items-center gap-3 p-3">
          {lot.photo ? (
            <img src={lot.photo} alt="" className="h-14 w-14 border-2 border-ink object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center border-2 border-ink bg-mint">
              <Package size={22} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="num block text-xs text-slate2">{lot.lot_id}</span>
            <span className="block truncate font-bold">{tMaterial(lot.material_category)}</span>
            <span className="num block text-sm text-slate2">
              {lot.weight} kg · {lot.quoted_price ? rupee(lot.quoted_price) : `${rupee(lot.estimated_min)}–${rupee(lot.estimated_max)}`}
            </span>
          </span>
          <span className="flex flex-col items-end gap-1">
            <StatusChip status={lot.status} />
            <ChevronRight size={16} className="text-slate2" />
          </span>
        </Link>
      ))}
    </div>
  )
}

export function LotDetail() {
  const { lotId } = useParams()
  const { t, tMaterial } = useI18n()
  const [lot, setLot] = useState(null)
  const [error, setError] = useState('')
  const [offerList, setOfferList] = useState([])
  const [busy, setBusy] = useState(null)
  const [groupBusy, setGroupBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => {
      lotsApi.get(lotId).then((d) => alive && setLot(d)).catch((e) => setError(e.message))
      offersApi.forLot(lotId).then((o) => alive && setOfferList(o)).catch(() => {})
    }
    load()
    // The recycler may verify and pay while this screen is open.
    const timer = setInterval(load, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [lotId])

  async function accept(offerId) {
    setBusy(offerId)
    try {
      await offersApi.accept(offerId)
      setLot(await lotsApi.get(lotId))
      setOfferList(await offersApi.forLot(lotId))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function respondToGroup(action) {
    setGroupBusy(true)
    try {
      await (action === 'accept' ? lotsApi.groupAccept(lotId) : lotsApi.groupDecline(lotId))
      setLot(await lotsApi.get(lotId))
    } catch (e) {
      setError(e.message)
    } finally {
      setGroupBusy(false)
    }
  }

  if (error) return <Notice tone="warn">{error}</Notice>
  if (!lot) return <Loading />

  const txn = lot.transaction
  const pending = offerList.filter((o) => o.status === 'PENDING')
  const awaitingOffers = !lot.recycler_id
  const waiting = ['HANDOVER_PENDING', 'RECYCLER_VERIFIED'].includes(lot.status)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="eyebrow">{t('lotId')}</div>
          <div className="num text-xl font-bold">{lot.lot_id}</div>
          <div className="text-sm text-slate2">
            {tMaterial(lot.material_category)} · <span className="num">{lot.weight} kg</span> · {t(lot.condition)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusChip status={lot.status} />
          {lot.auction_status === 'open' && <AuctionCountdown endsAt={lot.auction_ends_at} />}
        </div>
      </div>

      {lot.photo && <img src={lot.photo} alt="" className="h-44 w-full border-2 border-ink object-cover" />}

      {lot.group && lot.group.status !== 'DECLINED' && (
        <div className="border-[3px] border-ink bg-brass p-4 shadow-plate">
          <div className="flex items-center gap-2 text-ink">
            <Users2 size={20} strokeWidth={2.5} />
            <span className="font-display text-lg">{t('groupSuggestionTitle')}</span>
          </div>
          {lot.group.partners.map((p) => (
            <p key={p.lot_id} className="mt-2 text-sm leading-snug">
              {t('groupSuggestionBody')
                .replace('{weight}', p.weight)
                .replace('{combined}', lot.group.combined_weight)
                .replace('{bonus}', lot.group.bonus_rate_per_kg)
                .replace('{base}', lot.group.base_rate_per_kg)}
            </p>
          ))}
          {lot.group.status === 'MATCHED' ? (
            <p className="mt-3 text-sm font-semibold">✅ {t('groupMatched')}</p>
          ) : (
            <>
              <p className="mt-3 text-sm font-semibold">
                {lot.group.you_accepted
                  ? t('groupYouAccepted')
                  : lot.group.partners.some((p) => p.accepted)
                    ? t('groupPartnerAccepted')
                    : null}
              </p>
              {!lot.group.you_accepted && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn-primary justify-center" disabled={groupBusy}
                          onClick={() => respondToGroup('accept')}>
                    {t('groupAccept')}
                  </button>
                  <button className="btn-ghost justify-center" disabled={groupBusy}
                          onClick={() => respondToGroup('decline')}>
                    {t('groupDecline')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {awaitingOffers && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="eyebrow">
              {lot.auction_status === 'open' ? t('liveAuction') : t('offersReceived')}
            </span>
            <span className="num chip ml-auto bg-white">{pending.length}</span>
          </div>
          {lot.auction_status === 'open' && (
            <Notice>{t('auctionWinnerNote')}</Notice>
          )}
          {pending.length === 0 ? (
            <Notice>{lot.auction_status === 'open' ? t('noBidsYet') : t('noOffersYet')}</Notice>
          ) : (
            pending.map((o, i) => {
              const leading = lot.auction_status === 'open' && i === 0
              return (
                <div key={o.offer_id} className={`plate-lg p-3 ${leading ? 'border-brass' : ''}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold">
                      {leading && <Crown size={16} className="mr-1 inline text-brass" />}
                      ♻️ {o.recycler_name}
                    </span>
                    <span className="num ml-auto text-xl font-bold text-board">{rupee(o.amount)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate2">
                    <span className="num">₹{o.rate_per_kg}/{t('perKg')}</span>
                    {o.distance_km != null && <span className="num">{o.distance_km} {t('kmAway')}</span>}
                    {o.pickup_offered && <span>🚚 {t('pickupAvailable')}</span>}
                    <span className="num">✅ {o.authorization_id}</span>
                  </div>
                  <ReliabilityMeta reliability={o.reliability} />
                  {o.note && <p className="mt-1 text-sm">{o.note}</p>}
                  <button className="btn-primary mt-3 w-full" disabled={busy === o.offer_id}
                          onClick={() => accept(o.offer_id)}>
                    {t('acceptOffer')} · {rupee(o.amount)}
                  </button>
                </div>
              )
            })
          )}
          {lot.auction_status !== 'open' && !(lot.group && lot.group.status !== 'DECLINED') && (
            <Link className="btn-ghost w-full justify-center py-3" to={`/app/lots/${lot.lot_id}/match`}>
              {t('findRecycler')}
            </Link>
          )}
        </div>
      )}

      {waiting && <QRBlock lotId={lot.lot_id} />}
      {waiting && (
        <button className="btn-ghost w-full" onClick={() => downloadQr(lot.lot_id)}>
          <Download size={18} /> Download QR
        </button>
      )}

      <div className="plate p-3">
        <div className="eyebrow mb-2">{t('status')}</div>
        <dl className="space-y-1.5 text-sm">
          {lot.recycler_name && <Row label={t('recycler')} value={lot.recycler_name} />}
          <Row label={t('estimatedValue')} value={`${rupee(lot.estimated_min)} – ${rupee(lot.estimated_max)}`} />
          {lot.quoted_price > 0 && <Row label={t('quotedPrice')} value={rupee(lot.quoted_price)} />}
          {txn?.final_weight > 0 && <Row label={t('finalWeight')} value={`${txn.final_weight} kg`} />}
          {txn?.final_price > 0 && <Row label={t('finalPrice')} value={rupee(txn.final_price)} />}
          {txn && (
            <Row
              label={t('paymentStatus') || 'Payment'}
              value={txn.payment_status === 'PAID' ? `✅ ${t('paid')}` : `⏳ ${t('pending')}`}
            />
          )}
          <Row label="Location" value={lot.location} />
          <Row label="Created" value={formatDate(lot.created_at)} />
        </dl>
      </div>

      {lot.fairness && !lot.fairness.ok && (
        <div className="border-[3px] border-ink bg-copper p-4 text-white shadow-plate">
          <div className="font-display text-xl">
            ⚠️ {lot.fairness.issues.includes('weight') ? t('fairnessWeight') : t('fairnessPrice')}
          </div>
          {lot.fairness.issues.includes('weight') && (
            <div className="mt-2 flex items-end gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-white/70">{t('declaredWeight')}</div>
                <div className="num text-2xl font-bold">{lot.fairness.declared_weight} kg</div>
              </div>
              <div className="text-2xl">→</div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-white/70">{t('recordedWeight')}</div>
                <div className="num text-2xl font-bold">{lot.fairness.final_weight} kg</div>
              </div>
              <div className="num ml-auto text-lg font-bold">{lot.fairness.weight_drift_pct}%</div>
            </div>
          )}
          {lot.fairness.issues.includes('price') && (
            <div className="num mt-2">
              ₹{lot.fairness.rate}/kg vs ₹{lot.fairness.market_rate}/kg ({lot.fairness.rate_gap_pct}%)
            </div>
          )}
          <button
            type="button"
            className="btn mt-3 w-full border-white/50 bg-white/15 py-2 text-white"
            onClick={() => speak(
              fairnessSentence({
                declared: lot.fairness.declared_weight,
                final: lot.fairness.final_weight,
                kind: lot.fairness.issues.includes('weight') ? 'weight' : 'price',
              }, lang),
              speech
            )}
          >
            🔊 {t('listen')}
          </button>
        </div>
      )}
      {txn?.anomaly_flag && <Notice tone="warn">⚠️ {txn.anomaly_reason}</Notice>}

      <div className="plate p-3">
        <div className="eyebrow mb-3">{t('timeline')}</div>
        <Timeline events={lot.timeline || []} />
      </div>
    </div>
  )
}

function ReliabilityMeta({ reliability }) {
  if (!reliability) return null
  if (reliability.status === 'insufficient') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate2">
        <span className="chip bg-white"><BadgeCheck size={12} /> Reliability: Insufficient history</span>
      </div>
    )
  }
  if (
    reliability.status !== 'sufficient' ||
    !Number.isFinite(reliability.score) ||
    !Number.isFinite(reliability.transaction_count) ||
    !Number.isFinite(reliability.avg_deviation)
  ) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate2">
      <span className="chip bg-mint"><BadgeCheck size={12} /> Reliability: {reliability.score.toFixed(0)}/100</span>
      <span className="num">{reliability.transaction_count} completed deals · Avg quote→final difference: {reliability.avg_deviation.toFixed(1)}%</span>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-ink/15 pb-1 last:border-0">
      <dt className="text-slate2">{label}</dt>
      <dd className="num text-right font-semibold">{value}</dd>
    </div>
  )
}

/** Rasterise the on-screen QR SVG to a PNG the collector can keep. */
function downloadQr(lotId) {
  const svg = document.querySelector('svg[height][width]')
  if (!svg) return
  const xml = new XMLSerializer().serializeToString(svg)
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 520
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 60, 40, 400, 400)
    ctx.fillStyle = '#12211C'
    ctx.font = 'bold 34px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(lotId, 260, 500)
    ctx.font = '20px sans-serif'
    ctx.fillText('PunahSetu', 260, 540)
    const link = document.createElement('a')
    link.download = `${lotId}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }
  img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`
}
