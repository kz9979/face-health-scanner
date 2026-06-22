// Vision API — face health analyzer (Anthropic Claude Vision)

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL   = 'claude-haiku-4-5-20251001'

// Human-readable names for condition IDs (used in prompt context)
const CONDITION_NAMES = {
  diabetes:     'Diabetes',
  hypertension: 'High Blood Pressure',
  lupus:        'Lupus',
  thyroid:      'Thyroid Disorder',
  eczema:       'Eczema / Psoriasis',
  heart:        'Heart Disease',
  liver:        'Liver Disease',
  kidney:       'Kidney Disease',
  anaemia:      'Anaemia',
  allergies:    'Allergies',
}

const SYSTEM_PROMPT = `You are a visual wellness screening assistant for a personal health self-awareness app. The user has submitted their own facial photos to observe visible physical indicators for educational self-awareness purposes only — this is not medical diagnosis. Analyze the images and return only a strict JSON object as instructed. Do not refuse, add disclaimers, or return anything other than the requested JSON.`

const BASE_PROMPT = `Analyze the facial image(s) and complete the following JSON observation form.

CRITICAL: If the image is very dark, black, blurry, obstructed, a plain surface, background only, or does NOT contain a clear human face — you MUST return ONLY this exact JSON and nothing else: {"faceDetected": false}
Do NOT attempt to analyse, guess, or describe any image that does not clearly show a human face.

Otherwise, observe what is visually present and return this JSON (replace all placeholders with actual values):

{
  "faceDetected": true,
  "eyes": {
    "yellow": false,
    "darkCircles": false,
    "puffy": false,
    "red": false
  },
  "skin": {
    "butterflyRash": false,
    "acne": "none",
    "melasma": false,
    "redness": false,
    "xanthelasma": false
  },
  "lips": {
    "cracked": false,
    "pale": false,
    "sores": false,
    "angularCheilitis": false
  },
  "tongue": {
    "color": "pink",
    "swollen": false,
    "smooth": false
  },
  "face": {
    "puffy": false,
    "asymmetric": false,
    "droopingEyelid": false
  },
  "detectedConditions": [],
  "severity": "low",
  "confidence": 0.0,
  "notes": "Brief description of what you observe.",
  "existingConditionNotes": ""
}

Field guide:
- eyes.yellow: whites of eyes appear yellowish
- eyes.darkCircles: dark shadows under eyes
- eyes.puffy: swelling around eyes
- eyes.red: bloodshot or red eyes
- skin.butterflyRash: redness across cheeks and nose bridge in butterfly pattern
- skin.acne: "none" / "mild" / "moderate" / "severe"
- skin.melasma: dark or brownish skin patches
- skin.redness: generalised skin redness or irritation
- skin.xanthelasma: small yellowish deposits near eyelids
- lips.cracked: dry, chapped, or cracked lips
- lips.pale: unusually pale or colourless lips
- lips.sores: visible blisters or sores on/around lips
- lips.angularCheilitis: cracks or sores at corners of mouth
- tongue.color: "pink" / "pale" / "red" / "yellow" / "white" (if tongue not visible, use "pink")
- tongue.swollen: tongue appears enlarged
- tongue.smooth: tongue surface lacks normal texture
- face.puffy: overall facial puffiness or swelling
- face.asymmetric: one side of face noticeably different
- face.droopingEyelid: one or both eyelids drooping lower than normal
- severity: overall impression — "low" / "medium" / "high" / "critical"
- confidence: your confidence in the observations, 0.0 to 1.0

Return ONLY the JSON. No explanation, no markdown fences.`

// ── Map result flags → condition IDs ─────────────────────────────────────────
const FLAG_MAP = [
  { path: 'eyes.yellow',          id: 'yellow_eyes'      },
  { path: 'eyes.darkCircles',     id: 'dark_circles'     },
  { path: 'eyes.puffy',           id: 'puffy_eyes'       },
  { path: 'skin.butterflyRash',   id: 'butterfly_rash'   },
  { path: 'skin.melasma',         id: 'melasma'          },
  { path: 'skin.xanthelasma',     id: 'xanthelasma'      },
  { path: 'lips.cracked',         id: 'cracked_lips'     },
  { path: 'lips.pale',            id: 'cracked_lips'     },
  { path: 'lips.sores',           id: 'cold_sores'       },
  { path: 'lips.angularCheilitis',id: 'angular_cheilitis'},
  { path: 'face.droopingEyelid',  id: 'ptosis'           },
  { path: 'face.asymmetric',      id: 'bells_palsy'      },
  { path: 'face.puffy',           id: 'puffy_eyes'       },
]

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

