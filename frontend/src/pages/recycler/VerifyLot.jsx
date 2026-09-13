import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BadgeCheck, Banknote, Camera, Smartphone } from 'lucide-react'
import { useI18n } from '../../i18n'
import { api, recycler } from '../../services/api'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { Loading, Notice, StatusChip, Timeline, formatDate, rupee } from '../../components/ui'
import { fileToDataUrl } from '../../utils/camera'

export default function VerifyLot() {
  const { lotId } = useParams()
  const { t, tMaterial } = useI18n()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [finalWeight, setFinalWeight] = useState('')
  const [finalPrice, setFinalPrice] = useState('')
  const [mode, setMode] = useState('cash')
  const [busy, setBusy] = useState(false)
  const [handover, setHandover] = useState(null)
  const [scalePhoto, setScalePhoto] = useState('')
  const scaleRef = useRef(null)
  const currentUser = useCurrentUser()

  useEffect(() => {
    if (!currentUser) { navigate('/login'); return }
    recycler.verify(lotId)
      .then((d) => {
        setData(d)
        setFinalWeight(String(d.lot.weight))
        setFinalPrice(String(d.transaction?.quoted_price ?? d.lot.quoted_price ?? ''))
        if (d.handover) setHandover(d.handover)
      })
      .catch((e) => setError(e.message))
  }, [lotId, navigate, currentUser])

  async function confirmHandover() {
    if (!scalePhoto) {
      setError(t('scalePhotoRequired'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await recycler.handover({
        lot_id: lotId,
        final_weight: Number(finalWeight),
        final_price: Number(finalPrice),
        scale_photo: scalePhoto,
      })
      setHandover(result)
      setData(await recycler.verify(lotId))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function pay() {
    setBusy(true)
    try {
      await recycler.pay(data.transaction.transaction_id, mode)
      setData(await recycler.verify(lotId))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) return <Notice tone="warn">{error}</Notice>
  if (!data) return <Loading />

  const { lot, transaction, payment } = data
  const handedOver = transaction?.transaction_status === 'HANDED_OVER' || transaction?.transaction_status === 'COMPLETED'
  const isPaid = transaction?.payment_status === 'PAID'
  const drift = Number(finalWeight) && lot.weight
    ? ((Number(finalWeight) - lot.weight) / lot.weight) * 100
    : 0

  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        <div className="plate-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow">{t('lotId')}</div>
              <div className="num text-2xl font-bold">{lot.lot_id}</div>
            </div>
            <StatusChip status={lot.status} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
            {lot.photo ? (
              <img src={lot.photo} alt="" className="h-32 w-full border-2 border-ink object-cover" />
            ) : (
              <div className="flex h-32 items-center justify-center border-2 border-dashed border-ink/30 text-slate2">
                no photo
              </div>
            )}
            <dl className="space-y-1 text-sm">
              <Row label={t('materialLabel')} value={tMaterial(lot.material_category)} />
              <Row label={`${t('weight')} (collector)`} value={`${lot.weight} kg`} />
              <Row label={t('condition')} value={t(lot.condition)} />
              <Row label={t('source')} value={t(lot.source_type)} />
              <Row label={t('estimatedValue')} value={`${rupee(lot.estimated_min)} – ${rupee(lot.estimated_max)}`} />
              <Row label={t('quotedPrice')} value={rupee(transaction?.quoted_price ?? lot.quoted_price)} />
              <Row label={t('collectionPointLabel')} value={lot.location} />
              <Row label={t('createdLabel')} value={formatDate(lot.created_at)} />
            </dl>
          </div>
          {lot.ai_prediction?.category && (
            <p className="mt-3 border-t border-dashed border-ink/20 pt-2 text-xs text-slate2">
              Collector's photo was classified as {lot.ai_prediction.category} at{' '}
              {Math.round((lot.ai_prediction.confidence || 0) * 100)}% by the prototype classifier
              ({lot.ai_prediction.model_version}).
            </p>
          )}
        </div>

        <div className="plate p-3">
          <div className="eyebrow mb-3">{t('timeline')}</div>
          <Timeline events={data.timeline || []} />
        </div>
      </div>

      <div className="space-y-4">
        {!handedOver && (
          <div className="plate-lg p-4">
            <div className="font-display text-xl">{t('confirmHandover')}</div>
            <label className="eyebrow mt-3 block" htmlFor="fw">{t('enterFinalWeight')}</label>
            <input id="fw" type="number" step="0.1" className="field num mt-1" value={finalWeight}
                   onChange={(e) => setFinalWeight(e.target.value)} />
            {Math.abs(drift) > 10 && (
              <p className="mt-1 text-xs text-copper">
                {drift > 0 ? '+' : ''}{drift.toFixed(0)}% vs the collector's declared weight.
              </p>
            )}
            <label className="eyebrow mt-3 block" htmlFor="fp">{t('enterFinalPrice')}</label>
            <input id="fp" type="number" className="field num mt-1" value={finalPrice}
                   onChange={(e) => setFinalPrice(e.target.value)} />
            {/* Photo of the scale: makes the recorded weight verifiable
                rather than merely asserted, and is stored on the handover. */}
            <div className="mt-4 border-2 border-dashed border-ink/40 p-3">
              <div className="eyebrow">{t('scalePhoto')} *</div>
              <p className="mt-1 text-xs text-slate2">{t('scalePhotoHint')}</p>
              <input
                ref={scaleRef} type="file" accept="image/*" capture="environment"
                className="hidden" data-testid="scale-input"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  try { setScalePhoto(await fileToDataUrl(file)) } catch { /* ignore */ }
                }}
              />
              {scalePhoto ? (
                <div className="mt-2 flex items-center gap-3">
                  <img src={scalePhoto} alt="" className="h-20 w-20 border-2 border-ink object-cover" />
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs"
                          onClick={() => scaleRef.current?.click()}>
                    {t('retakePhoto')}
                  </button>
                </div>
              ) : (
                <button type="button" className="btn-ghost mt-2 w-full justify-center py-2.5"
                        onClick={() => scaleRef.current?.click()}>
                  <Camera size={16} /> {t('takePhoto')}
                </button>
              )}
            </div>
            {error && <Notice tone="warn">{error}</Notice>}
            <button className="btn-primary mt-4 w-full text-lg"
                    disabled={busy || !finalWeight || !finalPrice || !scalePhoto}
                    onClick={confirmHandover}>
              <BadgeCheck size={20} /> {t('confirmHandover')}
            </button>
          </div>
        )}

        {handedOver && (
          <div className="border-[3px] border-ink bg-board p-4 text-white shadow-plate">
            <div className="font-display text-xl">✅ HANDOVER VERIFIED</div>
            <dl className="mt-3 space-y-1 text-sm">
              <Row dark label={t('handoverRef')} value={handover?.reference_number ?? data.handover?.reference_number} />
              <Row dark label={t('finalWeight')} value={`${transaction.final_weight} kg`} />
              <Row dark label={t('finalPrice')} value={rupee(transaction.final_price)} />
              <Row dark label={t('handoverPointLabel')} value={transaction.handover_location} />
              <Row dark label={t('verifiedAtLabel')} value={formatDate(data.handover?.timestamp)} />
            </dl>
          </div>
        )}

        {transaction?.anomaly_flag && <Notice tone="warn">⚠️ {transaction.anomaly_reason}</Notice>}

        {handedOver && !isPaid && (
          <div className="plate-lg p-4">
            <div className="font-display text-xl">{t('paymentMode')}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className={`tile items-center py-3 ${mode === 'cash' ? 'bg-board text-white' : 'bg-white'}`}
                      onClick={() => setMode('cash')}>
                <Banknote size={22} /><span className="mt-1 font-bold">💵 {t('cash')}</span>
              </button>
              <button className={`tile items-center py-3 ${mode === 'upi' ? 'bg-board text-white' : 'bg-white'}`}
                      onClick={() => setMode('upi')}>
                <Smartphone size={22} /><span className="mt-1 font-bold">📱 {t('upi')}</span>
              </button>
            </div>
            <p className="mt-2 text-xs text-slate2">
              UPI is recorded as a payment mode in this prototype — no payment gateway is connected.
            </p>
            <button className="btn-brass mt-3 w-full text-lg" disabled={busy} onClick={pay}>
              {t('markPaid')} · {rupee(transaction.final_price)}
            </button>
          </div>
        )}

        {isPaid && (
          <div className="plate-lg bg-brass/25 p-4">
            <div className="font-display text-xl">💰 {t('paid')}</div>
            <dl className="mt-2 space-y-1 text-sm">
              <Row label={t('amountLabel')} value={rupee(payment?.amount ?? transaction.final_price)} />
              <Row label={t('paymentMode')} value={(payment?.mode ?? mode).toUpperCase()} />
              <Row label={t('status')} value={transaction.transaction_status} />
            </dl>
            <button className="btn-ghost mt-3 w-full" onClick={() => navigate('/recycler')}>
              {t('dashboard')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, dark }) {
  return (
    <div className={`flex justify-between gap-3 border-b border-dashed pb-1 last:border-0 ${dark ? 'border-white/20' : 'border-ink/15'}`}>
      <dt className={dark ? 'text-white/70' : 'text-slate2'}>{label}</dt>
      <dd className="num text-right font-semibold">{value}</dd>
    </div>
  )
}
