import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Check, ChevronLeft, Gavel, ImageUp, MapPin, Mic, Sparkles, X } from 'lucide-react'
import { MATERIAL_NAMES, useI18n } from '../../i18n'
import { catalog, lots as lotsApi } from '../../services/api'
import { saveDraft } from '../../offline/db'
import { useGeolocation } from '../../hooks/useGeolocation'
import CameraCapture from '../../components/CameraCapture'
import VoiceLot from '../../components/VoiceLot'
import { fileToDataUrl, preferredCameraMode } from '../../utils/camera'
import { Loading, NextButton, Notice, SpeakButton, Trend, rupee } from '../../components/ui'
import { valueSentence } from '../../services/voice'

// 'Other' is manual-only: the classifier never proposes it.
const CATEGORIES = Object.keys(MATERIAL_NAMES)
const ICONS = {
  PCB: '🔌', Cable: '🔗', Battery: '🔋', 'LCD/LED panel': '🖥️', CRT: '📺',
  'Motor & magnet-bearing': '⚙️', 'Mixed plastic': '♻️',
}
const CONDITIONS = ['good', 'damaged', 'mixed']  // dataset also uses intact/broken/partial
const SOURCES = ['household', 'commercial', 'industrial', 'scrap_collection']
const STEPS = 6

