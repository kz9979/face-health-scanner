import { router } from '../main.js'
import healthData from '../../health-data.json'
import { t, getLang } from '../i18n.js'

// ── Module-level state ─────────────────────────────────────────────────────────
let stream      = null
let step        = 0
let scanData    = {}
let captured    = {}
let direction   = 'forward'
let userProfile = { age: null, gender: null }
let _appContainer   = null  // for language-toggle re-render
let _prevSpokenStep    = -1    // guard: prevents speak() firing twice for the same step
let _liveDetectTimer   = null
let _liveDetectPending = false

// ── Step config (rebuilt on each call so translations are current) ────────────
function getSteps() {
  const lang = getLang()
  const lbl  = (n) => `${t('step')} ${n} / 6`
  return [
    { key: 'face',   emoji: '👤', title: t('face_title'),   label: lbl(1), inst: t('face_inst'),   tip: t('face_tip'),   btn: t('btnNext'),    overlay: 'face',   tts: t('face_tts')   },
    { key: 'eyes',   emoji: '👁️', title: t('eyes_title'),   label: lbl(2), inst: t('eyes_inst'),   tip: t('eyes_tip'),   btn: t('btnNext'),    overlay: 'eyes',   tts: t('eyes_tts')   },
    { key: 'sclera', emoji: '🔍', title: t('sclera_title'), label: lbl(3), inst: t('sclera_inst'), tip: t('sclera_tip'), btn: t('btnNext'),    overlay: 'sclera', tts: t('sclera_tts') },
    { key: 'tongue', emoji: '👅', title: t('tongue_title'), label: lbl(4), inst: t('tongue_inst'), tip: t('tongue_tip'), btn: t('btnNext'),    overlay: 'tongue', tts: t('tongue_tts') },
    { key: 'lips',   emoji: '💋', title: t('lips_title'),   label: lbl(5), inst: t('lips_inst'),   tip: t('lips_tip'),   btn: t('btnNext'),    overlay: 'lips',   tts: t('lips_tts')   },
    { key: 'skin',   emoji: '✨', title: t('skin_title'),   label: lbl(6), inst: t('skin_inst'),   tip: t('skin_tip'),   btn: t('btnAnalyze'), overlay: 'skin',   tts: t('skin_tts')   },
  ]
}

function flattenConditions() {
  const out = []
  const cats = healthData.healthConditions
  for (const k of Object.keys(cats))
    for (const c of Object.keys(cats[k]))
      out.push(cats[k][c])
  return out
}
const ALL_CONDITIONS = flattenConditions()

// ── Medical conditions for intake form ────────────────────────────────────────
const MED_CONDITIONS = [
  { id: 'diabetes',     bm: 'Kencing Manis',          en: 'Diabetes'            },
  { id: 'hypertension', bm: 'Tekanan Darah Tinggi',   en: 'High Blood Pressure' },
  { id: 'lupus',        bm: 'Lupus',                  en: 'Lupus'               },
  { id: 'thyroid',      bm: 'Penyakit Tiroid',        en: 'Thyroid Disorder'    },
  { id: 'eczema',       bm: 'Ekzema / Psoriasis',     en: 'Eczema / Psoriasis'  },
  { id: 'heart',        bm: 'Penyakit Jantung',       en: 'Heart Disease'       },
  { id: 'liver',        bm: 'Penyakit Hati',          en: 'Liver Disease'       },
  { id: 'kidney',       bm: 'Penyakit Buah Pinggang', en: 'Kidney Disease'      },
  { id: 'anaemia',      bm: 'Anemia',                 en: 'Anaemia'             },
  { id: 'allergies',    bm: 'Alahan',                 en: 'Allergies'           },
]

// ── Entry point ───────────────────────────────────────────────────────────────
export function renderScanner(container) {
  _appContainer   = container
  _prevSpokenStep = -1
  stopStream()
  step        = 0
  scanData    = {}
  captured    = {}
  direction   = 'forward'
  userProfile = { age: null, gender: null, conditions: [], conditionsOther: '' }
  renderAgeGender(container)  // intake form always shown first
}

