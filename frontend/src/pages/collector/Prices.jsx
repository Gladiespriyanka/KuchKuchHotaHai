import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { catalog } from '../../services/api'
import { getCache, putCache } from '../../offline/db'
import { PriceLine } from '../../components/Charts'
import { Loading, Notice, RateBoard, SpeakButton, Trend } from '../../components/ui'
import { priceSentence } from '../../services/voice'

export default function Prices() {
  const { t, tMaterial, lang } = useI18n()
  const [board, setBoard] = useState([])
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState([])
  const [cached, setCached] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    getCache('price-board').then((rows) => {
      if (rows?.length) { setBoard(rows); setCached(true) }
    })
    catalog.prices()
      .then((rows) => {
        setBoard(rows || [])
        setCached(false)
        setError('')
        if (rows?.length) putCache('price-board', rows)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selected) return
    catalog.history(selected).then(setHistory).catch(() => setHistory([]))
  }, [selected])

  const row = board.find((b) => b.category === selected)

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">{t('todaysPrices')}</h1>
      {error && <Notice tone="warn">{error}</Notice>}
      {cached && <Notice tone="warn">{t('offline')} — showing the last saved rates.</Notice>}
      {/* Four distinct states. The old code rendered <Loading /> whenever the
          board was empty, so an empty or failed response looked identical to
          "still loading" and the screen hung there forever. */}
      {loading && board.length === 0 ? (
        <Loading />
      ) : board.length > 0 ? (
        <RateBoard rows={board} onSelect={setSelected} />
      ) : error ? (
        <div className="plate p-4 text-center">
          <p className="font-semibold">{t('ratesUnavailable')}</p>
          <p className="mt-1 text-sm text-slate2">{error}</p>
          <button className="btn-primary mt-3" onClick={load}>{t('retry')}</button>
        </div>
      ) : (
        <div className="plate p-4 text-center">
          <p className="font-semibold">{t('ratesEmpty')}</p>
          <p className="mt-1 text-sm text-slate2">{t('ratesEmptyHint')}</p>
          <button className="btn-ghost mt-3" onClick={load}>{t('retry')}</button>
        </div>
      )}
      <p className="text-center text-xs text-slate2">{t('selectMaterialForChart')}</p>

      {row && (
        <div className="plate-lg p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-display text-xl">{row.icon} {tMaterial(row.category)}</div>
              <div className="num mt-1 text-3xl font-bold text-board">
                ₹{row.min_price}–{row.max_price}
                <span className="text-sm font-semibold text-slate2">/{t('perKg')}</span>
              </div>
              <div className="mt-1"><Trend trend={row.trend} /> <span className="num text-xs text-slate2">({row.change_pct > 0 ? '+' : ''}{row.change_pct}%)</span></div>
            </div>
            <SpeakButton
              text={priceSentence(
                { category: row.category, min: row.min_price, max: row.max_price, trend: row.trend },
                lang
              )}
            />
          </div>
          <div className="mt-4">
            <div className="eyebrow mb-1">{t('priceHistory')}</div>
            {history.length ? <PriceLine data={history} /> : <Loading />}
          </div>
        </div>
      )}

      <p className="pb-2 text-center text-[11px] text-slate2">
        Indicative ranges from recorded prototype data — not a guaranteed selling price.
      </p>
    </div>
  )
}
