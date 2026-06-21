import { router } from '../main.js'
import healthData from '../../health-data.json'
import { t, getLang, setLang } from '../i18n.js'

const ACTION    = healthData.actionLevels
const FACE_MAP  = healthData.faceMapping.tcm
const DAILY     = healthData.generalRecommendations.daily
const DISCLAIMER = healthData.disclaimer.ms

// Module-level — needed by language toggle to re-render without losing data
let _appContainer = null
let _savedArgs    = null

function getSEV() {
  return {
    critical: {
      label: t('sev_critical'), bg: 'bg-red-500/20', border: 'border-red-500/50',
      badge: 'bg-red-500 text-white', dot: 'bg-red-500', text: 'text-red-400',
      urgentBg: 'bg-red-500/15 border-red-500/40', urgentText: 'text-red-200',
    },
    high: {
      label: t('sev_high'), bg: 'bg-orange-500/10', border: 'border-orange-500/30',
      badge: 'bg-orange-500 text-white', dot: 'bg-orange-500', text: 'text-orange-400',
      urgentBg: 'bg-orange-500/15 border-orange-500/40', urgentText: 'text-orange-200',
    },
    medium: {
      label: t('sev_medium'), bg: 'bg-yellow-500/10', border: 'border-yellow-500/30',
      badge: 'bg-yellow-500 text-black', dot: 'bg-yellow-400', text: 'text-yellow-400',
      urgentBg: 'bg-yellow-500/15 border-yellow-500/40', urgentText: 'text-yellow-200',
    },
    low: {
      label: t('sev_low'), bg: 'bg-emerald-500/10', border: 'border-emerald-500/30',
      badge: 'bg-emerald-500 text-white', dot: 'bg-emerald-400', text: 'text-emerald-400',
      urgentBg: 'bg-emerald-500/15 border-emerald-500/40', urgentText: 'text-emerald-200',
    },
  }
}

function getScanLabels() {
  return {
    face:   { emoji: '👤', label: t('scan_face')   },
    eyes:   { emoji: '👁️', label: t('scan_eyes')   },
    sclera: { emoji: '🔍', label: t('scan_sclera') },
    tongue: { emoji: '👅', label: t('scan_tongue') },
    lips:   { emoji: '💋', label: t('scan_lips')   },
    skin:   { emoji: '✨', label: t('scan_skin')   },
  }
}