// ── Intake form (age / gender / existing conditions) ─────────────────────────
function renderAgeGender(container, saved = {}) {
  _appContainer = container
  const lang = getLang()

  // Chip style helpers
  const chipOn  = 'cond-chip px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 border-[#2DD4BF] bg-[#2DD4BF]/15 text-[#2DD4BF]'
  const chipOff = 'cond-chip px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 border-slate-700 bg-slate-800 text-slate-400'

  // Restore saved condition set (survives lang toggle)
  const condSet = new Set(saved.conditions ?? ['none'])

  function chipClass(id) { return condSet.has(id) ? chipOn : chipOff }

  container.innerHTML = `
    <div class="flex flex-col min-h-dvh bg-gradient-to-b from-[#0f0f1a] to-[#0d1a2e] fade-in">

      <header class="px-4 pt-4 pb-3 flex items-center justify-between border-b border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E0B990] to-[#C9956D] flex items-center justify-center shrink-0 shadow shadow-[#C9956D]/30">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </div>
          <div>
            <p class="text-white font-bold text-sm leading-tight">Face Health Scanner</p>
            <p class="text-xs text-[#E0B990]/80">${t('appSub')}</p>
          </div>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto px-4 py-6">
        <div class="w-full max-w-sm mx-auto flex flex-col gap-6">

          <div class="text-center">
            <div class="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-cyan-400/15 to-blue-600/15 border border-cyan-500/30 flex items-center justify-center text-2xl mb-3 shadow-lg shadow-cyan-500/10">
              📋
            </div>
            <h2 class="text-lg font-bold text-white">${t('ageGenderTitle')}</h2>
            <p class="text-slate-400 text-xs mt-1.5 leading-relaxed">${t('ageGenderSub')}</p>
          </div>

          <div class="flex flex-col gap-5">

            <!-- Age -->
            <div class="flex flex-col gap-2">
              <label class="text-sm font-semibold text-slate-300">${t('ageLabel')}</label>
              <input id="age-input" type="number" min="1" max="120"
                placeholder="${t('agePlaceholder')}"
                value="${saved.age ?? ''}"
                class="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700/80 text-white text-sm
                       placeholder-slate-600 focus:border-[#C9956D] focus:outline-none focus:ring-1 focus:ring-[#C9956D]/40
                       transition-colors"/>
              <p id="age-error" class="hidden text-xs text-red-400 px-1">${t('ageError')}</p>
            </div>

            <!-- Gender -->
            <div class="flex flex-col gap-2">
              <label class="text-sm font-semibold text-slate-300">${t('genderLabel')}</label>
              <div class="grid grid-cols-2 gap-2">
                ${['male', 'female'].map(v => `
                <label class="relative cursor-pointer select-none">
                  <input type="radio" name="gender" value="${v}" class="sr-only peer"
                    ${saved.gender === v ? 'checked' : ''}/>
                  <div class="py-2.5 px-1 rounded-xl border border-slate-700 bg-slate-800 text-center text-xs font-semibold text-slate-400
                              peer-checked:border-[#2DD4BF] peer-checked:bg-[#2DD4BF]/15 peer-checked:text-[#2DD4BF]
                              hover:border-slate-600 transition-all duration-150 active:scale-95">
                    ${v === 'male' ? t('genderMale') : v === 'female' ? t('genderFemale') : t('genderNone')}
                  </div>
                </label>`).join('')}
              </div>
              <p id="gender-error" class="hidden text-xs text-red-400 px-1">${t('genderError')}</p>
            </div>

            <!-- Existing medical conditions -->
            <div class="flex flex-col gap-2">
              <div>
                <label class="text-sm font-semibold text-slate-300">${t('conditionsLabel')}</label>
                <span class="block text-xs text-slate-500 mt-0.5">${t('conditionsOptional')}</span>
              </div>
              <div id="cond-grid" class="flex flex-wrap gap-2">
                <button type="button" data-cid="none" class="${chipClass('none')}">${t('conditionsNoneOpt')}</button>
                ${MED_CONDITIONS.map(c => `
                <button type="button" data-cid="${c.id}" class="${chipClass(c.id)}">
                  ${lang === 'bm' ? c.bm : c.en}
                </button>`).join('')}
                <button type="button" data-cid="other" class="${chipClass('other')}">${t('conditionsOtherOpt')}</button>
              </div>
              <input id="cond-other-input" type="text"
                placeholder="${t('conditionsOtherPh')}"
                value="${saved.other ?? ''}"
                class="${condSet.has('other') ? '' : 'hidden'} w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700/80 text-white text-xs
                       placeholder-slate-600 focus:border-[#C9956D] focus:outline-none focus:ring-1 focus:ring-[#C9956D]/40 transition-colors mt-1"/>
            </div>

            <!-- Continue -->
            <button id="continue-btn"
              class="w-full py-4 rounded-2xl font-bold text-base text-white
                     bg-gradient-to-r from-[#C9956D] to-[#A87B55]
                     shadow-lg shadow-[#C9956D]/25 active:scale-95 transition-all
                     flex items-center justify-center gap-2">
              ${t('btnContinue')}
            </button>

          </div>
        </div>
      </main>
    </div>
  `

  // ── Condition chip logic ──────────────────────────────────────────────────
  function refreshChips() {
    document.querySelectorAll('.cond-chip').forEach(btn => {
      btn.className = condSet.has(btn.dataset.cid) ? chipOn : chipOff
    })
    const otherInput = document.getElementById('cond-other-input')
    if (otherInput) otherInput.classList.toggle('hidden', !condSet.has('other'))
  }

  document.querySelectorAll('.cond-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.cid
      if (cid === 'none') {
        condSet.clear()
        condSet.add('none')
      } else {
        condSet.delete('none')
        if (condSet.has(cid)) {
          condSet.delete(cid)
          if (condSet.size === 0) condSet.add('none')
        } else {
          condSet.add(cid)
        }
      }
      refreshChips()
    })
  })

  // ── Field error dismissal ────────────────────────────────────────────────
  document.getElementById('age-input')?.addEventListener('input', () =>
    document.getElementById('age-error')?.classList.add('hidden'))

  document.querySelectorAll('input[name="gender"]').forEach(r =>
    r.addEventListener('change', () =>
      document.getElementById('gender-error')?.classList.add('hidden')))

  // ── Continue ─────────────────────────────────────────────────────────────
  document.getElementById('continue-btn')?.addEventListener('click', () => {
    const ageVal    = parseInt(document.getElementById('age-input')?.value ?? '')
    const genderVal = document.querySelector('input[name="gender"]:checked')?.value

    let valid = true
    if (!ageVal || ageVal < 1 || ageVal > 120) {
      document.getElementById('age-error')?.classList.remove('hidden')
      valid = false
    }
    if (!genderVal) {
      document.getElementById('gender-error')?.classList.remove('hidden')
      valid = false
    }
    if (!valid) return

    const otherText   = document.getElementById('cond-other-input')?.value?.trim() ?? ''
    const conditions  = [...condSet].filter(c => c !== 'none')   // empty if only 'none' was selected

    userProfile = { age: ageVal, gender: genderVal, conditions, conditionsOther: otherText }
    renderStep(container)
  })
}

