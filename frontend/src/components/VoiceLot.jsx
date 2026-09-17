import { useEffect, useRef, useState } from 'react'
import { Check, Mic, Square, X } from 'lucide-react'
import { MATERIAL_NAMES, useI18n } from '../i18n'
import { catalog } from '../services/api'
import { createListener, speechRecognitionSupported } from '../services/speech'
import { confirmSentence, lastVoiceNote, speak, stopSpeaking } from '../services/voice'
import { parseLotSpeech } from '../utils/parseSpeech'
import { Notice, rupee } from './ui'

/**
 * बोलो और बेचो — say the lot instead of tapping through it.
 *
 * The collector holds the button and says "साढ़े आठ किलो तार". We extract the
 * material and weight, price it, then SPEAK IT BACK and wait for a tap before
 * anything is committed. The read-back is the important part: the user always
 * hears what the system understood before it acts, so a misheard word costs a
 * tap rather than a wrong lot.
 *
 * Requires Chrome/Edge/Android Chrome and a network connection. The normal
 * tap flow stays on screen at all times as the fallback.
 */
export default function VoiceLot({ onConfirm, onClose }) {
  const { t, lang, speech } = useI18n()
  const [state, setState] = useState('idle') // idle | listening | parsed | error
  const [partial, setPartial] = useState('')
  const [result, setResult] = useState(null)
  const [estimate, setEstimate] = useState(null)
  const [error, setError] = useState('')
  const [voiceNote, setVoiceNote] = useState('')
  // Set when the device has no recogniser for the selected language. We offer
  // an explicit switch instead of silently listening in another language.
  const [langUnsupported, setLangUnsupported] = useState(null)
  const listenerRef = useRef(null)

  const supported = speechRecognitionSupported()

  useEffect(() => () => {
    listenerRef.current?.dispose?.()
    listenerRef.current?.stop()
    stopSpeaking()
  }, [])

  // Changing language must not reuse a recogniser bound to the old locale.
  useEffect(() => {
    if (listenerRef.current && listenerRef.current.lang !== speech) {
      listenerRef.current.dispose?.()
      listenerRef.current = null
      setState('idle')
      setLangUnsupported(null)
      setError('')
    }
  }, [speech])

  function start(overrideLocale) {
    setError('')
    setPartial('')
    setResult(null)
    setEstimate(null)
    setState('listening')
    // Always build a fresh recogniser for the current locale.
    listenerRef.current?.dispose?.()
    listenerRef.current = createListener({
      lang: overrideLocale || speech,
      onPartial: setPartial,
      onResult: (transcript) => handleTranscript(transcript),
      onError: (kind) => {
        setState('error')
        if (kind === 'language') {
          // Marathi in particular is missing on many devices. Say so, and let
          // the collector choose — never switch language behind their back.
          setLangUnsupported(overrideLocale || speech)
          setError(t('micLangUnsupported').replace('{lang}', overrideLocale || speech))
          return
        }
        setError(
          kind === 'permission' ? t('micDenied')
            : kind === 'no-speech' ? t('micNoSpeech')
              : kind === 'network' ? t('micNetwork')
                : kind === 'no-microphone' ? t('micNoDevice')
                  : kind === 'aborted' ? ''
                    : t('micUnsupported')
        )
      },
      onEnd: (finalText) => {
        setState((s) => (s === 'listening' ? (finalText ? s : 'error') : s))
        if (!finalText) setError((e) => e || t('micNoSpeech'))
      },
    })
    listenerRef.current.start()
  }

  function stop() {
    listenerRef.current?.stop()
  }

  async function handleTranscript(transcript) {
    const parsed = parseLotSpeech(transcript)
    setResult(parsed)
    if (!parsed.complete) {
      setState('error')
      setError(parsed.material ? t('micNoWeight') : t('micNoMaterial'))
      return
    }
    setState('parsed')
    try {
      const est = await catalog.estimate({
        category: parsed.material, weight: parsed.weight,
        condition: 'good', source_type: 'household',
      })
      setEstimate(est)
      // Read it back before anything is committed.
      await speak(
        confirmSentence({
          category: parsed.material, weight: parsed.weight,
          min: est.estimated_min, max: est.estimated_max,
        }, lang),
        speech
      )
      setVoiceNote(lastVoiceNote())
    } catch (err) {
      setError(err.message)
    }
  }

  if (!supported) {
    return (
      <Notice tone="warn">
        {t('micUnsupported')}
      </Notice>
    )
  }

  return (
    <div className="plate-lg border-board p-4">
      <div className="flex items-center gap-2">
        <span className="font-display text-xl">🎤 {t('voiceSell')}</span>
        <button type="button" className="btn-ghost ml-auto px-2 py-1.5" onClick={onClose} aria-label={t('back')}>
          <X size={16} />
        </button>
      </div>
      <p className="mt-1 text-sm text-slate2">{t('voiceHint')}</p>

      {state === 'listening' ? (
        <button type="button" className="btn-brass mt-4 w-full py-6 text-lg" onClick={stop}>
          <Square size={22} /> {t('voiceStop')}
        </button>
      ) : (
        <button type="button" className="btn-primary mt-4 w-full py-6 text-lg" onClick={start}>
          <Mic size={26} /> {t('voiceStart')}
        </button>
      )}

      {state === 'listening' && (
        <div className="mt-3 flex items-center gap-2">
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-3 w-1.5 animate-pulse bg-board" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
          <span className="text-sm text-slate2">{partial || t('voiceListening')}</span>
        </div>
      )}

      {result?.transcript && (
        <p className="mt-3 border-2 border-dashed border-ink/20 bg-mint p-2 text-sm">
          “{result.transcript}”
        </p>
      )}

      {state === 'parsed' && result?.complete && (
        <div className="mt-3 border-2 border-ink bg-boardDark p-3 text-white">
          <div className="text-2xl font-bold">
            <span className="num">{result.weight}</span> kg · {materialLabel(result.material, lang)}
          </div>
          {estimate && (
            <div className="num mt-1 text-brass">
              {rupee(estimate.estimated_min)} – {rupee(estimate.estimated_max)}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn bg-brass px-4 py-3 text-ink shadow-plateSm"
              onClick={() => { stopSpeaking(); onConfirm(result.material, result.weight) }}
            >
              <Check size={18} /> {t('correct')}
            </button>
            <button
              type="button"
              className="btn border-white/40 bg-white/10 px-4 py-3 text-white"
              onClick={() => { stopSpeaking(); start() }}
            >
              <Mic size={18} /> {t('voiceAgain')}
            </button>
          </div>
        </div>
      )}

      {error && <Notice tone="warn">{error}</Notice>}

      {/* Explicit, consented fallback when the locale is unavailable. */}
      {langUnsupported && (
        <div className="mt-2 grid gap-2">
          <button type="button" className="btn-ghost w-full justify-center py-2.5"
                  onClick={() => { setLangUnsupported(null); start('hi-IN') }}>
            {t('micTryHindi')}
          </button>
          <button type="button" className="btn-ghost w-full justify-center py-2.5"
                  onClick={() => { setLangUnsupported(null); onClose() }}>
            {t('micUseButtons')}
          </button>
        </div>
      )}
      {voiceNote && <p className="mt-2 text-[11px] text-slate2">{voiceNote}</p>}
    </div>
  )
}

function materialLabel(category, lang) {
  return MATERIAL_NAMES[category]?.[lang] ?? category
}
