/*
 * Voice output.
 *
 * Two things broke Marathi before:
 *
 *  1. `speechSynthesis.getVoices()` returns an EMPTY array on the first call
 *     in Chrome — the list arrives asynchronously and fires `voiceschanged`.
 *     The old code called it immediately, matched nothing, and let the browser
 *     pick its default voice (usually en-US), which reads Devanagari as
 *     gibberish or stays silent. We now wait for the list.
 *
 *  2. Very few systems ship an mr-IN voice at all. Matching failed, so it fell
 *     through to English. Marathi and Hindi share the Devanagari script and a
 *     hi-IN voice reads Marathi text intelligibly, so that is the fallback —
 *     and `lastVoiceNote()` reports when a substitute was used, rather than
 *     pretending it spoke Marathi.
 */
import { MATERIAL_NAMES } from '../i18n'

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

let voicesPromise = null

/** Resolve once the browser has actually published its voice list. */
function loadVoices() {
  if (!canSpeak()) return Promise.resolve([])
  if (voicesPromise) return voicesPromise
  voicesPromise = new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices()
    if (existing.length) return resolve(existing)
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve(window.speechSynthesis.getVoices())
    }
    window.speechSynthesis.addEventListener?.('voiceschanged', done, { once: true })
    // Safari sometimes never fires the event; do not hang forever.
    setTimeout(done, 1200)
  })
  return voicesPromise
}

// Marathi -> Hindi is a genuine substitute (same script). Never fall back to
// an English voice for Devanagari text: it is worse than silence.
const FALLBACK_LANGS = {
  'mr-IN': ['mr-IN', 'mr', 'hi-IN', 'hi'],
  'hi-IN': ['hi-IN', 'hi', 'mr-IN', 'mr'],
  'en-IN': ['en-IN', 'en-GB', 'en-US', 'en'],
}

let lastNote = ''
/** '' when the requested language was spoken, otherwise what was used instead. */
export function lastVoiceNote() { return lastNote }

function pickVoice(voices, langCode) {
  const chain = FALLBACK_LANGS[langCode] || [langCode, langCode.split('-')[0]]
  for (const want of chain) {
    const exact = voices.find((v) => v.lang?.replace('_', '-') === want)
    if (exact) return { voice: exact, wanted: chain[0] }
    const prefix = voices.find((v) => v.lang?.replace('_', '-').startsWith(want))
    if (prefix) return { voice: prefix, wanted: chain[0] }
  }
  return { voice: null, wanted: chain[0] }
}

export async function speak(text, langCode = 'hi-IN') {
  if (!canSpeak() || !text) return
  try {
    window.speechSynthesis.cancel()
    const voices = await loadVoices()
    const { voice } = pickVoice(voices, langCode)

    lastNote = ''
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.9
    u.pitch = 1

    if (voice) {
      u.voice = voice
      u.lang = voice.lang
      const base = langCode.split('-')[0]
      if (!voice.lang?.toLowerCase().startsWith(base)) {
        lastNote = `Spoken with a ${voice.lang} voice — no ${langCode} voice on this device.`
      }
    } else {
      // No usable voice: still set the language and let the browser try.
      u.lang = langCode
      lastNote = `No ${langCode} voice is installed on this device.`
    }
    window.speechSynthesis.speak(u)
  } catch {
    /* speech unsupported — the text is always on screen too */
  }
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel()
}

const TREND_WORD = {
  hi: { rising: 'भाव बढ़ रहा है', falling: 'भाव गिर रहा है', stable: 'भाव स्थिर है' },
  mr: { rising: 'भाव वाढत आहे', falling: 'भाव घटत आहे', stable: 'भाव स्थिर आहे' },
  en: { rising: 'the rate is rising', falling: 'the rate is falling', stable: 'the rate is stable' },
}

/** "PCB ka aaj ka approximate rate 180 se 200 rupaye prati kilogram hai." */
export function priceSentence({ category, min, max, trend }, lang = 'hi') {
  const name = MATERIAL_NAMES[category]?.[lang] ?? category
  const t = TREND_WORD[lang]?.[trend] ?? ''
  if (lang === 'hi') return `${name} का आज का अनुमानित भाव ${min} से ${max} रुपये प्रति किलोग्राम है। ${t}।`
  if (lang === 'mr') return `${name} चा आजचा अंदाजे भाव ${min} ते ${max} रुपये प्रति किलो आहे. ${t}.`
  return `Today's approximate rate for ${name} is ${min} to ${max} rupees per kilogram. ${t}.`
}

export function valueSentence({ category, weight, min, max }, lang = 'hi') {
  const name = MATERIAL_NAMES[category]?.[lang] ?? category
  if (lang === 'hi') return `${weight} किलो ${name} की अनुमानित कीमत ${min} से ${max} रुपये है।`
  if (lang === 'mr') return `${weight} किलो ${name} ची अंदाजे किंमत ${min} ते ${max} रुपये आहे.`
  return `${weight} kilograms of ${name} is worth approximately ${min} to ${max} rupees.`
}

/** Spoken read-back of what the voice input understood, before committing. */
export function confirmSentence({ category, weight, min, max }, lang = 'hi') {
  const name = MATERIAL_NAMES[category]?.[lang] ?? category
  if (lang === 'hi') return `${weight} किलो ${name}। दाम लगभग ${min} से ${max} रुपये। सही है?`
  if (lang === 'mr') return `${weight} किलो ${name}. किंमत अंदाजे ${min} ते ${max} रुपये. बरोबर आहे?`
  return `${weight} kilograms of ${name}. Around ${min} to ${max} rupees. Is that correct?`
}

/** Spoken alarm when the recycler's figures do not match what was declared. */
export function fairnessSentence({ declared, final, kind }, lang = 'hi') {
  if (kind === 'weight') {
    if (lang === 'hi') return `ध्यान दीजिए। आपने ${declared} किलो दिया था, ${final} किलो लिखा जा रहा है। रुकिए और तौल दोबारा देखिए।`
    if (lang === 'mr') return `लक्ष द्या. तुम्ही ${declared} किलो दिले होते, ${final} किलो लिहिले जात आहे. थांबा आणि वजन पुन्हा तपासा.`
    return `Careful. You declared ${declared} kilograms but ${final} is being recorded. Check the scale.`
  }
  if (lang === 'hi') return `ध्यान दीजिए। जो दाम लिखा जा रहा है वह बाज़ार भाव से काफी कम है।`
  if (lang === 'mr') return `लक्ष द्या. लिहिली जाणारी किंमत बाजारभावापेक्षा खूप कमी आहे.`
  return `Careful. The price being recorded is well below the market rate.`
}