// ── Render current wizard step ────────────────────────────────────────────────
function renderStep(container) {
  _appContainer = container
  const STEPS = getSteps()
  const s   = STEPS[step]
  const pct = Math.round((step / STEPS.length) * 100)
  const cap = captured[s.key]

  const animClass = direction === 'forward' ? 'slide-from-right' : 'slide-from-left'
  const isScleraUncaptured = (s.key === 'sclera' && !cap)

  container.innerHTML = `
    <div class="flex flex-col min-h-dvh bg-gradient-to-b from-[#0f0f1a] to-[#0d1a2e] ${animClass}">

      <!-- Header -->
      <header class="px-4 pt-4 pb-3 flex flex-col gap-2.5 border-b border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E0B990] to-[#C9956D] flex items-center justify-center shrink-0 shadow shadow-[#C9956D]/30">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs text-slate-500 font-medium">${s.label}</p>
            <p class="text-sm font-bold text-white leading-tight truncate">${s.emoji} ${s.title}</p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button id="tts-btn" title="${t('listenBtn')}"
              class="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-[#2DD4BF] transition-colors active:scale-90">
              🔊
            </button>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-[#C9956D] to-[#2DD4BF] rounded-full transition-all duration-500"
               style="width:${pct}%"></div>
        </div>

        <!-- Step dots -->
        <div class="flex gap-1.5 justify-center">
          ${STEPS.map((_, i) => `
            <div class="rounded-full transition-all duration-300
                        ${i < step  ? 'w-5 h-2 bg-green-500' :
                          i === step ? 'w-6 h-2 bg-[#C9956D]' :
                                       'w-2 h-2 bg-slate-700'}">
            </div>`).join('')}
        </div>
      </header>

      <!-- Camera viewfinder -->
      <main class="flex-1 flex flex-col items-center px-4 pt-3 pb-4 gap-3 overflow-y-auto">

        <div class="relative w-full max-w-sm shrink-0">
          <div class="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#C9956D]/10 to-[#2DD4BF]/10 blur-xl -z-10"></div>
          <div id="viewfinder" class="relative rounded-3xl overflow-hidden border-2 ${cap ? 'border-green-500/60' : 'border-[#2DD4BF]/40'} bg-[#111827] shadow-2xl" style="aspect-ratio:3/4;">

            <video id="camera-video" class="absolute inset-0 w-full h-full object-cover ${cap ? 'opacity-30' : ''}"
                   autoplay playsinline muted></video>

            ${cap ? `<img src="${scanData[s.key]?.image}" class="absolute inset-0 w-full h-full object-cover" alt="Captured"/>` : ''}

            <canvas id="capture-canvas" class="hidden"></canvas>

            <!-- SVG Guide overlay -->
            <div class="absolute inset-0 pointer-events-none">
              ${getOverlaySVG(s.overlay, cap)}
            </div>

            <!-- Flash overlay -->
            <div id="capture-flash" class="hidden absolute inset-0 bg-white rounded-3xl pointer-events-none" style="opacity:0"></div>

            <!-- Countdown overlay -->
            <div id="countdown-overlay" class="hidden absolute inset-0 flex items-center justify-center bg-[#0f0f1a]/70">
              <div class="relative w-28 h-28">
                <svg class="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(6,182,212,0.2)" stroke-width="7"/>
                  <circle id="cd-circle" cx="50" cy="50" r="44" fill="none"
                          stroke="#2DD4BF" stroke-width="7" stroke-linecap="round"
                          stroke-dasharray="276.46" stroke-dashoffset="0"
                          style="transition: stroke-dashoffset 0.95s linear"/>
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                  <span id="cd-num" class="text-6xl font-black text-white" style="text-shadow:0 0 20px rgba(34,211,238,0.8)">3</span>
                </div>
              </div>
            </div>

            <!-- Captured badge -->
            ${cap ? `
            <div class="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
              <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/90 backdrop-blur-sm shadow-lg check-pop">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
                <span class="text-xs text-white font-bold">${t('captured')}</span>
              </div>
            </div>` : ''}

            <!-- Live face detection badge (real-time) -->
            ${!cap ? `<div id="live-face-badge" class="hidden absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-10"></div>` : ''}

            <!-- Camera loading -->
            <div id="camera-loading" class="absolute inset-0 flex flex-col items-center justify-center gap-3 ${cap ? 'hidden' : ''}">
              <div class="w-8 h-8 rounded-full border-2 border-[#2DD4BF] border-t-transparent analyzing-spinner"></div>
              <p class="text-slate-400 text-xs">${t('cameraLoading')}</p>
            </div>

            <!-- Camera denied -->
            <div id="camera-denied" class="hidden absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#111827]">
              <div class="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                </svg>
              </div>
              <p class="text-slate-300 text-xs font-semibold">${t('cameraDenied')}</p>
              <p class="text-slate-500 text-xs">${t('cameraDeniedSub')}</p>
              <button id="retry-camera" class="px-4 py-2 text-xs font-bold rounded-full bg-[#C9956D] text-white active:scale-95">${t('btnRetryCamera')}</button>
            </div>

          </div>
        </div>

        <!-- Instruction card -->
        <div class="w-full max-w-sm rounded-2xl bg-slate-800/60 border border-slate-700/40 p-4 flex flex-col gap-2">
          <p class="text-white text-sm font-semibold leading-snug">${s.inst}</p>
          <div class="flex items-start gap-2">
            <span class="text-[#2DD4BF] text-xs shrink-0 mt-0.5">💡</span>
            <p class="text-slate-400 text-xs leading-relaxed">${s.tip}</p>
          </div>
          ${cap ? `
          <div class="flex items-center gap-2 mt-1 pt-2 border-t border-slate-700/40">
            <span class="text-green-400 text-sm">✅</span>
            <span class="text-xs font-medium text-green-400">${t('stepDone')}</span>
          </div>` : ''}
          ${isScleraUncaptured ? `
          <div class="flex items-center gap-2 mt-1 pt-2 border-t border-slate-700/40">
            <div class="w-3.5 h-3.5 rounded-full border-2 border-[#2DD4BF] border-t-transparent analyzing-spinner shrink-0"></div>
            <p id="eye-seq-label" class="text-[#2DD4BF] text-xs font-medium">${t('eyeSeqHint')}</p>
          </div>` : ''}
        </div>

        <!-- Action buttons -->
        <div class="w-full max-w-sm flex flex-col gap-2.5 mt-auto">

          ${cap ? `
          <div class="flex gap-3">
            <button id="retake-btn"
              class="flex-1 py-3.5 rounded-2xl font-semibold text-sm text-slate-300
                     bg-slate-800 border border-slate-600/50 active:scale-95 transition-all
                     flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              ${t('btnRetake')}
            </button>
            <button id="next-btn"
              class="flex-1 py-3.5 rounded-2xl font-bold text-sm text-white
                     bg-gradient-to-r from-[#C9956D] to-[#A87B55]
                     shadow-lg shadow-[#C9956D]/25 active:scale-95 transition-all
                     flex items-center justify-center gap-2">
              ${s.btn}
            </button>
          </div>` : `
          <button id="capture-btn" ${isScleraUncaptured ? 'disabled' : 'disabled'}
            class="w-full py-4 rounded-2xl font-bold text-base text-white
                   bg-gradient-to-r from-[#C9956D] to-[#A87B55]
                   shadow-lg shadow-[#C9956D]/25 active:scale-95 transition-all
                   disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100
                   flex items-center justify-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
            ${t('btnScan')}
          </button>`}

          <div class="flex gap-3">
            ${step > 0 ? `
            <button id="back-btn"
              class="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-400
                     bg-slate-800/60 border border-slate-700/40 active:scale-95 transition-all
                     flex items-center justify-center gap-1">
              ${t('btnBack')}
            </button>` : '<div class="flex-1"></div>'}
            <button id="skip-btn"
              class="flex-1 py-2.5 rounded-xl text-xs font-medium text-slate-500
                     bg-slate-800/30 border border-slate-700/20 active:scale-95 transition-all">
              ${t('btnSkip')}
            </button>
          </div>

        </div>

      </main>
    </div>
  `

  // Attach camera stream (or init)
  if (stream) {
    const vid = document.getElementById('camera-video')
    if (vid) {
      vid.srcObject = stream
      vid.play().catch(() => {})
      document.getElementById('camera-loading')?.classList.add('hidden')
      if (!isScleraUncaptured) enableCaptureBtn()
      startLiveDetection()
    }
  } else {
    initCamera()
  }

  // Wire events
  document.getElementById('tts-btn')?.addEventListener('click', () => speak(s.tts))
  document.getElementById('retry-camera')?.addEventListener('click', initCamera)
  document.getElementById('back-btn')?.addEventListener('click', handleBack)
  document.getElementById('skip-btn')?.addEventListener('click', handleSkip)
  if (cap) {
    document.getElementById('retake-btn')?.addEventListener('click', handleRetake)
    document.getElementById('next-btn')?.addEventListener('click', handleNext)
  } else {
    document.getElementById('capture-btn')?.addEventListener('click', handleCaptureClick)
  }

  // Eye movement sequence for sclera step
  if (isScleraUncaptured) {
    setTimeout(runEyeSequence, 1200)
  }

  // Auto-speak — only once per step; re-renders of the same step (capture/retake/lang toggle) are silent
  if (_prevSpokenStep !== step) {
    _prevSpokenStep = step
    setTimeout(() => speak(s.tts), 600)
  }
}

// ── SVG Overlays (with i18n text) ─────────────────────────────────────────────
function getOverlaySVG(type, isCaptured) {
  const dim = isCaptured ? '0.35' : '1'

  const svg = (content) =>
    `<svg class="absolute inset-0 w-full h-full" viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg" style="opacity:${dim}">${content}</svg>`

  switch (type) {
    case 'face': return svg(`
      <defs>
        <mask id="fm">
          <rect width="300" height="400" fill="white"/>
          <ellipse cx="150" cy="175" rx="115" ry="148" fill="black"/>
        </mask>
      </defs>
      <rect width="300" height="400" fill="rgba(0,0,0,0.45)" mask="url(#fm)"/>
      <ellipse cx="150" cy="175" rx="115" ry="148" fill="none" stroke="#2DD4BF" stroke-width="2.5" stroke-dasharray="12 5"/>
      <line x1="35" y1="27" x2="55" y2="27" stroke="#2DD4BF" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="35" y1="27" x2="35" y2="47" stroke="#2DD4BF" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="265" y1="27" x2="245" y2="27" stroke="#2DD4BF" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="265" y1="27" x2="265" y2="47" stroke="#2DD4BF" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="35" y1="373" x2="55" y2="373" stroke="#2DD4BF" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="35" y1="373" x2="35" y2="353" stroke="#2DD4BF" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="265" y1="373" x2="245" y2="373" stroke="#2DD4BF" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="265" y1="373" x2="265" y2="353" stroke="#2DD4BF" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="150" cy="175" r="4" fill="none" stroke="#2DD4BF" stroke-width="1.5" opacity="0.6"/>
      <line x1="140" y1="175" x2="130" y2="175" stroke="#2DD4BF" stroke-width="1" opacity="0.5"/>
      <line x1="160" y1="175" x2="170" y2="175" stroke="#2DD4BF" stroke-width="1" opacity="0.5"/>
      <line x1="150" y1="165" x2="150" y2="155" stroke="#2DD4BF" stroke-width="1" opacity="0.5"/>
      <line x1="150" y1="185" x2="150" y2="195" stroke="#2DD4BF" stroke-width="1" opacity="0.5"/>
    `)

    case 'eyes': return svg(`
      <rect width="300" height="400" fill="rgba(0,0,0,0.4)"/>
      <ellipse cx="90" cy="170" rx="70" ry="38" fill="rgba(45,212,191,0.06)" stroke="#2DD4BF" stroke-width="2" stroke-dasharray="8 4"/>
      <ellipse cx="210" cy="170" rx="70" ry="38" fill="rgba(45,212,191,0.06)" stroke="#2DD4BF" stroke-width="2" stroke-dasharray="8 4"/>
      <text x="90" y="120" text-anchor="middle" fill="#22d3ee" font-size="11" font-family="system-ui" font-weight="600">${t('svgLeft')}</text>
      <text x="210" y="120" text-anchor="middle" fill="#22d3ee" font-size="11" font-family="system-ui" font-weight="600">${t('svgRight')}</text>
      <line x1="10" y1="170" x2="290" y2="170" stroke="#2DD4BF" stroke-width="0.8" opacity="0.35" stroke-dasharray="4 3"/>
      <circle cx="90" cy="170" r="18" fill="none" stroke="#2DD4BF" stroke-width="1.2" opacity="0.6"/>
      <circle cx="210" cy="170" r="18" fill="none" stroke="#2DD4BF" stroke-width="1.2" opacity="0.6"/>
    `)

    case 'sclera': return svg(`
      <rect width="300" height="400" fill="rgba(0,0,0,0.4)"/>
      <path d="M20,175 Q150,60 280,175 Q150,290 20,175 Z" fill="rgba(45,212,191,0.05)" stroke="#2DD4BF" stroke-width="2"/>
      <!-- Arrows — IDs used by runEyeSequence() for highlighting -->
      <text id="arrow-up"    x="150" y="50"  text-anchor="middle" fill="#22d3ee" font-size="28" opacity="0.3">↑</text>
      <text id="arrow-down"  x="150" y="362" text-anchor="middle" fill="#22d3ee" font-size="28" opacity="0.3">↓</text>
      <text id="arrow-left"  x="22"  y="183" text-anchor="middle" fill="#22d3ee" font-size="28" opacity="0.3">←</text>
      <text id="arrow-right" x="278" y="183" text-anchor="middle" fill="#22d3ee" font-size="28" opacity="0.3">→</text>
      <!-- Direction labels -->
      <text x="150" y="75"  text-anchor="middle" fill="#22d3ee" font-size="10" font-family="system-ui">${t('svgUp')}</text>
      <text x="150" y="337" text-anchor="middle" fill="#22d3ee" font-size="10" font-family="system-ui">${t('svgDown')}</text>
      <text x="40"  y="200" text-anchor="middle" fill="#22d3ee" font-size="10" font-family="system-ui">${t('svgLeft').charAt(0)}${t('svgLeft').slice(1).toLowerCase()}</text>
      <text x="260" y="200" text-anchor="middle" fill="#22d3ee" font-size="10" font-family="system-ui">${t('svgRight').charAt(0)}${t('svgRight').slice(1).toLowerCase()}</text>
      <circle cx="150" cy="175" r="22" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="6 3"/>
    `)

    case 'tongue': return svg(`
      <rect width="300" height="400" fill="rgba(0,0,0,0.42)"/>
      <path d="M75,195 Q150,165 225,195" fill="none" stroke="#2DD4BF" stroke-width="2.5"/>
      <path d="M75,195 Q110,230 150,235 Q190,230 225,195" fill="none" stroke="#2DD4BF" stroke-width="2.5"/>
      <ellipse cx="150" cy="290" rx="68" ry="62" fill="rgba(239,68,68,0.1)" stroke="#ef4444" stroke-width="2" stroke-dasharray="10 5"/>
      <text x="150" y="385" text-anchor="middle" fill="#ef4444" font-size="11" font-family="system-ui" font-weight="600">${t('svgTongue')}</text>
      <circle cx="150" cy="285" r="6" fill="none" stroke="#ef4444" stroke-width="1.5" opacity="0.7"/>
    `)

    case 'lips': return svg(`
      <rect width="300" height="400" fill="rgba(0,0,0,0.42)"/>
      <path d="M70,185 Q100,165 125,178 Q150,165 175,178 Q200,165 230,185 Q200,202 150,207 Q100,202 70,185 Z"
            fill="rgba(239,68,68,0.08)" stroke="#2DD4BF" stroke-width="2.2"/>
      <path d="M70,185 Q110,230 150,237 Q190,230 230,185 Q200,202 150,207 Q100,202 70,185 Z"
            fill="rgba(239,68,68,0.06)" stroke="#2DD4BF" stroke-width="2" opacity="0.8"/>
      <path d="M115,172 Q130,163 145,170" fill="none" stroke="#2DD4BF" stroke-width="1.2" opacity="0.5"/>
      <path d="M185,172 Q170,163 155,170" fill="none" stroke="#2DD4BF" stroke-width="1.2" opacity="0.5"/>
      <text x="150" y="140" text-anchor="middle" fill="#22d3ee" font-size="11" font-family="system-ui">${t('svgLipsLabel')}</text>
    `)

    case 'skin': return svg(`
      <rect width="300" height="400" fill="rgba(0,0,0,0.32)"/>
      <rect x="70" y="28" width="160" height="70" rx="8"
            fill="rgba(45,212,191,0.05)" stroke="#2DD4BF" stroke-width="1.5" stroke-dasharray="6 4"/>
      <text x="150" y="22" text-anchor="middle" fill="#22d3ee" font-size="10" font-family="system-ui" font-weight="600">${t('svgForehead')}</text>
      <rect x="16" y="155" width="90" height="105" rx="8"
            fill="rgba(45,212,191,0.05)" stroke="#2DD4BF" stroke-width="1.5" stroke-dasharray="6 4"/>
      <text x="61" y="148" text-anchor="middle" fill="#22d3ee" font-size="9" font-family="system-ui" font-weight="600">${t('svgLeftCheek')}</text>
      <rect x="194" y="155" width="90" height="105" rx="8"
            fill="rgba(45,212,191,0.05)" stroke="#2DD4BF" stroke-width="1.5" stroke-dasharray="6 4"/>
      <text x="239" y="148" text-anchor="middle" fill="#22d3ee" font-size="9" font-family="system-ui" font-weight="600">${t('svgRightCheek')}</text>
      <rect x="122" y="115" width="56" height="115" rx="6"
            fill="rgba(251,191,36,0.04)" stroke="#fbbf24" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.7"/>
      <text x="150" y="342" text-anchor="middle" fill="#22d3ee" font-size="10" font-family="system-ui">${t('svgRotate')}</text>
    `)

    default: return ''
  }
}

// ── Eye movement sequence (Step 3) ────────────────────────────────────────────
async function runEyeSequence() {
  const DIRS = [
    { id: 'arrow-up',    prompt: t('lookUp')    },
    { id: 'arrow-down',  prompt: t('lookDown')  },
    { id: 'arrow-left',  prompt: t('lookLeft')  },
    { id: 'arrow-right', prompt: t('lookRight') },
  ]

  const seqLabel = document.getElementById('eye-seq-label')
  const allArrows = ['arrow-up', 'arrow-down', 'arrow-left', 'arrow-right']

  for (const dir of DIRS) {
    // Highlight current arrow, dim others
    allArrows.forEach(id => {
      const el = document.getElementById(id)
      if (el) el.setAttribute('opacity', id === dir.id ? '1' : '0.15')
    })
    if (seqLabel) seqLabel.textContent = dir.prompt
    speak(dir.prompt)
    vibrate([30])
    await delay(2400)
  }

  // Reset all arrows to full opacity
  allArrows.forEach(id => {
    const el = document.getElementById(id)
    if (el) el.setAttribute('opacity', '0.9')
  })

  if (seqLabel) seqLabel.textContent = t('eyeSeqReady')
  vibrate([40, 30, 40])
  speak(t('eyeSeqReady'))

  // Sequence done — enable capture button (camera must also be ready)
  const captureBtn = document.getElementById('capture-btn')
  if (captureBtn) {
    captureBtn.disabled = false
    captureBtn.classList.remove('opacity-40', 'cursor-not-allowed', 'scale-100')
  }
}

// ── Camera ────────────────────────────────────────────────────────────────────
async function initCamera() {
  const vid     = document.getElementById('camera-video')
  const loading = document.getElementById('camera-loading')
  const denied  = document.getElementById('camera-denied')
  const btn     = document.getElementById('capture-btn')

  if (loading) loading.classList.remove('hidden')
  if (denied)  denied.classList.add('hidden')
  if (btn)     btn.disabled = true

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    })
    if (vid) { vid.srcObject = stream; await vid.play() }
    if (loading) loading.classList.add('hidden')
    startLiveDetection()
    // Only auto-enable if not the sclera sequence step
    const STEPS = getSteps()
    if (STEPS[step].key !== 'sclera' || captured[STEPS[step].key]) enableCaptureBtn()
  } catch {
    if (loading) loading.classList.add('hidden')
    if (denied)  denied.classList.remove('hidden')
  }
}

function stopStream() {
  stopLiveDetection()
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
}

function enableCaptureBtn() {
  const btn = document.getElementById('capture-btn')
  if (btn) btn.disabled = false
}

// ── Live face detection (real-time preview indicator) ─────────────────────────
function startLiveDetection() {
  stopLiveDetection()
  _liveDetectPending = false
  _liveDetectTimer = setInterval(async () => {
    if (_liveDetectPending) return
    const vid   = document.getElementById('camera-video')
    const badge = document.getElementById('live-face-badge')
    if (!vid || !badge || vid.readyState < 2 || vid.videoWidth === 0) return

    _liveDetectPending = true
    try {
      const offscreen = document.createElement('canvas')
      offscreen.width = 160; offscreen.height = 120
      offscreen.getContext('2d').drawImage(vid, 0, 0, 160, 120)

      let ok            = imageHasContent(offscreen)
      let faceConfirmed = false   // only true when FaceDetector explicitly finds a face

      if (ok && 'FaceDetector' in window) {
        const stepKey = getSteps()[step]?.key
        if (['face', 'eyes'].includes(stepKey)) {
          try {
            const det  = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
            const bmp  = await createImageBitmap(offscreen)
            const hits = await det.detect(bmp)
            bmp.close()
            ok            = hits.length > 0
            faceConfirmed = ok
          } catch { /* FaceDetector unavailable — trust pixel check */ }
        }
      }

      badge.classList.remove('hidden')
      if (!ok) {
        badge.innerHTML = `<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/80 backdrop-blur-sm shadow">
             <div class="w-1.5 h-1.5 rounded-full bg-amber-200"></div>
             <span class="text-[11px] text-white font-semibold">${t('noFaceTitle')}</span>
           </div>`
      } else {
        // faceConfirmed → FaceDetector found a face; otherwise just pixel check (camera active)
        const label = faceConfirmed ? t('faceOk') : t('cameraActive')
        badge.innerHTML = `<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/75 backdrop-blur-sm shadow">
             <div class="w-1.5 h-1.5 rounded-full bg-green-200"></div>
             <span class="text-[11px] text-white font-semibold">${label}</span>
           </div>`
      }
    } finally {
      _liveDetectPending = false
    }
  }, 800)
}

function stopLiveDetection() {
  if (_liveDetectTimer !== null) {
    clearInterval(_liveDetectTimer)
    _liveDetectTimer = null
  }
}

// ── Capture ───────────────────────────────────────────────────────────────────
async function handleCaptureClick() {
  const btn = document.getElementById('capture-btn')
  if (btn) btn.disabled = true
  stopLiveDetection()
  document.getElementById('live-face-badge')?.classList.add('hidden')

  await runCountdown()

  const vid    = document.getElementById('camera-video')
  const canvas = document.getElementById('capture-canvas')
  if (!vid || !canvas) return

  canvas.width  = vid.videoWidth  || 640
  canvas.height = vid.videoHeight || 480
  const ctx = canvas.getContext('2d')
  ctx.drawImage(vid, 0, 0, canvas.width, canvas.height)

  // Validate face / body-part presence before accepting capture
  const STEPS = getSteps()
  const key = STEPS[step].key
  const faceOk = await checkFacePresent(canvas, key)
  if (!faceOk) {
    showNoFaceWarning()   // shows overlay + re-enables button after 3 s
    startLiveDetection()  // restart live detection for next attempt
    return
  }

  const image = canvas.toDataURL('image/jpeg', 0.88)

  flashCapture()
  vibrate([60, 40, 60])

  scanData[key] = { image, timestamp: Date.now() }
  captured[key] = true

  direction = 'forward'
  renderStep(document.getElementById('app'))
}

// ── Face / content presence check ────────────────────────────────────────────
async function checkFacePresent(canvas, stepKey) {
  // Primary: FaceDetector API (Chrome/Edge — experimental but widely available on Android Chrome)
  if ('FaceDetector' in window) {
    try {
      const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
      const bitmap   = await createImageBitmap(canvas)
      const faces    = await detector.detect(bitmap)
      bitmap.close()
      if (faces.length > 0) return true
      // For full-face steps FaceDetector gives a firm "no" — block it
      if (['face', 'eyes'].includes(stepKey)) return false
      // Close-up steps (tongue, lips, sclera, skin) may not show a full face;
      // fall through to the variance check below
    } catch { /* API unavailable or permission error — fall through */ }
  }

  // Fallback: pixel content check — blocked cameras / blank images are nearly
  // uniform and will have a very low mean absolute deviation across channels
  return imageHasContent(canvas)
}

function imageHasContent(canvas) {
  // Sample a central 320×240 crop for speed
  const sw = Math.min(canvas.width, 320)
  const sh = Math.min(canvas.height, 240)
  const ox = Math.floor((canvas.width  - sw) / 2)
  const oy = Math.floor((canvas.height - sh) / 2)
  const { data } = canvas.getContext('2d').getImageData(ox, oy, sw, sh)

  // Compute mean colour (every 8th pixel)
  let count = 0, sumR = 0, sumG = 0, sumB = 0
  for (let i = 0; i < data.length; i += 32) {
    sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]; count++
  }
  if (count === 0) return true

  const avgR = sumR / count, avgG = sumG / count, avgB = sumB / count
  const brightness = (avgR + avgG + avgB) / 3

  // Very dark → camera covered/blocked. Very bright → lens washed out.
  if (brightness < 30 || brightness > 235) return false

  // Compute Mean Absolute Deviation
  let mad = 0
  for (let i = 0; i < data.length; i += 32) {
    mad += Math.abs(data[i] - avgR) + Math.abs(data[i + 1] - avgG) + Math.abs(data[i + 2] - avgB)
  }
  mad /= count

  // Low MAD → uniform image (covered lens, blank wall, solid colour)
  return mad > 20
}

