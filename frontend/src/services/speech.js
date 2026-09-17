/*
 * Speech recognition (Web Speech API).
 *
 * Chrome / Edge / Android Chrome only, and it needs a network connection —
 * recognition runs on Google's servers. Everything that uses it must keep the
 * normal tap flow available, which is why this module never throws: it
 * reports `supported` and lets the caller decide.
 */
export function speechRecognitionSupported() {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/**
 * Listen once and resolve with the transcript.
 * @returns {{ start: Function, stop: Function }}
 */
/**
 * Does the browser advertise support for this locale?
 *
 * The Web Speech API gives no way to enumerate locales, so this cannot be
 * answered before trying. What we CAN do is report the failure honestly when
 * it happens: `language-not-supported` comes back from recognition.onerror,
 * and the caller then offers the user a choice rather than silently
 * switching them to another language.
 */
export const SPEECH_ERRORS = {
  'not-allowed': 'permission',
  'service-not-allowed': 'permission',
  'no-speech': 'no-speech',
  'audio-capture': 'no-microphone',
  network: 'network',
  'language-not-supported': 'language',
  aborted: 'aborted',
}

export function createListener({ lang = 'hi-IN', onResult, onError, onEnd, onPartial }) {
  const Ctor = typeof window !== 'undefined'
    && (window.SpeechRecognition || window.webkitSpeechRecognition)
  if (!Ctor) {
    onError?.('unsupported')
    return { start() {}, stop() {} }
  }
  const recognition = new Ctor()
  recognition.lang = lang
  recognition.interimResults = true
  recognition.maxAlternatives = 3
  recognition.continuous = false

  let finalTranscript = ''

  recognition.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      if (result.isFinal) finalTranscript += result[0].transcript
      else interim += result[0].transcript
    }
    if (interim) onPartial?.(interim)
    if (finalTranscript) onResult?.(finalTranscript.trim(), event.results)
  }
  recognition.onerror = (event) => {
    const raw = event.error || 'error'
    onError?.(SPEECH_ERRORS[raw] || raw, raw)
  }
  recognition.onend = () => onEnd?.(finalTranscript.trim())

  let running = false
  return {
    lang,
    start() {
      finalTranscript = ''
      if (running) return
      try {
        recognition.start()
        running = true
      } catch {
        // Chrome throws InvalidStateError if start() is called twice; abort
        // and retry once so a rapid second tap does not wedge the mic.
        try { recognition.abort() } catch { /* ignore */ }
        try { recognition.start(); running = true } catch { /* give up quietly */ }
      }
    },
    stop() {
      running = false
      try { recognition.stop() } catch { /* already stopped */ }
    },
    /** Hard teardown — used when the language changes or the panel closes. */
    dispose() {
      running = false
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try { recognition.abort() } catch { /* ignore */ }
    },
  }
}
