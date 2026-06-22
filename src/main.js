import './style.css'
import { renderScanner } from './pages/scanner.js'
import { renderResults } from './pages/results.js'
import { setLang } from './i18n.js'

const app = document.getElementById('app')

let _currentPage = 'scanner'
let _currentData = null

export const router = {
  go(page, data = null) {
    _currentPage = page
    _currentData = data
    if (page === 'scanner') {
      renderScanner(app)
    } else if (page === 'results') {
      renderResults(app, data)
    }
  }
}

// Listen for language change from parent page (polikliniknazmir.com iframe postMessage)
window.addEventListener('message', (e) => {
  const { type, lang } = e.data ?? {}
  if (type !== 'SET_LANG' || (lang !== 'bm' && lang !== 'en')) return
  setLang(lang)
  if (_currentPage === 'scanner') renderScanner(app)
  else if (_currentPage === 'results') renderResults(app, _currentData)
})

router.go('scanner')