function showNoFaceWarning() {
  vibrate([100, 50, 100])
  const vf = document.getElementById('viewfinder')
  if (!vf) return

  const warn = document.createElement('div')
  warn.className = 'absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0f0f1a]/93 z-20 p-6 text-center'
  warn.innerHTML = `
    <div class="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>
    </div>
    <p class="text-amber-300 font-bold text-sm">${t('noFaceTitle')}</p>
    <p class="text-slate-400 text-xs leading-relaxed max-w-[200px]">${t('noFaceMsg')}</p>
  `
  vf.appendChild(warn)

  setTimeout(() => {
    warn.remove()
    const captureBtn = document.getElementById('capture-btn')
    if (captureBtn) captureBtn.disabled = false
  }, 3000)
}

async function runCountdown() {
  const overlay = document.getElementById('countdown-overlay')
  const numEl   = document.getElementById('cd-num')
  const circle  = document.getElementById('cd-circle')
  if (!overlay) return

  overlay.classList.remove('hidden')
  circle.style.transition = 'none'
  circle.style.strokeDashoffset = '0'

  for (let i = 3; i >= 1; i--) {
    await delay(20)
    numEl.textContent = i
    circle.style.transition = 'stroke-dashoffset 0.92s linear'
    circle.style.strokeDashoffset = String(92 * (3 - i + 1))
    vibrate([25])
    await delay(980)
  }

  overlay.classList.add('hidden')
}

