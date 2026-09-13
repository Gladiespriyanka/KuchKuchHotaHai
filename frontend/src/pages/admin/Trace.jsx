import { useState } from 'react'
import { Search } from 'lucide-react'
import { useI18n } from '../../i18n'
import { admin } from '../../services/api'
import MapView from '../../components/MapView'
import { Notice, StatusChip, Timeline, formatDate, rupee } from '../../components/ui'

export default function Trace() {
  const { t, tMaterial } = useI18n()
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function search(e) {
    e?.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    setError('')
    setData(null)
    try {
      setData(await admin.trace(query.trim().toUpperCase()))
    } catch (err) {
      setError(err.status === 404 ? t('notFound') : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl">{t('traceability')}</h1>
        <p className="text-sm text-slate2">
          {t('traceIntro')}
        </p>
      </div>

      <form onSubmit={search} className="flex gap-2">
        <input
          className="field num flex-1 uppercase" placeholder="KC-2026-000127"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn-primary" disabled={busy}>
          <Search size={18} /> {t('search')}
        </button>
      </form>

      {error && <Notice tone="warn">{error}</Notice>}

      {data && (
        <div className="space-y-4">
          <div className="border-[3px] border-ink bg-boardDark p-4 text-white shadow-plate">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="eyebrow text-brass">{t('lotId')}</div>
                <div className="num text-3xl font-bold">{data.lot.lot_id}</div>
              </div>
              <div className="ml-auto"><StatusChip status={data.lot.status} /></div>
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
              <Fact label={t('materialLabel')} value={tMaterial(data.lot.material_category)} />
              <Fact label={t('declaredWeightLabel')} value={`${data.lot.weight} kg`} />
              <Fact label={t('finalWeightLabel')} value={data.transaction?.final_weight ? `${data.transaction.final_weight} kg` : '—'} />
              <Fact label={t('finalPriceLabel')} value={data.transaction?.final_price ? rupee(data.transaction.final_price) : '—'} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={t('collector')}>
              {data.lot.photo && <img src={data.lot.photo} alt="" className="mb-2 h-28 w-full border-2 border-ink object-cover" />}
              <Line label={t('nameLabel')} value={data.collector?.name || data.collector?.display_name} />
              <Line label={t('areaLabel')} value={data.collector?.location || data.collector?.operating_location} />
              <Line label={t('createdLabel')} value={formatDate(data.lot.created_at)} />
              <Line label={t('conditionLabel')} value={data.lot.condition} />
              <Line label={t('sourceLabel')} value={data.lot.source_type} />
              <Line label={t('estimateLabel')} value={`${rupee(data.lot.estimated_min)} – ${rupee(data.lot.estimated_max)}`} />
              {data.lot.ai_prediction?.category && (
                <Line label={t('aiSuggestionLabel')}
                      value={`${data.lot.ai_prediction.category} · ${Math.round((data.lot.ai_prediction.confidence || 0) * 100)}%`} />
              )}
            </Card>

            <Card title={t('recycler')}>
              <Line label={t('nameLabel')} value={data.recycler?.name || '—'} />
              <Line label={t('facilityLabel')} value={data.recycler?.location || '—'} />
              <Line label={t('authorisationLabel')} value={data.recycler?.authorization_id || '—'} />
              <Line label={t('statusLabel')} value={data.recycler?.authorization_status || '—'} />
              <Line label={t('matchScoreLabel')} value={data.lot.match_score ? `${data.lot.match_score}%` : '—'} />
              <Line label={t('quotedLabel')} value={data.transaction ? rupee(data.transaction.quoted_price) : '—'} />
            </Card>

            <Card title={t('handoverPaymentLabel')}>
              <Line label={t('handoverRef')} value={data.handover?.reference_number || '—'} />
              <Line label={t('verifiedAtLabel')} value={formatDate(data.handover?.timestamp)} />
              <Line label={t('gpsLabel')} value={data.handover?.gps_location || '—'} />
              <Line label={t('handoverPointLabel')} value={data.transaction?.handover_location || '—'} />
              <Line label={t('paymentLabel')} value={data.payment ? `${rupee(data.payment.amount)} · ${data.payment.mode.toUpperCase()}` : '—'} />
              <Line label={t('paymentStatusLabel')} value={data.transaction?.payment_status || '—'} />
            </Card>
          </div>

          {data.transaction?.anomaly_flag && <Notice tone="warn">⚠️ {data.transaction.anomaly_reason}</Notice>}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="plate p-4">
              <div className="eyebrow mb-3">{t('timeline')}</div>
              <Timeline events={data.timeline || []} />
            </div>
            <MapView
              height={320}
              center={[data.lot.latitude, data.lot.longitude]}
              zoom={11}
              points={[
                { name: 'Collection point', lat: data.lot.latitude, lng: data.lot.longitude, kind: 'me', detail: data.lot.location },
                ...(data.recycler
                  ? [{ name: data.recycler.name, lat: data.recycler.latitude, lng: data.recycler.longitude, kind: 'recycler', detail: data.recycler.location }]
                  : []),
              ]}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="plate p-4">
      <div className="eyebrow mb-2">{title}</div>
      <dl className="space-y-1 text-sm">{children}</dl>
    </div>
  )
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-ink/15 pb-1 last:border-0">
      <dt className="text-slate2">{label}</dt>
      <dd className="num text-right font-semibold">{value ?? '—'}</dd>
    </div>
  )
}

function Fact({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="num font-bold">{value}</div>
    </div>
  )
}
