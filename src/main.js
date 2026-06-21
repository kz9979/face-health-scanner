import './style.css'
import { renderScanner } from './pages/scanner.js'
import { renderResults } from './pages/results.js'

const app = document.getElementById('app')

export const router = {
  go(page, data = null) {
    if (page === 'scanner') {
      renderScanner(app)
    } else if (page === 'results') {
      renderResults(app, data)
    }
  }
}

router.go('scanner')