function flashCapture() {
  const el = document.getElementById('capture-flash')
  if (!el) return
  el.classList.remove('hidden')
  el.style.animation = 'none'
  void el.offsetWidth
  el.style.opacity   = '1'
  el.style.animation = 'captureFlash 0.55s ease-out forwards'
  setTimeout(() => el.classList.add('hidden'), 600)
}

// ── Navigation ────────────────────────────────────────────────────────────────
function handleNext() {
  const STEPS = getSteps()
  direction = 'forward'
  if (step < STEPS.length - 1) {
    step++
    renderStep(document.getElementById('app'))
  } else {
    renderProcessing(document.getElementById('app'))
  }
}

function handleBack() {
  if (step === 0) { stopStream(); router.go('scanner'); return }
  direction = 'back'
  step--
  renderStep(document.getElementById('app'))
}

function handleSkip() {
  const STEPS = getSteps()
  const key = STEPS[step].key
  scanData[key] = { image: null, timestamp: Date.now(), skipped: true }
  captured[key] = true
  handleNext()
}

function handleRetake() {
  const STEPS = getSteps()
  const key = STEPS[step].key
  delete scanData[key]
  delete captured[key]
  direction = 'forward'
  renderStep(document.getElementById('app'))
}

// ── Processing screen ─────────────────────────────────────────────────────────
function renderProcessing(container) {
  const STEPS = getSteps()
  const faceImg = scanData.face?.image || scanData.eyes?.image || null

  container.innerHTML = `
    <div class="flex flex-col min-h-dvh bg-gradient-to-b from-[#0f0f1a] to-[#0d1a2e] slide-from-right">

      <header class="flex items-center justify-center gap-3 py-5 px-4">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E0B990] to-[#C9956D] flex items-center justify-center shadow-lg shadow-cyan-500/30">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </div>
        <div>
          <h1 class="text-base font-bold text-white leading-tight">Face Health Scanner</h1>
          <p id="header-sub" class="text-xs text-cyan-400/80">${t('sending')}</p>
        </div>
      </header>

      <main class="flex-1 flex flex-col items-center justify-center px-4 gap-5 pb-8">

        <!-- Face image with laser -->
        <div class="relative w-44 h-56 rounded-2xl overflow-hidden border-2 border-cyan-500/50 shadow-2xl shadow-cyan-500/20">
          ${faceImg
            ? `<img src="${faceImg}" class="w-full h-full object-cover"/>`
            : `<div class="w-full h-full bg-slate-800 flex items-center justify-center text-5xl">👤</div>`}
          <div id="laser-line" class="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#C9956D] to-transparent processing-laser" style="top:0%"></div>
          <div class="absolute inset-0 opacity-20" style="background-image:linear-gradient(rgba(201,149,109,0.35) 1px,transparent 1px),linear-gradient(90deg,rgba(201,149,109,0.35) 1px,transparent 1px);background-size:20px 20px"></div>
        </div>

        <!-- Thumbnails -->
        <div class="flex gap-2 flex-wrap justify-center max-w-xs">
          ${STEPS.filter(s => scanData[s.key]?.image).map(s => `
            <div class="relative w-10 rounded-lg overflow-hidden border border-cyan-500/40" style="height:3.25rem">
              <img src="${scanData[s.key].image}" class="w-full h-full object-cover" alt="${s.emoji}"/>
              <div class="absolute bottom-0 inset-x-0 bg-[#0f0f1a]/80 text-center" style="padding:1px 0">
                <span style="font-size:10px">${s.emoji}</span>
              </div>
            </div>`).join('')}
        </div>

        <!-- Progress -->
        <div class="w-full max-w-sm flex flex-col gap-4">
          <div class="flex flex-col items-center gap-3">
            <div class="relative w-14 h-14">
              <div class="absolute inset-0 rounded-full border-2 border-cyan-500/20"></div>
              <div class="absolute inset-0 rounded-full border-2 border-[#2DD4BF] border-t-transparent analyzing-spinner"></div>
              <div class="absolute inset-2 rounded-full border border-[#2DD4BF]/40 border-b-transparent analyzing-spinner" style="animation-duration:1.5s;animation-direction:reverse"></div>
            </div>
            <div class="text-center">
              <p id="check-text" class="text-white font-semibold text-sm">${t('prep')}</p>
              <p id="check-sub"  class="text-cyan-400/70 text-xs mt-0.5">${t('procSubLabel')}</p>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex justify-between text-xs">
              <span class="text-slate-400">${t('progress')}</span>
              <span id="pct-text" class="text-cyan-400 font-bold">0%</span>
            </div>
            <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div id="progress-bar" class="h-full bg-gradient-to-r from-[#C9956D] to-[#2DD4BF] rounded-full transition-all duration-500" style="width:0%"></div>
            </div>
          </div>

          <div id="checks-list" class="flex flex-col gap-1.5 max-h-28 overflow-hidden"></div>

          <!-- Error box -->
          <div id="error-box" class="hidden rounded-2xl bg-red-500/10 border border-red-500/30 p-4 flex flex-col gap-3">
            <div class="flex gap-2 items-start">
              <span class="text-lg">⚠️</span>
              <div class="flex-1">
                <p class="text-red-300 font-semibold text-sm">${t('errorTitle')}</p>
                <p id="error-msg" class="text-red-400/80 text-xs mt-1 leading-relaxed font-mono break-all"></p>
              </div>
            </div>
            <div class="flex gap-2">
              <button id="retry-api-btn"
                class="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-[#C9956D] active:scale-95 transition-all">
                ${t('btnRetryApi')}
              </button>
              <button id="demo-mode-btn"
                class="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-700 active:scale-95 transition-all">
                ${t('btnDemo')}
              </button>
            </div>
          </div>
        </div>

      </main>
    </div>
  `

  runProcessing()
}