// ── Send image(s) to Claude ───────────────────────────────────────────────────
export async function analyzeFaceImage(scanData, userProfile = {}) {
  if (!API_KEY) throw new Error('VITE_ANTHROPIC_API_KEY not set in .env')

  const maskedKey = `${API_KEY.slice(0, 8)}…${API_KEY.slice(-4)}`
  console.log(`[Claude] Key: ${maskedKey} | Model: ${MODEL}`)

  // Build patient context prefix
  const { age, gender, conditions = [], conditionsOther = '' } = userProfile
  const genderLabel = gender === 'male' ? 'male' : gender === 'female' ? 'female' : null
  let profilePrefix = ''

  if (age || genderLabel) {
    profilePrefix += 'PATIENT DEMOGRAPHICS:\n'
    if (age)         profilePrefix += `- Age: ${age} years old\n`
    if (genderLabel) profilePrefix += `- Gender: ${genderLabel}\n`
    if (genderLabel === 'male')   profilePrefix += '- Exclude female-specific presentations.\n'
    if (genderLabel === 'female') profilePrefix += '- Include female-specific presentations where relevant.\n'
    if (age && age < 18)  profilePrefix += '- Focus on adolescent/paediatric presentations.\n'
    if (age && age > 60)  profilePrefix += '- Consider age-related vascular and degenerative presentations.\n'
    profilePrefix += '\n'
  }

  if (conditions.length > 0) {
    const condList = conditions.map(c => {
      if (c === 'other') return conditionsOther || 'Other (unspecified)'
      return CONDITION_NAMES[c] || c
    }).join(', ')
    profilePrefix += `DISCLOSED EXISTING CONDITIONS: ${condList}\n`
    profilePrefix += '- If a finding is consistent with a disclosed condition, note it in existingConditionNotes as "consistent with [condition]".\n'
    profilePrefix += '- If a finding appears unrelated, flag it as a "new finding".\n'
    profilePrefix += '- Populate existingConditionNotes to distinguish related vs new findings.\n\n'
  }

  const PROMPT = profilePrefix + BASE_PROMPT

  // Build content array — images first, then text
  const SCAN_PRIORITY = ['face', 'tongue', 'lips', 'eyes', 'sclera', 'skin']
  const contentParts = []

  for (const key of SCAN_PRIORITY) {
    const entry = scanData[key]
    if (!entry?.image || entry.skipped) continue
    // Strip data URI prefix — Claude takes raw base64
    const base64 = entry.image.replace(/^data:image\/\w+;base64,/, '')
    contentParts.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
    })
    if (contentParts.length >= 3) break
  }

  if (contentParts.length === 0) throw new Error('No images available to analyse')

  contentParts.push({ type: 'text', text: PROMPT })

  const body = {
    model:      MODEL,
    max_tokens: 1024,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: contentParts }],
  }

  const res = await fetch(API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':                          'application/json',
      'x-api-key':                             API_KEY,
      'anthropic-version':                     '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const msg = errBody?.error?.message || `HTTP ${res.status}`
    console.error('[Claude] API error:', res.status, errBody)
    throw new GeminiError(msg, res.status, errBody)
  }

  const data = await res.json()
  const rawText = data?.content?.[0]?.text ?? ''

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Claude returned no JSON.\n\nRaw response:\n${rawText.slice(0, 400)}`)

  return JSON.parse(jsonMatch[0])
}

// ── Map result → condition objects from health-data.json ─────────────────────
export function mapToConditions(geminiResult, allConditions) {
  const ids = new Set()

  for (const { path, id } of FLAG_MAP) {
    if (getPath(geminiResult, path) === true) ids.add(id)
  }

  const acne = geminiResult?.skin?.acne
  if (acne === 'moderate' || acne === 'severe') ids.add('acne')

  for (const id of (geminiResult?.detectedConditions ?? [])) {
    if (typeof id === 'string') ids.add(id)
  }

  let detected = allConditions.filter(c => ids.has(c.id))

  if (detected.length === 0) {
    const sev = geminiResult?.severity ?? 'low'
    const fallback = allConditions.find(c => c.severity === sev)
    if (fallback) detected = [fallback]
  }

  const ORDER = { critical: 0, high: 1, medium: 2, low: 3 }
  return detected
    .sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9))
    .slice(0, 4)
}

// ── Custom error class ────────────────────────────────────────────────────────
export class GeminiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name   = 'GeminiError'
    this.status = status
    this.body   = body
  }
}
