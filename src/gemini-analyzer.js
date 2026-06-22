// Gemini Vision API — face health analyzer

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`

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

Only include conditions you can see with reasonable confidence (>0.6). If unsure, mark as false.`

// ── Map Gemini boolean flags → condition IDs ──────────────────────────────────
const FLAG_MAP = [
  { path: 'eyes.yellow',          id: 'yellow_eyes'      },
  { path: 'eyes.darkCircles',     id: 'dark_circles'     },
  { path: 'eyes.puffy',           id: 'puffy_eyes'       },
  { path: 'skin.butterflyRash',   id: 'butterfly_rash'   },
  { path: 'skin.melasma',         id: 'melasma'          },
  { path: 'skin.xanthelasma',     id: 'xanthelasma'      },
  { path: 'lips.cracked',         id: 'cracked_lips'     },
  { path: 'lips.pale',            id: 'cracked_lips'     }, // closest match
  { path: 'lips.sores',           id: 'cold_sores'       },
  { path: 'lips.angularCheilitis',id: 'angular_cheilitis'},
  { path: 'face.droopingEyelid',  id: 'ptosis'           },
  { path: 'face.asymmetric',      id: 'bells_palsy'      },
  { path: 'face.puffy',           id: 'puffy_eyes'       },
]

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

// ── Send image(s) to Gemini ───────────────────────────────────────────────────
export async function analyzeFaceImage(scanData, userProfile = {}) {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY not set in .env')

  // Debug: log masked key so we can confirm which key is active at runtime
  const maskedKey = `${API_KEY.slice(0, 6)}…${API_KEY.slice(-4)}`
  console.log(`[Gemini] Key: ${maskedKey} | URL: ${API_URL.replace(API_KEY, maskedKey)}`)

  // Build patient context prefix for the prompt
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

  // Build parts array — include face + tongue + lips if captured
  const SCAN_PRIORITY = ['face', 'tongue', 'lips', 'eyes', 'sclera', 'skin']
  const imageParts = []

  for (const key of SCAN_PRIORITY) {
    const entry = scanData[key]
    if (!entry?.image || entry.skipped) continue
    const base64 = entry.image.replace(/^data:image\/\w+;base64,/, '')
    imageParts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } })
    if (imageParts.length >= 3) break   // 3 images is plenty for Gemini 2.5 Flash
  }

  if (imageParts.length === 0) throw new Error('No images available to analyse')

  const body = {
    contents: [{
      parts: [
        ...imageParts,
        { text: PROMPT },
      ],
    }],
    generationConfig: {
      temperature:     0.15,
      topP:            0.8,
      maxOutputTokens: 1024,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }

  const res = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const msg = errBody?.error?.message || `HTTP ${res.status}`
    console.error('[Gemini] API error:', res.status, errBody)
    throw new GeminiError(msg, res.status, errBody)
  }

  const data = await res.json()
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // Extract JSON block — Gemini sometimes wraps it in markdown fences
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Gemini returned no JSON.\n\nRaw response:\n${rawText.slice(0, 400)}`)

  return JSON.parse(jsonMatch[0])
}

// ── Map Gemini result → condition objects from health-data.json ───────────────
export function mapToConditions(geminiResult, allConditions) {
  const ids = new Set()

  // 1. Explicit boolean flags
  for (const { path, id } of FLAG_MAP) {
    if (getPath(geminiResult, path) === true) ids.add(id)
  }

  // 2. Acne — only add if moderate or severe
  const acne = geminiResult?.skin?.acne
  if (acne === 'moderate' || acne === 'severe') ids.add('acne')

  // 3. Any IDs Gemini itself suggested (best-effort)
  for (const id of (geminiResult?.detectedConditions ?? [])) {
    if (typeof id === 'string') ids.add(id)
  }

  // Resolve to full condition objects
  let detected = allConditions.filter(c => ids.has(c.id))

  // Fallback: if nothing matched but Gemini has a severity, return 1 demo condition
  if (detected.length === 0) {
    const sev = geminiResult?.severity ?? 'low'
    const fallback = allConditions.find(c => c.severity === sev)
    if (fallback) detected = [fallback]
  }

  // Cap at 4 conditions; sort so highest severity shows first
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