// ── Processing helpers ────────────────────────────────────────────────────────
function setProgress(text, pct, sub = '') {
  const el = document.getElementById('check-text')
  const ps = document.getElementById('check-sub')
  const pt = document.getElementById('pct-text')
  const pb = document.getElementById('progress-bar')
  const hs = document.getElementById('header-sub')
  if (el) el.textContent = text
  if (ps && sub) ps.textContent = sub
  if (pt) pt.textContent = pct + '%'
  if (pb) pb.style.width = pct + '%'
  if (hs) hs.textContent = text
}

function addCheckItem(text, success = true) {
  const list = document.getElementById('checks-list')
  if (!list) return
  const div = document.createElement('div')
  div.className = 'flex items-center gap-2 check-pop'
  div.innerHTML = `
    <span class="w-4 h-4 rounded-full ${success ? 'bg-green-500/20' : 'bg-red-500/20'} flex items-center justify-center shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-2.5 h-2.5 ${success ? 'text-green-400' : 'text-red-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
        ${success
          ? '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>'
          : '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>'}
      </svg>
    </span>
    <span class="text-xs text-slate-400">${text}</span>
  `
  list.appendChild(div)
  list.scrollTop = list.scrollHeight
}

function showError(msg) {
  const box     = document.getElementById('error-box')
  const msgEl   = document.getElementById('error-msg')
  const spinner = document.querySelector('.analyzing-spinner')
  if (box)     box.classList.remove('hidden')
  if (msgEl)   msgEl.textContent = msg
  if (spinner) spinner.style.animationPlayState = 'paused'

  document.getElementById('retry-api-btn')?.addEventListener('click', () => {
    document.getElementById('error-box')?.classList.add('hidden')
    const spinner2 = document.querySelector('.analyzing-spinner')
    if (spinner2) spinner2.style.animationPlayState = 'running'
    runProcessing()
  })
  document.getElementById('demo-mode-btn')?.addEventListener('click', runDemoMode)
}