export function renderResults(container, { scanData = {}, imageDataUrl, detected, geminiResult = null }) {
  _appContainer = container
  _savedArgs    = { scanData, imageDataUrl, detected, geminiResult }

  const primaryImage = scanData.face?.image || scanData.eyes?.image || imageDataUrl || null
  const scanEntries  = Object.entries(scanData).filter(([, v]) => v?.image && !v.skipped)
  const SEV          = getSEV()
  const SCAN_LABELS  = getScanLabels()

  const topSev = getHighestSeverity(detected)
  const s   = SEV[topSev]
  const act = ACTION[topSev]

  const lang = getLang()
  const dateStr = new Date().toLocaleDateString(lang === 'bm' ? 'ms-MY' : 'en-US', { dateStyle: 'long' })

  container.innerHTML = `
    <div class="flex flex-col min-h-dvh bg-gradient-to-b from-[#0f0f1a] to-[#0d1a2e] fade-in">

      <!-- Header -->
      <header class="flex items-center gap-3 py-4 px-4 border-b border-white/5 sticky top-0 z-10 bg-[#0f0f1a]/90 backdrop-blur-sm">
        <button id="back-btn" class="w-9 h-9 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors active:scale-95 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="text-base font-bold text-white leading-tight">${t('resultsTitle')}</h1>
          <p class="text-xs text-slate-400">${dateStr}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full ${s.bg} border ${s.border}">
            <span class="w-2 h-2 rounded-full ${s.dot} animate-pulse"></span>
            <span class="text-xs font-semibold ${s.text}">${s.label}</span>
          </div>
          <button id="lang-toggle"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition-colors active:scale-90 border border-slate-700/50">
            ${t('langBtn')}
          </button>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto">
        <div class="max-w-lg mx-auto px-4 py-5 flex flex-col gap-5">

          <!-- Summary -->
          <div class="flex flex-col gap-3 slide-up">
            <div class="flex gap-4 items-start">
              <div class="relative shrink-0">
                ${primaryImage
                  ? `<img src="${primaryImage}" alt="scan" class="w-24 h-32 object-cover rounded-2xl border-2 border-cyan-500/40 shadow-lg shadow-cyan-500/20"/>`
                  : `<div class="w-24 h-32 rounded-2xl border-2 border-cyan-500/40 bg-slate-800 flex items-center justify-center text-4xl">👤</div>`}
                <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-2 border-[#0f0f1a] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
              </div>
              <div class="flex-1 pt-1 min-w-0">
                <p class="text-white font-semibold text-sm">${t('scanDone')}</p>
                <p class="text-slate-400 text-xs mt-1">${lang === 'bm' ? `${scanEntries.length} daripada 6 imbasan berjaya dirakam.` : `${scanEntries.length} of 6 scans recorded.`}</p>
                <p class="text-slate-400 text-xs mt-1">${lang === 'bm' ? `${detected.length} keadaan dikesan.` : `${detected.length} conditions detected.`}</p>
                <div class="flex flex-wrap gap-1.5 mt-2">
                  ${detected.map(c => {
                    const cs   = SEV[c.severity]
                    const icon = ACTION[c.severity].icon
                    const name = lang === 'bm' ? c.name : c.nameEN
                    return `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${cs.badge}">${icon} ${name}</span>`
                  }).join('')}
                </div>
              </div>
            </div>

            <!-- Scan thumbnails strip -->
            ${scanEntries.length > 1 ? `
            <div class="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              ${scanEntries.map(([key, val]) => {
                const meta = SCAN_LABELS[key] || { emoji: '📷', label: key }
                return `
                  <div class="shrink-0 flex flex-col items-center gap-1">
                    <div class="relative w-14 rounded-xl overflow-hidden border border-cyan-500/30" style="height:4.5rem">
                      <img src="${val.image}" class="w-full h-full object-cover" alt="${meta.label}"/>
                    </div>
                    <span class="text-xs text-slate-500 leading-none">${meta.emoji}</span>
                  </div>`
              }).join('')}
            </div>` : ''}
          </div>

          <!-- Urgency banner -->
          <div class="rounded-2xl p-4 border ${s.urgentBg} flex gap-3 items-start slide-up">
            <span class="text-2xl shrink-0">${act.icon}</span>
            <div>
              <p class="font-bold text-sm ${s.urgentText}">${act.message}</p>
              <p class="text-xs text-slate-400 mt-0.5">${lang === 'bm' ? 'Cadangan masa tindakan:' : 'Recommended timeframe:'} <strong class="text-slate-300">${act.timeframe}</strong></p>
            </div>
          </div>

          <!-- Gemini AI insight card -->
          ${geminiResult ? `
          <div class="rounded-2xl bg-gradient-to-br from-slate-800/80 to-blue-900/30 border border-blue-500/30 p-4 flex flex-col gap-3 slide-up">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-blue-600/30 flex items-center justify-center text-sm">🤖</div>
              <div class="flex-1">
                <p class="text-xs font-bold text-blue-300">${t('geminiAI')}</p>
                <p class="text-xs text-slate-500">${t('procSubLabel')}</p>
              </div>
              <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30">
                <span class="text-xs font-bold text-blue-300">${Math.round((geminiResult.confidence ?? 0) * 100)}%</span>
                <span class="text-xs text-slate-500">${t('confidence')}</span>
              </div>
            </div>
            ${geminiResult.notes ? `
            <p class="text-xs text-slate-300 leading-relaxed border-t border-white/5 pt-3">${geminiResult.notes}</p>` : ''}
            ${geminiResult.tongue?.color && geminiResult.tongue.color !== 'pink' ? `
            <div class="flex items-center gap-2 text-xs">
              <span class="text-slate-500">${t('tongueTcm')}</span>
              <span class="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/20 text-amber-300 font-medium capitalize">${geminiResult.tongue.color}</span>
            </div>` : ''}
            <div class="flex flex-wrap gap-1.5">
              ${buildGeminiBadges(geminiResult)}
            </div>
          </div>` : `
          <div class="rounded-2xl bg-slate-800/30 border border-slate-700/30 px-4 py-3 flex items-center gap-2">
            <span class="text-slate-600 text-sm">🤖</span>
            <p class="text-xs text-slate-600">${t('demoNotice')}</p>
          </div>`}

          <!-- Condition cards -->
          <div class="flex flex-col gap-4">
            ${detected.map((c, i) => renderConditionCard(c, i, SEV)).join('')}
          </div>

          <!-- TCM Face Map -->
          ${renderFaceMapSection()}

          <!-- Daily tips -->
          ${renderDailySection()}

          <!-- Disclaimer -->
          <div class="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-4">
            <div class="flex gap-3 items-start">
              <span class="text-lg shrink-0 mt-0.5">⚕️</span>
              <div>
                <p class="text-slate-300 text-sm font-semibold mb-1.5">${t('disclaimerTitle')}</p>
                <p class="text-slate-500 text-xs leading-relaxed">${DISCLAIMER}</p>
              </div>
            </div>
          </div>

          <!-- Scan again -->
          <button id="scan-again-btn"
            class="w-full py-4 rounded-2xl font-bold text-base text-white
                   bg-gradient-to-r from-cyan-500 to-blue-600
                   shadow-lg shadow-cyan-500/30 active:scale-95 transition-all
                   duration-200 hover:shadow-cyan-500/50 hover:shadow-xl
                   flex items-center justify-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            ${t('btnScanAgain')}
          </button>
          <div class="h-4"></div>
        </div>
      </main>
    </div>
  `

  document.getElementById('back-btn').addEventListener('click', () => router.go('scanner'))
  document.getElementById('scan-again-btn').addEventListener('click', () => router.go('scanner'))

  document.getElementById('lang-toggle')?.addEventListener('click', () => {
    setLang(getLang() === 'bm' ? 'en' : 'bm')
    renderResults(container, _savedArgs)
  })

  // Expand/collapse condition cards
  detected.forEach((_, i) => {
    const header  = document.getElementById(`card-header-${i}`)
    const body    = document.getElementById(`card-body-${i}`)
    const chevron = document.getElementById(`chevron-${i}`)
    if (!header || !body) return
    header.addEventListener('click', () => {
      const open = !body.classList.contains('hidden')
      body.classList.toggle('hidden', open)
      chevron.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)'
    })
  })

  // Face map toggle
  const fmToggle  = document.getElementById('facemap-toggle')
  const fmBody    = document.getElementById('facemap-body')
  const fmChevron = document.getElementById('facemap-chevron')
  if (fmToggle && fmBody) {
    fmToggle.addEventListener('click', () => {
      const open = !fmBody.classList.contains('hidden')
      fmBody.classList.toggle('hidden', open)
      fmChevron.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)'
    })
  }
}

// ── Condition card ────────────────────────────────────────────────────────────

function renderConditionCard(c, i, SEV) {
  const s   = SEV[c.severity]
  const act = ACTION[c.severity]
  const lang = getLang()

  const primaryName   = lang === 'bm' ? c.name   : c.nameEN
  const secondaryName = lang === 'bm' ? c.nameEN : c.name

  return `
    <div class="rounded-2xl overflow-hidden border ${s.border} ${s.bg} shadow-lg slide-up" style="animation-delay:${i * 80}ms">

      <div id="card-header-${i}" class="flex items-center gap-3 p-4 cursor-pointer select-none">
        <div class="w-10 h-10 rounded-xl bg-slate-900/70 flex items-center justify-center text-xl shrink-0">${act.icon}</div>
        <div class="flex-1 min-w-0">
          <p class="text-white font-semibold text-sm leading-snug truncate">${primaryName}</p>
          <p class="text-slate-400 text-xs">${secondaryName}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${s.badge}">${s.label}</span>
          <svg id="chevron-${i}" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-500 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </div>

      <div id="card-body-${i}" class="border-t border-white/5 divide-y divide-white/5">

        <div class="px-4 py-3 flex items-center gap-2 ${s.urgentBg}">
          <span class="text-sm">${act.icon}</span>
          <p class="text-xs font-medium ${s.urgentText} flex-1">${act.message}</p>
          <span class="text-xs text-slate-500 shrink-0">${act.timeframe}</span>
        </div>

        ${renderTcmSection(c)}
        ${renderModernSection(c)}
        ${renderTestsSection(c)}
        ${renderRecsSection(c, s)}

      </div>
    </div>
  `
}

// ── TCM section ───────────────────────────────────────────────────────────────

function renderTcmSection(c) {
  const tcm = c.tcm
  if (!tcm) return ''

  if (c.id === 'acne') {
    return `
      <div class="p-4 flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <span class="text-sm">🏮</span>
          <p class="text-xs font-semibold text-slate-300 uppercase tracking-wider">${t('tcmFaceMap')}</p>
        </div>
        <p class="text-xs text-slate-500 leading-relaxed">${t('acneNote')}</p>
        <div class="grid grid-cols-2 gap-2">
          ${tcm.forehead ? `
          <div class="col-span-2 p-3 rounded-xl bg-slate-900/60 border border-amber-500/20">
            <p class="text-xs font-semibold text-amber-300 mb-1">${t('lbl_forehead')}</p>
            <p class="text-xs text-slate-400 font-medium">${tcm.forehead.organ}</p>
            <p class="text-xs text-slate-500 mt-0.5">${tcm.forehead.cause}</p>
          </div>` : ''}
          ${tcm.cheeks ? `
          <div class="p-3 rounded-xl bg-slate-900/60 border border-amber-500/20">
            <p class="text-xs font-semibold text-amber-300 mb-1">${t('lbl_leftCheek')}</p>
            <p class="text-xs text-slate-400">${tcm.cheeks.left}</p>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/60 border border-amber-500/20">
            <p class="text-xs font-semibold text-amber-300 mb-1">${t('lbl_rightCheek')}</p>
            <p class="text-xs text-slate-400">${tcm.cheeks.right}</p>
          </div>
          <div class="col-span-2 px-3 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <p class="text-xs text-slate-500">${tcm.cheeks.cause}</p>
          </div>` : ''}
          ${tcm.chin ? `
          <div class="p-3 rounded-xl bg-slate-900/60 border border-amber-500/20">
            <p class="text-xs font-semibold text-amber-300 mb-1">${t('lbl_chin')}</p>
            <p class="text-xs text-slate-400 font-medium">${tcm.chin.organ}</p>
            <p class="text-xs text-slate-500 mt-0.5">${tcm.chin.cause}</p>
          </div>` : ''}
          ${tcm.nose ? `
          <div class="p-3 rounded-xl bg-slate-900/60 border border-amber-500/20">
            <p class="text-xs font-semibold text-amber-300 mb-1">${t('lbl_nose')}</p>
            <p class="text-xs text-slate-400 font-medium">${tcm.nose.organ}</p>
            <p class="text-xs text-slate-500 mt-0.5">${tcm.nose.cause}</p>
          </div>` : ''}
        </div>
      </div>
    `
  }

  return `
    <div class="p-4 flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <span class="text-sm">🏮</span>
        <p class="text-xs font-semibold text-slate-300 uppercase tracking-wider">${t('tcmHeader')}</p>
      </div>
      <div class="flex flex-col gap-2">
        ${tcm.organ ? `
        <div class="flex gap-2 items-start">
          <span class="text-xs text-slate-500 shrink-0 w-20 pt-0.5">${t('tcmOrgan')}</span>
          <span class="text-xs text-amber-300 font-semibold">${tcm.organ}</span>
        </div>` : ''}
        ${tcm.diagnosis ? `
        <div class="flex gap-2 items-start">
          <span class="text-xs text-slate-500 shrink-0 w-20 pt-0.5">${t('tcmDiag')}</span>
          <span class="text-xs text-slate-300">${tcm.diagnosis}</span>
        </div>` : ''}
        ${tcm.cause ? `
        <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-700/40">
          <p class="text-xs text-slate-500 font-medium mb-1">${t('tcmCause')}</p>
          <p class="text-xs text-slate-400 leading-relaxed">${tcm.cause}</p>
        </div>` : ''}
        ${tcm.treatment ? `
        <div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p class="text-xs text-slate-500 font-medium mb-1">${t('tcmTreat')}</p>
          <p class="text-xs text-amber-300 leading-relaxed">${tcm.treatment}</p>
        </div>` : ''}
      </div>
    </div>
  `
}

// ── Modern Medicine section ───────────────────────────────────────────────────

function renderModernSection(c) {
  const m = c.modern
  if (!m) return ''

  const conditionBadge = `
    <div class="p-3 rounded-xl bg-blue-900/25 border border-blue-500/25">
      <p class="text-xs text-blue-300 font-semibold">${m.condition}</p>
    </div>
  `

  if (c.id === 'moles' && m.checks) {
    const letters = ['A', 'B', 'C', 'D', 'E']
    return `
      <div class="p-4 flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <span class="text-sm">🔬</span>
          <p class="text-xs font-semibold text-slate-300 uppercase tracking-wider">${t('modernHeader')}</p>
        </div>
        ${conditionBadge}
        <p class="text-xs font-semibold text-slate-400">${t('selfCheck')}</p>
        <div class="flex flex-col gap-2">
          ${letters.map(l => `
          <div class="flex gap-3 items-start p-3 rounded-xl bg-slate-900/60 border border-slate-700/40">
            <span class="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">${l}</span>
            <p class="text-xs text-slate-300 leading-relaxed pt-0.5">${m.checks[l]}</p>
          </div>`).join('')}
        </div>
        <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-700/40">
          <p class="text-xs text-slate-500 font-medium mb-1">${t('action')}</p>
          <p class="text-xs text-slate-300 leading-relaxed">${m.action}</p>
        </div>
      </div>
    `
  }

  const causesHtml = (m.causes || []).map(x =>
    `<li class="flex gap-2 items-start"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0"></span><span class="text-slate-400 text-xs">${x}</span></li>`
  ).join('')

  const symptomsHtml = (m.symptoms || []).map(x =>
    `<li class="flex gap-2 items-start"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"></span><span class="text-slate-400 text-xs">${x}</span></li>`
  ).join('')

  const hasSymptoms = (m.symptoms || []).length > 0
  const hasCauses   = (m.causes || []).length > 0

  return `
    <div class="p-4 flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <span class="text-sm">🔬</span>
        <p class="text-xs font-semibold text-slate-300 uppercase tracking-wider">${t('modernHeader')}</p>
      </div>
      ${conditionBadge}
      ${hasCauses || hasSymptoms ? `
      <div class="${hasSymptoms && hasCauses ? 'grid grid-cols-2 gap-3' : ''}">
        ${hasCauses ? `
        <div>
          <p class="text-xs font-medium text-slate-400 mb-2">${t('causes')}</p>
          <ul class="flex flex-col gap-1.5">${causesHtml}</ul>
        </div>` : ''}
        ${hasSymptoms ? `
        <div>
          <p class="text-xs font-medium text-slate-400 mb-2">${t('symptoms')}</p>
          <ul class="flex flex-col gap-1.5">${symptomsHtml}</ul>
        </div>` : ''}
      </div>` : ''}
      ${m.action ? `
      <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-700/40">
        <p class="text-xs text-slate-500 font-medium mb-1">${t('action')}</p>
        <p class="text-xs text-slate-300 leading-relaxed">${m.action}</p>
      </div>` : ''}
    </div>
  `
}

