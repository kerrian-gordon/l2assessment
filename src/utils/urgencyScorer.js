/**
 * Content-based urgency scoring.
 *
 * The previous scorer treated punctuation, short length, politeness, and
 * after-hours timing as the main signals. That inverted real operations:
 * "Database connection lost" scored Low, while excited thank-you notes
 * scored High. Relay AI's value is getting the urgent tickets to a human first.
 */

const CRITICAL_PATTERNS = [
  /\b(production|prod)\b.{0,40}\b(down|outage|offline|crash(?:ed|ing)?)\b/i,
  /\b(server|site|service|api|system)s?\b.{0,30}\b(down|outage|offline|unreachable)\b/i,
  /\b(down|outage|offline)\b.{0,30}\b(server|site|service|api|production|prod)\b/i,
  /\bdatabase\b.{0,30}\b(down|lost|connection|unavailable|offline)\b/i,
  /\b(connection)\b.{0,20}\b(lost|refused|timeout)\b/i,
  /\b(data loss|lost (all )?data|ransomware|security breach|compromised|hacked)\b/i,
  /\b(all customers?|entire (customer )?base|everyone)\b.{0,40}\b(locked out|can't|cannot|unable)\b/i,
  /\b(emergency|sev[\s-]?[0-1]|p[0-1]\b|critical outage)\b/i,
]

const HIGH_PATTERNS = [
  /\b(can't|cannot|unable to|won't|will not)\b.{0,30}\b(log ?in|sign ?in|access|open|use)\b/i,
  /\blocked out\b/i,
  /\b(payment|charge|card)\b.{0,30}\b(fail(?:ed|ing)?|declined|error)\b/i,
  /\b(crash(?:ed|ing)?|timeout|timed out|500|502|503)\b/i,
  /\b(dashboard|checkout|login|app)\b.{0,30}\b(won't load|will not load|not loading|broken)\b/i,
  /\b(blocked|can't access (my )?account)\b/i,
]

const MEDIUM_PATTERNS = [
  /\b(bug|error|broken|not working|issue|problem|slow|loading forever|glitch)\b/i,
  /\b(invoice|refund|subscription|billing|charge|payment method)\b/i,
  /\b(upgrade|downgrade|cancel).{0,20}\b(plan|subscription|account)\b/i,
]

const LOW_PATTERNS = [
  /\b(thank you|thanks|appreciate|grateful|love (the|your)|great job|keep up the)\b/i,
  /\b(feature|dark mode|would be (nice|great|useful)|could you add|suggestion|enhancement)\b/i,
  /\b(business hours|how (do|can) i|where (do|can) i|what are your)\b/i,
  /\b(just wanted to (say|share)|positive feedback|really nice|looks so professional|color scheme)\b/i,
]

function matchesAny(message, patterns) {
  return patterns.some((pattern) => pattern.test(message))
}

function isMostlyUppercase(message) {
  const letters = message.replace(/[^A-Za-z]/g, '')
  if (letters.length < 8) return false
  const upper = letters.replace(/[^A-Z]/g, '').length
  return upper / letters.length >= 0.8
}

/**
 * Returns a 0-100 score plus the signals that produced it.
 */
export function scoreUrgency(message) {
  const text = (message || '').trim()
  const signals = []
  let score = 45

  if (!text) {
    return { score: 0, level: 'Low', signals: ['empty'] }
  }

  const critical = matchesAny(text, CRITICAL_PATTERNS)
  const high = matchesAny(text, HIGH_PATTERNS)
  const medium = matchesAny(text, MEDIUM_PATTERNS)
  const low = matchesAny(text, LOW_PATTERNS)
  const shouting = isMostlyUppercase(text)

  if (critical) {
    score += 50
    signals.push('critical operational language')
  } else if (high) {
    score += 30
    signals.push('access or payment is blocked')
  } else if (medium) {
    score += 10
    signals.push('support issue, not an outage')
  }

  if (low && !critical && !high) {
    score -= 25
    signals.push('thanks, feature ask, or informational question')
  }

  if (shouting) {
    score += 15
    signals.push('message is written in all caps')
  }

  // Exclamation marks are a weak emphasis signal, not a severity signal.
  const bangs = (text.match(/!/g) || []).length
  if (bangs > 0 && (critical || high)) {
    score += Math.min(bangs, 2) * 4
    signals.push('emphasis plus a real incident')
  }

  score = Math.max(0, Math.min(100, score))

  let level = 'Medium'
  if (critical || score >= 75) level = 'High'
  else if (score <= 35) level = 'Low'

  // Feature requests and compliments never outrank an outage queue.
  if (low && !critical && !high) {
    level = 'Low'
    score = Math.min(score, 30)
  }

  return { score, level, signals }
}

export function calculateUrgency(message) {
  return scoreUrgency(message).level
}

export function hasCriticalOpsLanguage(message) {
  return matchesAny(message || '', CRITICAL_PATTERNS) || matchesAny(message || '', HIGH_PATTERNS)
}
