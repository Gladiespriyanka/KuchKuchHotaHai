import { useEffect, useMemo, useState } from 'react'
import { Calculator, Info, TrendingUp } from 'lucide-react'
import { useI18n } from '../../i18n'
import { scrap } from '../../services/api'
import { Loading, Notice, SpeakButton, rupee } from '../../components/ui'

const QUALITY = ['clean', 'mixed', 'dirty', 'damaged']
const LOCALITIES = [
  'Jaipur', 'Malviya Nagar', 'Vaishali Nagar', 'Mansarovar', 'C-Scheme',
  'Raja Park', 'Tonk Road', 'Sodala', 'Gopalpura', 'Durgapura', 'MI Road',
]

/**
 * Smart Scrap Value Estimator.
 *
 * Anchored on the published Jaipur reference rates; the ML layer only adjusts
 * for locality, quality and quantity. The screen always shows BOTH the
 * published rate and the estimate, so the collector can see what moved and by
 * how much rather than being handed an unexplained number.
 */
export default function Estimate() {
  const { t, lang } = useI18n()
  const [catalogue, setCatalogue] = useState(null)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('Plastic')
  const [material, setMaterial] = useState('')
  const [quantity, setQuantity] = useState('')
  const [locality, setLocality] = useState('Jaipur')
  const [quality, setQuality] = useState('mixed')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    scrap.materials().then(setCatalogue).catch((e) => setError(e.message))
  }, [])

  const items = useMemo(
    () => (catalogue?.items ?? []).filter((i) => i.category === category),
    [catalogue, category]
  )
  const selected = items.find((i) => i.material === material)

  useEffect(() => { setMaterial(''); setResult(null) }, [category])

  async function estimate() {
    setBusy(true)
    setError('')
    try {
      setResult(await scrap.predict({
        category, material, quantity: Number(quantity), unit: selected?.unit,
        locality, quality,
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !catalogue) return <Notice tone="warn">{error}</Notice>
  if (!catalogue) return <Loading />

  const spoken = result && (lang === 'hi'
    ? `${result.quantity} ${result.unit} ${result.material} की अनुमानित कीमत ${result.estimated_value} रुपये है।`
    : lang === 'mr'
      ? `${result.quantity} ${result.unit} ${result.material} ची अंदाजे किंमत ${result.estimated_value} रुपये आहे.`
      : `${result.quantity} ${result.unit} of ${result.material} is worth about ${result.estimated_value} rupees.`)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl">🧮 {t('estimatorTitle')}</h1>
        <p className="text-sm text-slate2">{t('estimatorIntro')}</p>
      </div>

      {/* category */}
      <div className="grid grid-cols-2 gap-2">
        {catalogue.categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)}
                  className={`tile items-center py-3 ${category === c ? 'bg-board text-white' : 'bg-white'}`}>
            <span className="w-full text-center font-bold">{c === 'Plastic' ? `♻️ ${c}` : `🔌 ${c}`}</span>
          </button>
        ))}
      </div>

      {/* material — doubles as Smart Material Recommendation: highest paying first */}
      <div>
        <div className="eyebrow mb-1">{t('estimatorPickItem')}</div>
        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {items.map((i) => (
            <button
              key={i.material}
              onClick={() => { setMaterial(i.material); setResult(null) }}
              className={`plate flex w-full items-center gap-2 p-2.5 text-left ${
                material === i.material ? 'bg-board text-white' : 'bg-white'
              }`}
            >
              <span className="min-w-0 flex-1 truncate font-semibold">{i.material}</span>
              <span className="num whitespace-nowrap font-bold">
                {i.buys ? `₹${i.reference_rate}/${i.unit}` : t('estimatorNoPay')}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <>
          <div className="plate-lg p-4">
            <label className="eyebrow" htmlFor="qty">
              {t('estimatorQuantity')} ({selected.unit})
            </label>
            <input
              id="qty" type="number" inputMode="decimal" min="0.1" step="0.1"
              value={quantity} onChange={(e) => setQuantity(e.target.value)}
              className="num mt-1 w-full border-2 border-ink bg-transparent px-3 py-3 text-3xl font-bold outline-none"
              placeholder={selected.unit === 'kg' ? '8' : '2'}
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="eyebrow" htmlFor="loc">{t('estimatorLocality')}</label>
                <select id="loc" className="field mt-1 py-2" value={locality}
                        onChange={(e) => setLocality(e.target.value)}>
                  {LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="eyebrow" htmlFor="qual">{t('estimatorQuality')}</label>
                <select id="qual" className="field mt-1 py-2" value={quality}
                        onChange={(e) => setQuality(e.target.value)}>
                  {QUALITY.map((q) => <option key={q} value={q}>{t(`quality_${q}`)}</option>)}
                </select>
              </div>
            </div>

            <button className="btn-primary mt-4 w-full text-lg"
                    disabled={busy || !(Number(quantity) > 0)} onClick={estimate}>
              <Calculator size={20} /> {t('estimatorGo')}
            </button>
          </div>

          {error && <Notice tone="warn">{error}</Notice>}

          {result && (
            <div className="border-[3px] border-ink bg-boardDark p-4 shadow-plate text-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="eyebrow text-brass">{t('estimatorResult')}</div>
                  <div className="mt-1 text-lg font-semibold">
                    {result.material} · <span className="num">{result.quantity} {result.unit}</span>
                  </div>
                </div>
                {spoken && <SpeakButton text={spoken} />}
              </div>

              <div className="num mt-3 text-5xl font-bold text-brass">
                {rupee(result.estimated_value)}
              </div>

              <dl className="mt-4 space-y-1 border-t border-white/15 pt-3 text-sm">
                <Row label={t('estimatorPublished')}
                     value={result.reference_rate == null ? '—' : `₹${result.reference_rate}/${result.unit}`} />
                <Row label={t('estimatorAdjusted')} value={`₹${result.predicted_rate}/${result.unit}`} />
                <Row label={t('estimatorLocality')} value={result.locality} />
                <Row label={t('estimatorQuality')} value={t(`quality_${result.quality}`)} />
              </dl>

              <p className="mt-3 flex gap-2 text-[11px] text-white/70">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>{result.confidence}. {result.disclaimer}</span>
              </p>
            </div>
          )}
        </>
      )}

      <div className="plate p-3">
        <div className="eyebrow mb-1 flex items-center gap-1">
          <TrendingUp size={13} /> {t('estimatorSource')}
        </div>
        <p className="text-[11px] text-slate2">{catalogue.note} {catalogue.source}</p>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-white/70">{label}</dt>
      <dd className="num font-semibold">{value}</dd>
    </div>
  )
}
