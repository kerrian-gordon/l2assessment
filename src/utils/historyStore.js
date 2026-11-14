/**
 * History store - the one place that reads and writes saved analyses.
 * Never throws: corrupt, missing or full browser storage must not break a page.
 */
const KEY = 'triageHistory'
const MAX_ENTRIES = 500

export function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(data)) return []
    return data.filter(item => item && typeof item.message === 'string' && item.timestamp)
  } catch {
    return []
  }
}

/** @returns {boolean} whether the analysis was saved */
export function saveAnalysis(entry) {
  try {
    const history = loadHistory()
    history.push(entry)
    localStorage.setItem(KEY, JSON.stringify(history.slice(-MAX_ENTRIES)))
    return true
  } catch {
    return false
  }
}

/** @returns {boolean} whether the history was cleared */
export function clearHistory() {
  try {
    localStorage.setItem(KEY, '[]')
    return true
  } catch {
    return false
  }
}