// Separate error display for "no face in images" — no demo mode offered
function showNoFaceAnalysisError(msg) {
  const box     = document.getElementById('error-box')
  const msgEl   = document.getElementById('error-msg')
  const spinner = document.querySelector('.analyzing-spinner')
  if (box)     box.classList.remove('hidden')
  if (msgEl)   msgEl.textContent = msg
  if (spinner) spinner.style.animationPlayState = 'paused'

  // Relabel title and override button to go back to scanner
  const titleEl = box?.querySelector('p.font-semibold')
  if (titleEl) titleEl.textContent = t('noFaceTitle')

  // Replace buttons: one "Scan Again" only; hide demo mode
  const retryBtn = document.getElementById('retry-api-btn')
  const demoBtn  = document.getElementById('demo-mode-btn')
  if (demoBtn) demoBtn.classList.add('hidden')
  if (retryBtn) {
    retryBtn.textContent = t('btnScanAgain')
    retryBtn.classList.add('col-span-2', 'w-full')
    retryBtn.addEventListener('click', () => { stopStream(); router.go('scanner') })
  }
}

// ── Gemini processing flow ────────────────────────────────────────────────────
async function runProcessing() {
  const imgCount = Object.values(scanData).filter(v => v?.image).length
  try {
    setProgress(t('prep'), 10, t('prepSub'))
    await delay(400)
    addCheckItem(`${imgCount} ${t('imagesRecorded')} ✓`)

    setProgress(t('sending'), 25, t('procSubLabel'))
    await delay(300)

    const { analyzeFaceImage, mapToConditions } = await import('../gemini-analyzer.js')
    const geminiResult = await analyzeFaceImage(scanData, userProfile)

    // Hard block: Gemini reports no face in any submitted image
    if (geminiResult.faceDetected === false) {
      const err = new Error(t('noFaceImagesMsg'))
      err.isNoFace = true
      throw err
    }

    addCheckItem(t('geminiDone'))

    setProgress(t('parsing'), 55, t('parsingSub'))
    await delay(500)
    addCheckItem(t('eyesDone'))
    await delay(300)
    addCheckItem(t('skinDone'))
    await delay(300)
    addCheckItem(t('lipsDone'))

    setProgress(t('mapping'), 78, '')
    await delay(500)
    const detected = mapToConditions(geminiResult, ALL_CONDITIONS)
    addCheckItem(`${detected.length} ${t('condDetected')} ✓`)

    setProgress(t('compiling'), 92, t('almostDone'))
    await delay(500)
    addCheckItem(`${t('aiConfidence')}: ${Math.round((geminiResult.confidence ?? 0.8) * 100)}% ✓`)

    setProgress(t('analysisDone'), 100, t('openingReport'))
    await delay(700)

    stopStream()
    router.go('results', { scanData, detected, geminiResult })

  } catch (err) {
    console.error('[Gemini]', err)
    addCheckItem(`${t('errorPrefix')}: ${err.message}`, false)
    setProgress(t('analysisError'), 0, '')
    if (err.isNoFace) {
      showNoFaceAnalysisError(err.message)
    } else {
      showError(err.message)
    }
  }
}

