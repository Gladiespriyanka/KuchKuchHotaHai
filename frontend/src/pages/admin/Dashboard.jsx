import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { admin } from '../../services/api'
import { CategoryBar, MonthlyBars, PriceLine, StatusPie } from '../../components/Charts'
import { Loading, Notice, Stat, rupee } from '../../components/ui'

export default function AdminDashboard() {
  const { t } = useI18n()
  const [stats, setStats] = useState(null)
  const [charts, setCharts] = useState(null)
  const [material, setMaterial] = useState('PCB')
  const [error, setError] = useState('')

  useEffect(() => {
    const load = () => {
      admin.stats().then((d) => { setStats(d); setError('') }).catch((e) => setError(e.message))
      admin.charts().then(setCharts).catch((e) => setError(e.message))
    }
    load()
    const timer = setInterval(load, 8000)
    return () => clearInterval(timer)
  }, [])

  if (error && (!stats || !charts)) return <Notice tone="warn">{error}</Notice>
  if (!stats || !charts) return <Loading />
  const trendKeys = Object.keys(charts.price_trends || {})

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">{t('overview')}</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('registeredCollectors')} value={stats.collectors} />
        <Stat label={t('authorisedRecyclers')} value={stats.authorized_recyclers}
              sub={`${stats.pending_recyclers} pending`} tone="board" />
        <Stat label={t('totalLots')} value={stats.total_lots} />
        <Stat label={t('ewasteCollected')} value={`${stats.total_tons} t`} sub={`${stats.total_kg} kg`} />
        <Stat label={t('formalTransactions')} value={stats.formal_transactions} />
        <Stat label={t('totalValue')} value={rupee(stats.total_value)} tone="brass" />
        <Stat label={t('pendingTransactions')} value={stats.pending_transactions} />
        <Stat label={t('anomalies')} value={stats.anomalies} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('materialMix')}>
          <CategoryBar data={charts.material_distribution} xKey="category" yKey="kg" unit=" kg" />
        </Panel>
        <Panel title={t('monthlyCollection')}>
          <MonthlyBars data={charts.monthly} />
        </Panel>
        <Panel title={t('paymentStatus')}>
          <StatusPie data={charts.payment_status} />
        </Panel>
        <Panel
          title={t('priceTrends')}
          action={
            <select className="border-2 border-ink bg-white px-2 py-1 text-sm"
                    value={material} onChange={(e) => setMaterial(e.target.value)}>
              {trendKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          }
        >
          <PriceLine data={charts.price_trends[material] || []} />
        </Panel>
      </div>

      <p className="text-center text-[11px] text-slate2">
        {t('figuresNote')}
      </p>
    </div>
  )
}

function Panel({ title, action, children }) {
  return (
    <section className="plate p-3">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="eyebrow">{title}</h2>
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </section>
  )
}