// ── Tests section ─────────────────────────────────────────────────────────────

function renderTestsSection(c) {
  const tests = c.modern?.tests || []
  if (!tests.length) return ''

  return `
    <div class="p-4 flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <span class="text-sm">🧪</span>
        <p class="text-xs font-semibold text-slate-300 uppercase tracking-wider">${t('testsHeader')}</p>
      </div>
      <ul class="flex flex-col gap-1.5">
        ${tests.map(x => `
        <li class="flex gap-2 items-center">
          <span class="text-cyan-400 text-xs shrink-0">▸</span>
          <span class="text-xs text-slate-400">${x}</span>
        </li>`).join('')}
      </ul>
    </div>
  `
}

// ── Recommendations section ───────────────────────────────────────────────────

function renderRecsSection(c, s) {
  const recs = c.recommendations || []
  if (!recs.length) return ''
  const act = ACTION[c.severity]

  return `
    <div class="p-4 flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <span class="text-sm">💡</span>
        <p class="text-xs font-semibold text-slate-300 uppercase tracking-wider">${t('recsHeader')}</p>
      </div>
      <ul class="flex flex-col gap-2">
        ${recs.map(r => `
        <li class="flex gap-2 items-start">
          <span class="shrink-0 text-xs mt-0.5">${act.icon}</span>
          <span class="text-xs text-slate-300 leading-relaxed">${r}</span>
        </li>`).join('')}
      </ul>
    </div>
  `
}

