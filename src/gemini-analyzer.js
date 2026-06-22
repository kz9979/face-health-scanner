// Vision API — face health analyzer (OpenAI GPT-4o Vision)

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY
const API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL   = 'gpt-4o'

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

const BASE_PROMPT = `You are a medical diagnostic AI. Analyze the submitted face image(s) for health conditions.

IMPORTANT: If no clear human face is visible in any image (e.g. the camera was covered, the image is blank, dark, or shows only a wall/background), return {"faceDetected": false} and nothing else.

Check for these specific signs:

**EYES:**
- Yellow color in whites of eyes (jaundice)
- Dark circles under eyes
- Puffiness/swelling
- Redness

**SKIN:**
- Butterfly-shaped rash on cheeks (lupus)
- Acne severity (mild/moderate/severe)
- Melasma or dark patches
- Unusual redness or rashes
- Yellow spots on eyelids

**LIPS:**
- Cracked or dry lips
- Pale color (anemia sign)
- Cold sores
- Angular cheilitis (cracks at corners)

**TONGUE (if visible):**
- Color (pink/pale/red/yellow/white coating)
- Swelling
- Smoothness (loss of taste buds)

**FACE STRUCTURE:**
- Facial puffiness (fluid retention)
- Asymmetry (possible Bell's palsy or stroke)
- Drooping eyelids

Return analysis in strict JSON format:
{
  "faceDetected": true,
  "eyes": {
    "yellow": true/false,
    "darkCircles": true/false,
    "puffy": true/false,
    "red": true/false
  },
  "skin": {
    "butterflyRash": true/false,
    "acne": "none/mild/moderate/severe",
    "melasma": true/false,
    "redness": true/false,
    "xanthelasma": true/false
  },
  "lips": {
    "cracked": true/false,
    "pale": true/false,
    "sores": true/false,
    "angularCheilitis": true/false
  },
  "tongue": {
    "color": "pink/pale/red/yellow/white",
    "swollen": true/false,
    "smooth": true/false
  },
  "face": {
    "puffy": true/false,
    "asymmetric": true/false,
    "droopingEyelid": true/false
  },
  "detectedConditions": ["condition_id_1", "condition_id_2"],
  "severity": "low/medium/high/critical",
  "confidence": 0.0,
  "notes": "Brief explanation of findings",
  "existingConditionNotes": "If existing conditions were disclosed: note which visual findings are consistent with those conditions vs which appear to be new, unrelated findings. Use plain language. Empty string if no existing conditions were provided."
}

Only include conditions you can see with reasonable confidence (>0.6). If unsure, mark as false.
Respond with ONLY the JSON object — no markdown fences, no extra text.`

// ── Map OpenAI boolean flags → condition IDs ──────────────────────────────────
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

// ── Send image(s) to OpenAI ───────────────────────────────────────────────────
export async function analyzeFaceImage(scanData, userProfile = {}) {
  if (!API_KEY) throw new Error('VITE_OPENAI_API_KEY not set in .env')

  // Debug: log masked key
  const maskedKey = `${API_KEY.slice(0, 7)}…${API_KEY.slice(-4)}`
  console.log(`[OpenAI] Key: ${maskedKey} | Model: ${MODEL}`)

  // Build patient context prefix
  const { age, gender, conditions = [], conditionsOther = '' } = userProfile
  const genderLabel = gender === 'male' ? 'male' : gender === 'female' ? 'female' : null
  let profilePrefix = ''

  if (age || genderLabel) {
    profilePrefix += 'PATIENT DEMOGRAPHICS:\n'
    if (age)         profilePrefix += `- Age: ${age} years old\n`
    if (genderLabel) profilePrefix += `- Gender: ${genderLabel}\n`
    profilePrefix += 'Apply age- and gender-appropriate clinical reasoning:\n'
    if (genderLabel === 'male')   profilePrefix += '  • Exclude female-specific conditions (pregnancy, menstruation-related).\n'
    if (genderLabel === 'female') profilePrefix += '  • Include female-specific conditions where clinically relevant.\n'
    if (age && age < 18)  profilePrefix += '  • Focus on paediatric/adolescent presentations.\n'
    if (age && age > 60)  profilePrefix += '  • Consider age-related degenerative and vascular presentations.\n'
    profilePrefix += '\n'
  }

  if (conditions.length > 0) {
    const condList = conditions.map(c => {
      if (c === 'other') return conditionsOther || 'Other (unspecified)'
      return CONDITION_NAMES[c] || c
    }).join(', ')
    profilePrefix += `DISCLOSED EXISTING CONDITIONS: ${condList}\n`
    profilePrefix += 'Interpretation rules for existing conditions:\n'
    profilePrefix += '  1. If a visual finding is expected or consistent with a disclosed condition, note it as "consistent with [condition name]" — do not flag it as a new alarming finding.\n'
    profilePrefix += '  2. If a finding appears unrelated to any disclosed condition, flag it explicitly as a "new finding" requiring separate medical attention.\n'
    profilePrefix += '  3. Do not re-diagnose disclosed conditions unless you see signs of complications, worsening, or new comorbidities.\n'
    profilePrefix += '  4. Populate the "existingConditionNotes" field to clearly distinguish related vs new findings.\n\n'
  }

  const PROMPT = profilePrefix + BASE_PROMPT

  // Build content array — images first, then text prompt
  const SCAN_PRIORITY = ['face', 'tongue', 'lips', 'eyes', 'sclera', 'skin']
  const contentParts = []

  for (const key of SCAN_PRIORITY) {
    const entry = scanData[key]
    if (!entry?.image || entry.skipped) continue
    // OpenAI accepts base64 as a data URI in image_url
    contentParts.push({
      type: 'image_url',
      image_url: { url: entry.image, detail: 'high' },
    })
    if (contentParts.length >= 3) break
  }

  if (contentParts.length === 0) throw new Error('No images available to analyse')

  contentParts.push({ type: 'text', text: PROMPT })

  const body = {
    model: MODEL,
    messages: [{ role: 'user', content: contentParts }],
    max_tokens: 1024,
    temperature: 0.15,
  }

  const res = await fetch(API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const msg = errBody?.error?.message || `HTTP ${res.status}`
    console.error('[OpenAI] API error:', res.status, errBody)
    throw new GeminiError(msg, res.status, errBody)
  }

  const data = await res.json()
  const rawText = data?.choices?.[0]?.message?.content ?? ''

  // Extract JSON — strip markdown fences if present
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`OpenAI returned no JSON.\n\nRaw response:\n${rawText.slice(0, 400)}`)

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
