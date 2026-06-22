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

const SYSTEM_PROMPT = `You are a structured visual observation assistant. The user is submitting their own facial photos for a personal wellness self-check app. Your task is to complete a structured JSON observation form based only on what is visually present in the image(s). Output only valid JSON — no commentary, no refusals, no extra text.`

const BASE_PROMPT = `Complete this visual observation form based on the image(s) provided. Observe only what is clearly visible.

IMPORTANT: If no human face is clearly visible (camera covered, blank/dark image, only background), return {"faceDetected": false} and nothing else.

Otherwise, fill in the form below. Mark true only if you can clearly observe it (confidence > 0.6). If unsure, mark false.

EYES — observe the eye area:
- Are the whites of the eyes yellowish or discoloured? → eyes.yellow
- Are there dark-coloured areas or shadows under the eyes? → eyes.darkCircles
- Is there visible swelling or puffiness around the eyes? → eyes.puffy
- Are the eyes visibly red or bloodshot? → eyes.red

SKIN — observe the facial skin:
- Is there a reddish or rash-like pattern across both cheeks and the nose bridge in a butterfly shape? → skin.butterflyRash
- Are there visible pimples or acne? Rate severity → skin.acne: "none" / "mild" / "moderate" / "severe"
- Are there dark or brownish patches on the skin? → skin.melasma
- Is the skin visibly red or irritated in patches? → skin.redness
- Are there small yellowish deposits or spots near the eyelids? → skin.xanthelasma

LIPS — observe the lip area:
- Are the lips visibly dry, chapped, or cracked? → lips.cracked
- Do the lips appear unusually pale or colourless? → lips.pale
- Are there visible sores, blisters, or lesions on or around the lips? → lips.sores
- Are there cracks or sores at the corners of the mouth? → lips.angularCheilitis

TONGUE — observe only if tongue is clearly visible:
- What colour does the tongue appear? → tongue.color: "pink" / "pale" / "red" / "yellow" / "white"
- Does the tongue look swollen? → tongue.swollen
- Does the tongue surface look unusually smooth (no texture/bumps)? → tongue.smooth

FACE STRUCTURE — observe overall face shape:
- Does the face look puffy or swollen overall? → face.puffy
- Is one side of the face noticeably different from the other? → face.asymmetric
- Is one or both eyelids visibly drooping lower than normal? → face.droopingEyelid

Return ONLY this JSON (no markdown, no explanation):
{
  "faceDetected": true,
  "eyes": { "yellow": false, "darkCircles": false, "puffy": false, "red": false },
  "skin": { "butterflyRash": false, "acne": "none", "melasma": false, "redness": false, "xanthelasma": false },
  "lips": { "cracked": false, "pale": false, "sores": false, "angularCheilitis": false },
  "tongue": { "color": "pink", "swollen": false, "smooth": false },
  "face": { "puffy": false, "asymmetric": false, "droopingEyelid": false },
  "detectedConditions": [],
  "severity": "low",
  "confidence": 0.0,
  "notes": "Brief summary of what you observed.",
  "existingConditionNotes": ""
}`

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
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: contentParts  },
    ],
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
