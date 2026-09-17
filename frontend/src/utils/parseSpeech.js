/*
 * Turn one spoken sentence into { material, weight }.
 *
 * "साढ़े आठ किलो तार"      -> { material: 'Cable',  weight: 8.5 }
 * "दस किलो बैटरी"          -> { material: 'Battery', weight: 10 }
 * "साडे बारा किलो मोटर"    -> { material: 'Motor',   weight: 12.5 }
 * "8.5 kg circuit board"   -> { material: 'PCB',     weight: 8.5 }
 *
 * Deliberately a lookup table, not an NLP model: a scrapyard vocabulary is
 * small and fixed, and a table is debuggable and works offline once the
 * transcript exists.
 */

const UNITS = {
  // Hindi / Marathi
  'शून्य': 0, 'एक': 1, 'दो': 2, 'दोन': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5,
  'पाच': 5, 'छह': 6, 'छः': 6, 'सहा': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'नऊ': 9,
  'दस': 10, 'दहा': 10, 'ग्यारह': 11, 'अकरा': 11, 'बारह': 12, 'बारा': 12,
  'तेरह': 13, 'तेरा': 13, 'चौदह': 14, 'चौदा': 14, 'पंद्रह': 15, 'पंधरा': 15,
  'सोलह': 16, 'सोळा': 16, 'सत्रह': 17, 'सतरा': 17, 'अठारह': 18, 'अठरा': 18,
  'उन्नीस': 19, 'एकोणीस': 19, 'बीस': 20, 'वीस': 20, 'पच्चीस': 25, 'पंचवीस': 25,
  'तीस': 30, 'चालीस': 40, 'चाळीस': 40, 'पचास': 50, 'पन्नास': 50,
  'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'ऐंशी': 80, 'नब्बे': 90, 'नव्वद': 90,
  'सौ': 100, 'शंभर': 100,
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  twentyfive: 25, thirty: 30, forty: 40, fifty: 50, hundred: 100,
}

// Fractional forms that modify the following number.
const HALF_AFTER = ['साढ़े', 'साढे', 'साडे', 'and a half', 'half past']  // n + 0.5
const ONE_AND_HALF = ['डेढ़', 'डेढ', 'दीड']                                // 1.5
const TWO_AND_HALF = ['ढाई', 'अढाई', 'अडीच']                              // 2.5
const HALF_WORDS = ['आधा', 'आधी', 'अर्धा', 'अर्धी', 'half']               // 0.5

const MATERIAL_WORDS = {
  PCB: ['पीसीबी', 'सर्किट', 'बोर्ड', 'मदरबोर्ड', 'कार्ड', 'pcb', 'circuit', 'board', 'motherboard'],
  Cable: ['तार', 'केबल', 'केबिल', 'वायर', 'कॉपर', 'तांबा', 'तांब', 'cable', 'wire', 'copper'],
  Battery: ['बैटरी', 'बॅटरी', 'बेटरी', 'सेल', 'battery', 'cell'],
  'LCD/LED panel': ['एलसीडी', 'स्क्रीन', 'स्क्रिन', 'मॉनिटर', 'पैनल', 'पॅनल', 'lcd', 'screen', 'monitor', 'panel'],
  CRT: ['सीआरटी', 'ट्यूब', 'ट्युब', 'टीवी', 'टीव्ही', 'पिक्चर', 'crt', 'tube', 'tv', 'picture'],
  'Motor & magnet-bearing': ['मोटर', 'मोटार', 'पंखा', 'पंखे', 'फैन', 'motor', 'fan', 'pump',
    'मैगनेट', 'मॅग्नेट', 'चुंबक', 'चुम्बक', 'हार्ड डिस्क', 'magnet', 'hard disk', 'hdd', 'speaker'],
  'Mixed plastic': ['प्लास्टिक', 'प्लॅस्टिक', 'कवर', 'बॉडी', 'plastic', 'casing', 'housing'],
}

function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[।,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseWeight(text) {
  const t = normalise(text)

  // A plain numeral wins — "8.5 kilo", "१२ किलो" (after transcription).
  // Read digits from the RAW text: normalise() strips punctuation and would
  // eat the decimal point in "8.5".
  const digits = String(text || '').match(/(\d+(?:[.,]\d+)?)/)
  if (digits) {
    const value = parseFloat(digits[1].replace(',', '.'))
    if (value > 0 && value <= 5000) {
      // "8 aur aadha" style suffix
      const half = HALF_WORDS.some((w) => t.includes(w)) && !/\./.test(digits[1])
      return half ? value + 0.5 : value
    }
  }

  const words = t.split(' ')
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i]
    if (ONE_AND_HALF.includes(w)) return 1.5
    if (TWO_AND_HALF.includes(w)) return 2.5
    if (HALF_AFTER.includes(w)) {
      const next = UNITS[words[i + 1]]
      if (next != null) return next + 0.5   // साढ़े आठ -> 8.5
    }
    if (UNITS[w] != null) {
      // "आठ किलो" — but skip if the previous word already made it fractional.
      if (i > 0 && HALF_AFTER.includes(words[i - 1])) continue
      let value = UNITS[w]
      // "बीस पाँच" style compounds are rare in speech; handle "X sau Y".
      if (UNITS[words[i + 1]] != null && value >= 20 && UNITS[words[i + 1]] < 10) {
        value += UNITS[words[i + 1]]
      }
      if (HALF_WORDS.includes(words[i + 1])) value += 0.5
      return value
    }
    if (HALF_WORDS.includes(w) && UNITS[words[i + 1]] == null) return 0.5
  }
  return null
}

export function parseMaterial(text) {
  const t = normalise(text)
  let best = null
  let bestPos = Infinity
  for (const [category, words] of Object.entries(MATERIAL_WORDS)) {
    for (const w of words) {
      const pos = t.indexOf(w)
      if (pos !== -1 && pos < bestPos) {
        best = category
        bestPos = pos
      }
    }
  }
  return best
}

/**
 * @returns {{material: string|null, weight: number|null, transcript: string,
 *            complete: boolean}}
 */
export function parseLotSpeech(transcript) {
  const material = parseMaterial(transcript)
  const weight = parseWeight(transcript)
  return {
    transcript: String(transcript || '').trim(),
    material,
    weight,
    complete: Boolean(material && weight),
  }
}
