import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { admin } from '../../services/api'
import MapView from '../../components/MapView'
import { Loading, Notice, StatusChip, formatDate, rupee } from '../../components/ui'

export function Verification() {
  const { t } = useI18n()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const load = () => admin.recyclers().then(setRows).catch((e) => { setError(e.message); setRows([]) })
  useEffect(() => { load() }, [])

  async function decide(id, decision) {
    setBusy(id)
    try {
      await admin.verifyRecycler(id, decision)
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (error) return <Notice tone="warn">{error}</Notice>
  if (!rows) return <Loading />
  const pending = rows.filter((r) => r.authorization_status === 'pending')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl">{t('verification')}</h1>
        <p className="text-sm text-slate2">
          {t('verificationIntro')}
        </p>
      </div>

      {pending.length > 0 && (
        <section>
          <h2 className="eyebrow mb-2">{t('pendingLabel')} ({pending.length})</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {pending.map((r) => (
              <div key={r.recycler_id} className="plate-lg p-4">
                <div className="font-display text-xl">{r.name}</div>
                <div className="text-sm text-slate2">{r.location}</div>
                <dl className="mt-2 space-y-1 text-sm">
                  <Line label={t('authorisationId')} value={r.authorization_id} />
                  <Line label={t('materialsLabel')} value={r.accepted_materials.join(', ')} />
                  <Line label={t('contactLabel')} value={r.contact} />
                  <Line label={t('documents')} value={r.documents_note || 'Demo document set'} />
                </dl>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn-primary py-2" disabled={busy === r.recycler_id}
                          onClick={() => decide(r.recycler_id, 'approved')}>
                    <Check size={16} /> {t('approve')}
                  </button>
                  <button className="btn-ghost py-2" disabled={busy === r.recycler_id}
                          onClick={() => decide(r.recycler_id, 'rejected')}>
                    <X size={16} /> {t('reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="eyebrow mb-2">{t('allRecyclers')}</h2>
        <Table
          head={[t('nameLabel'), t('locationLabel'), t('authorisationLabel'), t('materialsLabel'), t('pickupLabel'), t('statusLabel'), '']}
          rows={rows.map((r) => [
            r.name,
            r.location,
            <span className="num">{r.authorization_id}</span>,
            r.accepted_materials.length,
            r.pickup_available ? '🚚' : '—',
            <span className={`chip ${r.authorization_status === 'approved' ? 'bg-board text-white'
              : r.authorization_status === 'pending' ? 'bg-brass' : 'bg-copper text-white'}`}>
              {r.authorization_status}
            </span>,
            r.authorization_status === 'approved' ? (
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => decide(r.recycler_id, 'rejected')}>
                {t('reject')}
              </button>
            ) : (
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => decide(r.recycler_id, 'approved')}>
                {t('approve')}
              </button>
            ),
          ])}
        />
      </section>
    </div>
  )
}

export function Monitoring() {
  const { t } = useI18n()
  const [txns, setTxns] = useState(null)
  const [anomalies, setAnomalies] = useState([])
  const [prices, setPrices] = useState([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    admin.transactions().then(setTxns).catch((e) => { setLoadError(e.message); setTxns([]) })
    admin.anomalies().then(setAnomalies).catch(() => {})
    admin.prices().then(setPrices).catch(() => {})
  }, [])

  if (loadError) return <Notice tone="warn">{loadError}</Notice>
  if (!txns) return <Loading />

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-display text-2xl">{t('anomalies')}</h1>
        <p className="mb-3 text-sm text-slate2">
          {t('anomalyIntro')}
        </p>
        {anomalies.length === 0 ? (
          <Notice>{t('anomalyNone')}</Notice>
        ) : (
          <div className="space-y-2">
            {anomalies.map((a) => (
              <div key={a.transaction_id} className="border-2 border-copper bg-brass/15 p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="num font-bold">{a.lot_id}</span>
                  <span className="chip bg-copper text-white">⚠️ {a.material}</span>
                  <span className="num ml-auto font-bold">₹{a.rate}/kg</span>
                </div>
                <p className="mt-1 text-sm">{a.reason}</p>
                <p className="num mt-1 text-xs text-slate2">
                  {a.recycler} · {a.final_weight} kg · {rupee(a.final_price)} · {formatDate(a.at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl">{t('transactions')}</h2>
        <Table
          head={[t('lotId'), t('materialLabel'), t('collector'), t('recycler'), t('quotedLabel'), t('finalPriceLabel'), t('paymentLabel'), t('statusLabel')]}
          rows={txns.slice(0, 60).map((x) => [
            <span className="num">{x.lot_id}</span>,
            x.material,
            x.collector,
            x.recycler,
            <span className="num">{rupee(x.quoted_price)}</span>,
            <span className="num">{x.final_price ? rupee(x.final_price) : '—'}</span>,
            <StatusChip status={x.payment_status} />,
            <span className="text-xs">{x.transaction_status}{x.anomaly_flag ? ' ⚠️' : ''}</span>,
          ])}
        />
      </section>

      <section>
        <h2 className="font-display text-xl">{t('priceData')}</h2>
        <p className="mb-2 text-sm text-slate2">
          {t('priceDataIntro')}
        </p>
        <Table
          head={[t('materialLabel'), t('locationLabel'), `${t('rateLabel')} ₹/kg`, `${t('quotedLabel')} ₹/kg`, t('dateLabel'), t('sourceDataLabel')]}
          rows={prices.slice(0, 40).map((p) => [
            p.material_category,
            p.location,
            <span className="num">{p.buying_price}</span>,
            <span className="num">{p.selling_price}</span>,
            <span className="num">{formatDate(p.date)}</span>,
            <span className={`chip ${p.source === 'recycler_update' ? 'bg-brass' : 'bg-white'}`}>{p.source}</span>,
          ])}
        />
      </section>
    </div>
  )
}

export function MapPage() {
  const { t } = useI18n()
  const [data, setData] = useState(null)
  const [mapError, setMapError] = useState('')
  useEffect(() => {
    admin.map().then(setData).catch((e) => { setMapError(e.message); setData({ recyclers: [], lots: [] }) })
  }, [])
  if (mapError) return <Notice tone="warn">{mapError}</Notice>
  if (!data) return <Loading />

  const points = [
    ...data.recyclers.map((r) => ({
      name: r.name, lat: r.lat, lng: r.lng, kind: 'recycler',
      detail: `${r.location} · ${r.status}`,
    })),
    ...data.lots.map((l) => ({
      name: l.name, lat: l.lat, lng: l.lng, kind: 'lot', detail: `${l.material} · ${l.status}`,
    })),
  ]

  return (
    <div className="space-y-3">
      <h1 className="font-display text-2xl">{t('collectionPoints')}</h1>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="chip bg-board text-white">♻️ Recyclers · {data.recyclers.length}</span>
        <span className="chip bg-copper text-white">📍 Lots · {data.lots.length}</span>
      </div>
      <MapView points={points} height={520} zoom={10} />
      <p className="text-[11px] text-slate2">
        Leaflet with OpenStreetMap tiles. Locations are fictional demo coordinates around Jaipur.
      </p>
    </div>
  )
}

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto border-2 border-ink bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-mint text-left">
          <tr className="border-b-2 border-ink">
            {head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-ink/10">
              {cells.map((cell, j) => <td key={j} className="px-3 py-2">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate2">{label}</dt>
      <dd className="num text-right font-semibold">{value}</dd>
    </div>
  )
}