export default function NewLot() {
  const { t, tMaterial, lang } = useI18n()
  const navigate = useNavigate()
  const { coords, state: gpsState, request: askGps } = useGeolocation()
  const fileRef = useRef(null)      // gallery picker
  const captureRef = useRef(null)   // native camera intent
  const [cameraOpen, setCameraOpen] = useState(false)   // desktop live preview
  const [pendingPhoto, setPendingPhoto] = useState('')  // awaiting confirm
  const [photoSource, setPhotoSource] = useState('camera')
  const [photoError, setPhotoError] = useState('')
  const [voiceOpen, setVoiceOpen] = useState(false)

  const [step, setStep] = useState(1)
  const [photo, setPhoto] = useState('')
  const [prediction, setPrediction] = useState(null)
  const [analysing, setAnalysing] = useState(false)
  const [category, setCategory] = useState('')
  const [weight, setWeight] = useState('')
  const [condition, setCondition] = useState('good')
  const [source, setSource] = useState('household')
  const [estimate, setEstimate] = useState(null)
  const [auctionOn, setAuctionOn] = useState(false)
  const [auctionMinutes, setAuctionMinutes] = useState(10)
  const [busy, setBusy] = useState(false)
  const [savedOffline, setSavedOffline] = useState(false)
  const [error, setError] = useState('')

  const numericWeight = Number(weight)
  const canContinue = useMemo(() => {
    if (step === 1) return true
    if (step === 2) return Boolean(prediction) || Boolean(category)
    if (step === 3) return Boolean(category)
    if (step === 4) return numericWeight > 0 && numericWeight <= 5000
    return true
  }, [step, prediction, category, numericWeight])

  async function analyse(dataUrl) {
    setPhoto(dataUrl)
    setPrediction(null)
    setCategory('')
    setAnalysing(true)
    setStep(2)
    try {
      const result = await catalog.classify(dataUrl)
      setPrediction(result)
      // Only pre-select when the classifier actually named a material.
      if (result.verdict === 'E_WASTE' && result.category) setCategory(result.category)
    } catch (err) {
      setPrediction({ error: err.message })
    } finally {
      setAnalysing(false)
    }
  }

  /**
   * Both the camera and the gallery land here. One entry point, so the same
   * validation and the same classifier apply to both — there is no separate
   * camera path.
   */
  async function onFileChosen(event, source) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-picking the same file
    if (!file) {
      // The user backed out of the camera app, or it returned nothing.
      setPhotoError(t('noPhotoReturned'))
      return
    }
    setPhotoError('')
    setPhotoSource(source)
    try {
      setPendingPhoto(await fileToDataUrl(file))
    } catch {
      setPhotoError(t('noPhotoReturned'))
    }
  }

  /**
   * "Take Photo". Opens the in-app live camera where that works (laptops and
   * phones on https/localhost), otherwise hands off to the device camera app.
   */
  function takePhoto() {
    setPhotoError('')
    setPhotoSource('camera')
    if (preferredCameraMode() === 'live') setCameraOpen(true)
    else captureRef.current?.click()
  }

  /**
   * The live camera could not start.
   *
   * Do NOT auto-open the file picker here. Yanking open a gallery dialog the
   * user did not ask for looks like the camera silently "became" the gallery,
   * and it hides the actual problem (usually a permission that was denied
   * once and is now remembered, so the browser never prompts again).
   * Show what went wrong and let the user choose the next step.
   */
  function handleCameraUnavailable(message) {
    setCameraOpen(false)
    setPhotoError(message)
  }

  function retake() {
    setPendingPhoto('')
    setPhotoError('')
    if (photoSource === 'gallery') fileRef.current?.click()
    else takePhoto()
  }

  async function goToEstimate() {
    setBusy(true)
    setError('')
    try {
      const result = await catalog.estimate({
        category, weight: numericWeight, condition, source_type: source,
      })
      setEstimate(result)
      setStep(6)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function createLot() {
    setBusy(true)
    setError('')
    const payload = {
      material_category: category,
      weight: numericWeight,
      condition,
      source_type: source,
      photo,
      description: '',
      ai_prediction: prediction || {},
      // Approximate collection point; falls back to the registered area.
      latitude: coords?.latitude || 0,
      longitude: coords?.longitude || 0,
      auction_minutes: auctionOn ? auctionMinutes : null,
    }
    if (!navigator.onLine) {
      await saveDraft(payload)
      setSavedOffline(true)
      setBusy(false)
      return
    }
    try {
      const lot = await lotsApi.create(payload)
      // An auction lot takes bids automatically — the manual "choose a
      // recycler" screen doesn't apply to it, so go straight to the lot's
      // own page where the live bids and countdown show up.
      navigate(auctionOn ? `/app/lots/${lot.lot_id}` : `/app/lots/${lot.lot_id}/match`)
    } catch (err) {
      await saveDraft(payload)
      setSavedOffline(true)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (savedOffline) {
    return (
      <div className="space-y-4">
        <Notice tone="warn">{t('draftSaved')}</Notice>
        <button className="btn-primary w-full" onClick={() => navigate('/app')}>{t('back')}</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {step > 1 && (
          <button className="btn-ghost px-2 py-2" onClick={() => setStep(step - 1)} aria-label={t('back')}>
            <ChevronLeft size={18} />
          </button>
        )}
        <span className="font-display text-2xl">{t('newLot')}</span>
        <span className="num ml-auto text-sm text-slate2">{t('step')} {Math.min(step, STEPS)}/{STEPS}</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className={`h-2 flex-1 border-2 border-ink ${i < step ? 'bg-board' : 'bg-white'}`} />
        ))}
      </div>

      {/* 1 — photo (or say the whole lot in one sentence) */}
      {step === 1 && (
        <div className="space-y-3">
          {voiceOpen ? (
            <VoiceLot
              onClose={() => setVoiceOpen(false)}
              onConfirm={async (material, kg) => {
                // Voice already carries material + weight; go straight to the
                // price step. Condition and source keep their defaults.
                setVoiceOpen(false)
                setCategory(material)
                setWeight(String(kg))
                setPrediction(null)
                setBusy(true)
                try {
                  const result = await catalog.estimate({
                    category: material, weight: kg,
                    condition: 'good', source_type: 'household',
                  })
                  setEstimate(result)
                  setStep(6)
                } catch (err) {
                  setError(err.message)
                } finally {
                  setBusy(false)
                }
              }}
            />
          ) : (
            <button className="btn-primary w-full py-4 text-lg" data-testid="voice-open"
                    onClick={() => setVoiceOpen(true)}>
              <Mic size={24} /> {t('voiceSell')}
            </button>
          )}
          {!voiceOpen && (
            <p className="text-center text-xs text-slate2">{t('voiceOrTap')}</p>
          )}
          <p className="font-display text-xl">{t('photo')}</p>
          {/* Native camera intent — the phone's own camera app. */}
          <input
            ref={captureRef} type="file" accept="image/*" capture="environment"
            className="hidden" data-testid="camera-input"
            onChange={(e) => onFileChosen(e, 'camera')}
          />
          {/* Gallery picker — unchanged behaviour. */}
          <input
            ref={fileRef} type="file" accept="image/*"
            className="hidden" data-testid="gallery-input"
            onChange={(e) => onFileChosen(e, 'gallery')}
          />

          {cameraOpen ? (
            <CameraCapture
              onCapture={(dataUrl) => { setCameraOpen(false); setPendingPhoto(dataUrl) }}
              onCancel={() => setCameraOpen(false)}
              onUnavailable={handleCameraUnavailable}
            />
          ) : pendingPhoto ? (
            /* Preview and confirm before anything is classified. */
            <div className="space-y-3">
              <p className="eyebrow">{t('photoPreview')}</p>
              <img src={pendingPhoto} alt="" data-testid="photo-preview"
                   className="w-full border-2 border-ink object-cover" />
              <button className="btn-primary w-full text-lg" data-testid="use-photo"
                      onClick={() => { const p = pendingPhoto; setPendingPhoto(''); analyse(p) }}>
                <Check size={20} /> {t('usePhoto')}
              </button>
              <button className="btn-ghost w-full py-3" data-testid="retake" onClick={retake}>
                <Camera size={18} /> {t('retakePhoto')}
              </button>
            </div>
          ) : (
            <>
              {photo ? (
                <img src={photo} alt="" className="w-full border-2 border-ink object-cover" />
              ) : (
                <div className="flex h-48 items-center justify-center border-2 border-dashed border-ink/40 bg-white">
                  <Camera size={44} strokeWidth={1.5} className="text-slate2" />
                </div>
              )}
              {photoError && (
                <div className="border-2 border-copper bg-brass/15 p-3">
                  <p className="text-sm">{photoError}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" className="btn-ghost justify-center py-2 text-sm"
                            onClick={() => { setPhotoError(''); takePhoto() }}>
                      <Camera size={15} /> {t('cameraRetry')}
                    </button>
                    <button type="button" className="btn-ghost justify-center py-2 text-sm"
                            onClick={() => { setPhotoError(''); fileRef.current?.click() }}>
                      <ImageUp size={15} /> {t('uploadPhoto')}
                    </button>
                  </div>
                </div>
              )}
              <button className="btn-primary w-full text-lg" data-testid="take-photo" onClick={takePhoto}>
                <Camera size={22} /> {t('takePhoto')}
              </button>
              <button className="btn-ghost w-full py-3" data-testid="gallery-button"
                      onClick={() => { setPhotoError(''); fileRef.current?.click() }}>
                <ImageUp size={20} /> {t('uploadPhoto')}
              </button>
            </>
          )}
          <button className="w-full py-2 text-sm font-semibold underline" onClick={() => setStep(3)}>
            {t('chooseMaterial')} →
          </button>
        </div>
      )}

      {/* 2 — AI suggestion */}
      {step === 2 && (
        <div className="space-y-3">
          {photo && <img src={photo} alt="" className="h-40 w-full border-2 border-ink object-cover" />}
          {analysing ? (
            <Loading label={t('aiChecking')} />
          ) : prediction?.error ? (
            <div className="space-y-3">
              <Notice tone="warn">{prediction.error}</Notice>
              <button className="btn-ghost w-full py-3" onClick={() => setStep(1)}>{t('tryAgain')}</button>
              <button className="btn-primary w-full" onClick={() => setStep(3)}>{t('chooseAnyway')}</button>
            </div>
          ) : prediction && (prediction.verdict === 'NOT_E_WASTE' || !prediction.category) ? (
            /* The classifier declined: it is not e-waste, or it is not sure.
               Never pre-fill a guess here — ask instead. */
            <div className="plate-lg border-copper p-4">
              <div className="font-display text-2xl">
                {prediction.verdict === 'NOT_E_WASTE' ? `⚠️ ${t('notEwaste')}` : `🤔 ${t('lowConfidence')}`}
              </div>
              <p className="mt-2 text-sm leading-snug">{prediction.reason}</p>
              {prediction.detail && (
                <p className="mt-1 text-xs text-slate2">{prediction.detail}</p>
              )}
              {prediction.confidence > 0 && (
                <p className="num mt-2 text-xs text-slate2">
                  {t('confidence')}: {Math.round(prediction.confidence * 100)}%
                </p>
              )}
              <div className="mt-4 grid gap-2">
                <button className="btn-primary w-full text-lg" onClick={() => setStep(1)}>
                  <Camera size={18} /> {t('tryAgain')}
                </button>
                <button className="btn-ghost w-full py-3" onClick={() => setStep(3)}>
                  {t('chooseAnyway')}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-slate2">{prediction.note}</p>
              <p className="num mt-1 text-[10px] text-slate2/80">
                {t('checkedBy')}: {prediction.model_version}
              </p>
            </div>
          ) : prediction ? (
            <div className="plate-lg p-4">
              <VerdictBadge prediction={prediction} />
              <div className="eyebrow mt-2 flex items-center gap-1">
                <Sparkles size={13} /> {t('likelyMaterial')}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl">{ICONS[prediction.category]}</span>
                <span className="font-display text-3xl">{tMaterial(prediction.category)}</span>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-sm font-semibold">
                  <span>{t('confidence')}</span>
                  <span className="num">{Math.round(prediction.confidence * 100)}%</span>
                </div>
                <div className="mt-1 h-3 border-2 border-ink bg-white">
                  <div className="h-full bg-board" style={{ width: `${prediction.confidence * 100}%` }} />
                </div>
              </div>
              <p className="mt-3 text-xs text-slate2">{prediction.note}</p>
              <p className="num mt-1 text-[10px] text-slate2/80">
                {t('checkedBy')}: {prediction.model_version}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="btn-primary" onClick={() => { setCategory(prediction.category); setStep(4) }}>
                  <Check size={18} /> {t('correct')}
                </button>
                <button className="btn-ghost py-3" onClick={() => setStep(3)}>
                  <X size={18} /> {t('change')}
                </button>
              </div>
            </div>
          ) : (
            <Notice>{t('chooseMaterial')}</Notice>
          )}
        </div>
      )}

      {/* 3 — material */}
      {step === 3 && (
        <div className="space-y-3">
          <p className="font-display text-xl">{t('chooseMaterial')}</p>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => { setCategory(c); setStep(4) }}
                className={`tile min-h-[86px] ${category === c ? 'bg-board text-white' : 'bg-white'}`}
              >
                <span className="text-2xl">{ICONS[c]}</span>
                <span className="mt-1 text-sm font-bold leading-tight">{tMaterial(c)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4 — weight */}
      {step === 4 && (
        <div className="space-y-3">
          <p className="font-display text-xl">{t('weightKg')}</p>
          <div className="plate-lg flex items-center gap-3 p-4">
            <input
              type="number" inputMode="decimal" step="0.1" min="0.1" autoFocus
              value={weight} onChange={(e) => setWeight(e.target.value)}
              className="num w-full border-none bg-transparent text-5xl font-bold outline-none"
              placeholder="8.5"
            />
            <span className="font-display text-3xl text-slate2">kg</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 5, 10, 25].map((n) => (
              <button key={n} className="btn-ghost num justify-center py-3"
                      onClick={() => setWeight(String(Number(weight || 0) + n))}>
                +{n}
              </button>
            ))}
          </div>
          <button className="w-full py-1 text-sm font-semibold underline" onClick={() => setWeight('')}>
            reset
          </button>
          <NextButton disabled={!canContinue} onClick={() => setStep(5)}>{t('next')}</NextButton>
        </div>
      )}

      {/* 5 — condition + source */}
      {step === 5 && (
        <div className="space-y-4">
          <div>
            <p className="font-display text-xl">{t('condition')}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {CONDITIONS.map((c) => (
                <button key={c} onClick={() => setCondition(c)}
                        className={`tile items-center py-3 ${condition === c ? 'bg-board text-white' : 'bg-white'}`}>
                  <span className="w-full text-center font-bold">{t(c)}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="font-display text-xl">{t('source')}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SOURCES.map((s) => (
                <button key={s} onClick={() => setSource(s)}
                        className={`tile py-3 ${source === s ? 'bg-board text-white' : 'bg-white'}`}>
                  <span className="font-bold">{t(s)}</span>
                </button>
              ))}
            </div>
          </div>
          {error && <Notice tone="warn">{error}</Notice>}
          <NextButton disabled={busy} onClick={goToEstimate}>{t('next')}</NextButton>
        </div>
      )}

      {/* 6 — estimate + create */}
      {step === 6 && estimate && (
        <div className="space-y-3">
          <div className="border-[3px] border-ink bg-boardDark p-4 shadow-plate text-white">
            <div className="flex items-start justify-between">
              <div>
                <div className="eyebrow text-brass">{t('estimatedValue')}</div>
                <div className="num mt-1 text-4xl font-bold text-brass">
                  {rupee(estimate.estimated_min)} – {rupee(estimate.estimated_max)}
                </div>
                <div className="mt-1 text-sm text-white/70">
                  {ICONS[category]} {tMaterial(category)} · <span className="num">{numericWeight} kg</span>
                </div>
              </div>
              <SpeakButton
                text={valueSentence(
                  { category, weight: numericWeight, min: estimate.estimated_min, max: estimate.estimated_max },
                  lang
                )}
              />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-3 text-sm">
              <span className="text-white/70">{t('marketRate')}</span>
              <span className="num font-bold text-white">
                ₹{estimate.rate_min}–{estimate.rate_max}/{t('perKg')}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-white/70">{t('trend')}</span>
              <span className="rounded-none bg-white px-2 py-0.5"><Trend trend={estimate.trend} size={14} /></span>
            </div>
          </div>
          <Notice tone="warn">
            {category === 'Other' ? t('noPublishedRate') : t('estimateNote')}
          </Notice>
          <div className="flex items-center gap-2 border-2 border-ink bg-white p-2.5 text-xs">
            <MapPin size={15} />
            {gpsState === 'granted' ? (
              <span className="num">
                {t('gpsOn')} · {coords.latitude}, {coords.longitude} (±{coords.accuracy} m)
              </span>
            ) : gpsState === 'asking' ? (
              <span>{t('gpsAsking')}</span>
            ) : (
              <>
                <span className="flex-1">{t('gpsOff')}</span>
                <button type="button" className="font-semibold underline" onClick={askGps}>
                  {t('gpsEnable')}
                </button>
              </>
            )}
          </div>
          <div className="plate-lg p-4">
            <button
              type="button"
              onClick={() => setAuctionOn((v) => !v)}
              className="flex w-full items-center gap-3 text-left"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 border-ink ${auctionOn ? 'bg-brass' : 'bg-white'}`}>
                <Gavel size={18} strokeWidth={2.2} />
              </span>
              <span className="flex-1">
                <span className="block font-bold leading-tight">{t('startAuction')}</span>
                <span className="block text-xs leading-snug text-slate2">{t('auctionSub')}</span>
              </span>
              <span className={`h-6 w-11 shrink-0 border-2 border-ink p-0.5 ${auctionOn ? 'bg-board' : 'bg-white'}`}>
                <span className={`block h-full w-4 bg-white transition-transform ${auctionOn ? 'translate-x-4 bg-brass' : ''}`} />
              </span>
            </button>
            {auctionOn && (
              <div className="mt-3 border-t-2 border-ink/10 pt-3">
                <div className="eyebrow mb-1.5">{t('auctionDuration')}</div>
                <div className="grid grid-cols-4 gap-2">
                  {[10, 30, 60, 120].map((m) => (
                    <button
                      key={m} type="button" onClick={() => setAuctionMinutes(m)}
                      className={`btn num justify-center py-2 text-sm ${auctionMinutes === m ? 'bg-board text-white' : 'bg-white'}`}
                    >
                      {m} {t('auctionMin')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {error && <Notice tone="warn">{error}</Notice>}
          <NextButton disabled={busy} onClick={createLot}>
            {busy ? '…' : t('findRecycler')}
          </NextButton>
        </div>
      )}
    </div>
  )
}

/**
 * The three-way verdict, on screen. Also prints the model version, so it is
 * obvious at a glance which classifier actually answered.
 */
function VerdictBadge({ prediction }) {
  const { t } = useI18n()
  const verdict = prediction.verdict
    || (prediction.is_ewaste === false ? 'NOT_E_WASTE' : prediction.category ? 'E_WASTE' : 'UNCERTAIN')
  const style = {
    E_WASTE: 'bg-board text-white',
    NOT_E_WASTE: 'bg-copper text-white',
    UNCERTAIN: 'bg-brass text-ink',
  }[verdict]
  const label = {
    E_WASTE: t('verdictEwaste'),
    NOT_E_WASTE: t('verdictNot'),
    UNCERTAIN: t('verdictUncertain'),
  }[verdict]
  return (
    <span className={`chip ${style}`}>
      <span className="num">{verdict}</span> · {label}
    </span>
  )
}