// ── TCM Face Map ──────────────────────────────────────────────────────────────

function renderFaceMapSection() {
  const lang = getLang()
  const zones = [
    { emoji: '⬆️', label: lang === 'bm' ? 'Dahi'          : 'Forehead',       data: FACE_MAP.forehead },
    { emoji: '◀▶', label: lang === 'bm' ? 'Pelipis'       : 'Temples',        data: FACE_MAP.temples },
    { emoji: '🔸', label: lang === 'bm' ? 'Antara Kening' : 'Between Brows',  data: FACE_MAP.betweenEyebrows },
    { emoji: '👁️', label: lang === 'bm' ? 'Bawah Mata'    : 'Under Eyes',     data: FACE_MAP.underEyes },
    { emoji: '👃', label: lang === 'bm' ? 'Hidung'        : 'Nose',           data: FACE_MAP.nose },
    { emoji: '😊', label: lang === 'bm' ? 'Pipi Kiri'     : 'Left Cheek',     data: FACE_MAP.cheeks.left },
    { emoji: '😊', label: lang === 'bm' ? 'Pipi Kanan'    : 'Right Cheek',    data: FACE_MAP.cheeks.right },
    { emoji: '👄', label: lang === 'bm' ? 'Mulut'         : 'Mouth',          data: FACE_MAP.mouth },
    { emoji: '⬇️', label: lang === 'bm' ? 'Dagu'          : 'Chin',           data: FACE_MAP.chin },
    { emoji: '🔵', label: lang === 'bm' ? 'Leher'         : 'Neck',           data: FACE_MAP.neck },
  ]

  const rows = zones.map(z => {
    const organs = Array.isArray(z.data.organs) ? z.data.organs.join(', ') : ''
    const issues = z.data.issues || ''
    return `
      <div class="flex gap-3 items-start py-2.5 border-b border-white/5 last:border-0">
        <span class="text-base shrink-0 w-6 text-center">${z.emoji}</span>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-amber-300">${z.label}</p>
          ${organs ? `<p class="text-xs text-slate-400">${organs}</p>` : ''}
          ${issues ? `<p class="text-xs text-slate-500 mt-0.5">${issues}</p>` : ''}
        </div>
      </div>`
  }).join('')

  return `
    <div class="rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800/30">
      <button id="facemap-toggle" class="w-full flex items-center gap-3 p-4 text-left">
        <span class="text-lg">🗺️</span>
        <div class="flex-1">
          <p class="text-sm font-semibold text-slate-200">${t('faceMapTitle')}</p>
          <p class="text-xs text-slate-500">${t('faceMapSub')}</p>
        </div>
        <svg id="facemap-chevron" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-500 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      <div id="facemap-body" class="hidden px-4 pb-4 flex flex-col">
        ${rows}
      </div>
    </div>
  `
}