// ── Demo fallback ─────────────────────────────────────────────────────────────
async function runDemoMode() {
  document.getElementById('error-box')?.classList.add('hidden')
  const spinner = document.querySelector('.analyzing-spinner')
  if (spinner) spinner.style.animationPlayState = 'running'

  setProgress(t('demoSimulating'), 30, t('demoNoApi'))
  await delay(800)
  addCheckItem(t('demoActive'))

  setProgress(t('demoRandom'), 70, '')
  await delay(800)

  const count    = 2 + Math.floor(Math.random() * 2)
  const detected = [...ALL_CONDITIONS].sort(() => Math.random() - 0.5).slice(0, count)

  setProgress(t('demoDone'), 100, '')
  await delay(600)

  stopStream()
  router.go('results', { scanData, detected, geminiResult: null })
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

const _MALE_NAMES = ['david', 'daniel', 'mark', 'fred', 'james', 'aaron', 'gordon', 'lee', 'richard', 'thomas', 'paul', 'george', 'oliver', 'harry', 'rishi', 'arthur', 'tom', 'alex']

function speak(text) {
  if (!window.speechSynthesis) return
  speechSynthesis.cancel()

  const lang   = getLang()
  const prefix = lang === 'bm' ? 'ms' : 'en'
  const voices = speechSynthesis.getVoices()

  const isMale = v => _MALE_NAMES.some(n => v.name.toLowerCase().includes(n))
  // Prefer female (non-male) voice; fall back to any matching voice
  const voice  = voices.find(v => v.lang.toLowerCase().startsWith(prefix) && !isMale(v))
               ?? voices.find(v => v.lang.toLowerCase().startsWith(prefix))
               ?? null

  // No Malay voice installed → skip TTS rather than mispronounce with an English voice
  if (lang === 'bm' && !voice) return

  const u  = new SpeechSynthesisUtterance(text)
  u.lang   = lang === 'bm' ? 'ms-MY' : 'en-US'
  u.rate   = 0.88
  u.pitch  = 1.05
  if (voice) u.voice = voice
  speechSynthesis.speak(u)
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern)
}
