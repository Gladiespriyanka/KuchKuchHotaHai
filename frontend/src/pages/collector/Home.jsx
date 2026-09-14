import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Calculator, Coins, Download, Package, Receipt, Recycle, Wallet } from 'lucide-react'
import { useI18n } from '../../i18n'
import { catalog } from '../../services/api'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { getCache, putCache } from '../../offline/db'
import { RateBoard, SpeakButton } from '../../components/ui'
import { priceSentence } from '../../services/voice'

const TILES = [
  { to: '/app/new', key: 'sellEwaste', icon: Package, tone: 'bg-board text-white' },
  { to: '/app/prices', key: 'todaysPrices', icon: Coins, tone: 'bg-brass text-ink' },
  { to: '/app/recyclers', key: 'findRecycler', icon: Recycle, tone: 'bg-white' },
  { to: '/app/earnings', key: 'myEarnings', icon: Wallet, tone: 'bg-white' },
  { to: '/app/lots', key: 'myLots', icon: Receipt, tone: 'bg-white' },
  { to: '/app/estimate', key: 'estimator', icon: Calculator, tone: 'bg-brass text-ink' },
  { to: '/app/safety', key: 'safety', icon: AlertTriangle, tone: 'bg-copper text-white' },
]

export default function Home() {
  const { t, lang } = useI18n()
  const user = useCurrentUser()
  const [board, setBoard] = useState([])
  const [installer, setInstaller] = useState(null)

  useEffect(() => {
    let alive = true
    getCache('price-board').then((cached) => {
      if (alive && cached && !board.length) setBoard(cached)
    })
    catalog.prices().then((rows) => {
      if (!alive) return
      setBoard(rows)
      putCache('price-board', rows)
    }).catch(() => {})
    const onPrompt = (e) => { e.preventDefault(); setInstaller(e) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => { alive = false; window.removeEventListener('beforeinstallprompt', onPrompt) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const top = board.slice(0, 4)
  const spoken = top
    .map((r) => priceSentence({ category: r.category, min: r.min_price, max: r.max_price, trend: r.trend }, lang))
    .join(' ')

  const grid = TILES.slice(0, 6)
  const safetyTile = TILES.find((tile) => tile.key === 'safety')

  return (
    // Mobile: plain stacked flow, same order as before (heading, cards, rate
    // board, installer, note). Desktop: a real grid — the rate board is
    // pinned to column 2 spanning the full row height, so it sits beside the
    // cards instead of underneath them, without reordering the mobile DOM.
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="font-display text-3xl leading-none lg:text-[2.5rem]">
            {t('greeting')}{user?.name ? `, ${user.name}` : ''} 👋
          </div>
          <div className="mt-1 text-sm text-slate2 lg:mt-2 lg:text-base">
            <Link to="/app/profile" className="underline">{user?.name ?? '—'}</Link>
            {user?.location ? ` · ${user.location}` : ''}
          </div>
        </div>
        {top.length > 0 && <SpeakButton text={spoken} />}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        {grid.map(({ to, key, icon: Icon, tone }) => (
          <Link key={key} to={to} className={`tile min-h-[112px] ${tone} lg:min-h-[160px] lg:p-6`}>
            <Icon size={30} strokeWidth={2.2} />
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className="text-[17px] font-bold leading-tight">{t(key)}</span>
              <ArrowRight size={16} strokeWidth={2.5} className="hidden shrink-0 opacity-50 lg:block" />
            </div>
          </Link>
        ))}

        {safetyTile && (
          <Link
            to={safetyTile.to}
            className={`tile min-h-[112px] ${safetyTile.tone} lg:col-span-3 lg:min-h-0 lg:flex-row lg:items-center lg:gap-4 lg:p-6`}
          >
            <safetyTile.icon size={30} strokeWidth={2.2} />
            <div className="mt-2 flex flex-1 items-end justify-between gap-2 lg:mt-0 lg:items-center">
              <span className="text-[17px] font-bold leading-tight lg:text-xl">{t(safetyTile.key)}</span>
              <ArrowRight size={18} strokeWidth={2.5} className="hidden shrink-0 opacity-70 lg:block" />
            </div>
          </Link>
        )}
      </div>

      {top.length > 0 && (
        <div className="lg:sticky lg:top-8 lg:col-start-2 lg:[grid-row:1/span_12]">
          <RateBoard rows={top} moreTo="/app/prices" />
        </div>
      )}

      {installer && (
        <button
          type="button"
          className="btn-ghost w-full lg:w-auto"
          onClick={() => { installer.prompt(); setInstaller(null) }}
        >
          <Download size={18} /> {t('installApp')}
        </button>
      )}

      <p className="pb-2 text-center text-[11px] text-slate2 lg:text-left">
        {t('demoDataNote')}
      </p>
    </div>
  )
}