// ── Daily tips ────────────────────────────────────────────────────────────────

function renderDailySection() {
  return `
    <div class="rounded-2xl bg-slate-800/30 border border-slate-700/50 p-4 flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <span class="text-lg">📅</span>
        <p class="text-sm font-semibold text-slate-200">${t('dailyTitle')}</p>
      </div>
      <ul class="flex flex-col gap-2">
        ${DAILY.map(d => `
        <li class="flex gap-2 items-center">
          <span class="text-green-400 text-xs shrink-0">✓</span>
          <span class="text-xs text-slate-300">${d}</span>
        </li>`).join('')}
      </ul>
    </div>
  `
}

// ── Gemini badges helper ──────────────────────────────────────────────────────

function buildGeminiBadges(g) {
  const lang = getLang()
  const badges = []
  const add = (bm, en, color) =>
    badges.push(`<span class="px-2 py-0.5 rounded-full text-xs font-medium ${color}">${lang === 'bm' ? bm : en}</span>`)

  if (g.eyes?.yellow)           add('Mata Kuning',       'Yellow Eyes',        'bg-yellow-500/20 text-yellow-300')
  if (g.eyes?.darkCircles)      add('Lingkaran Gelap',   'Dark Circles',       'bg-slate-600/40 text-slate-300')
  if (g.eyes?.puffy)            add('Mata Bengkak',      'Puffy Eyes',         'bg-blue-500/20 text-blue-300')
  if (g.eyes?.red)              add('Mata Merah',        'Red Eyes',           'bg-red-500/20 text-red-300')
  if (g.skin?.butterflyRash)    add('Ruam Rama-Rama',    'Butterfly Rash',     'bg-red-500/20 text-red-300')
  if (g.skin?.acne && g.skin.acne !== 'none')
    add(`Jerawat (${g.skin.acne})`, `Acne (${g.skin.acne})`, 'bg-orange-500/20 text-orange-300')
  if (g.skin?.melasma)          add('Tompok Gelap',      'Melasma',            'bg-purple-500/20 text-purple-300')
  if (g.skin?.xanthelasma)      add('Bintik Kuning',     'Xanthelasma',        'bg-yellow-500/20 text-yellow-300')
  if (g.lips?.cracked)          add('Bibir Pecah',       'Cracked Lips',       'bg-orange-500/20 text-orange-300')
  if (g.lips?.pale)             add('Bibir Pucat',       'Pale Lips',          'bg-slate-500/20 text-slate-300')
  if (g.lips?.sores)            add('Luka Bibir',        'Cold Sores',         'bg-red-500/20 text-red-300')
  if (g.lips?.angularCheilitis) add('Sudut Bibir Pecah', 'Angular Cheilitis',  'bg-orange-500/20 text-orange-300')
  if (g.face?.puffy)            add('Muka Bengkak',      'Puffy Face',         'bg-blue-500/20 text-blue-300')
  if (g.face?.asymmetric)       add('Muka Tak Simetri',  'Facial Asymmetry',   'bg-red-500/20 text-red-300')
  if (g.face?.droopingEyelid)   add('Kelopak Turun',     'Drooping Eyelid',    'bg-orange-500/20 text-orange-300')

  return badges.length
    ? badges.join('')
    : `<span class="text-xs text-slate-600 italic">${t('noBadges')}</span>`
}

// ── Utility ───────────────────────────────────────────────────────────────────

function getHighestSeverity(conditions) {
  for (const level of ['critical', 'high', 'medium', 'low']) {
    if (conditions.some(c => c.severity === level)) return level
  }
  return 'low'
}
