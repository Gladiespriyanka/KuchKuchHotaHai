import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { collector } from '../../services/api'
import { Empty, Loading, Notice, Stat, rupee, formatDate } from '../../components/ui'

export default function Earnings() {
  const { t, tMaterial } = useI18n()
  const [data, setData] = useState(null)

  const [error, setError] = useState('')

  useEffect(() => {
    collector.earnings().then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <Notice tone="warn">{error}</Notice>
  if (!data) return <Loading />

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">{t('myEarnings')}</h1>

      <div className="border-[3px] border-ink bg-boardDark p-4 shadow-plate">
        <div className="eyebrow text-brass">{t('totalEarnings')}</div>
        <div className="num mt-1 text-5xl font-bold text-brass">{rupee(data.total_earnings)}</div>
        <div className="num mt-1 text-sm text-white/60">{data.total_weight_kg} {t('kgSold')}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label={t('thisMonth')} value={rupee(data.this_month)} />
        <Stat label={t('pendingAmount')} value={rupee(data.pending)} tone="brass" />
      </div>

      <div>
        <div className="eyebrow mb-2">{t('transactions')}</div>
        {data.transactions.length === 0 ? (
          <Empty title={t('transactions')} body={t('noTransactions')} />
        ) : (
          <div className="space-y-2">
            {data.transactions.map((row) => (
              <div key={row.lot_id} className="plate flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{tMaterial(row.material)}</span>
                  <span className="num block text-xs text-slate2">
                    {row.lot_id} · {row.weight} kg · {formatDate(row.date)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="num block text-lg font-bold">{rupee(row.amount)}</span>
                  <span className={`chip mt-0.5 ${row.payment_status === 'PAID' ? 'bg-board text-white' : 'bg-brass'}`}>
                    {row.payment_status === 'PAID' ? `✅ ${t('paid')}` : `⏳ ${t('pending')}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
