/**
 * Urgency Scorer - rule-based, deterministic urgency signals.
 *
 * Urgency is driven by what the customer is telling us (outage, security,
 * money, blocked access, deadlines, churn risk), never by message length,
 * punctuation or the time of day the message is analysed.
 *
 * The result is used two ways:
 *  - as a safety net on top of the AI's judgement (a detected outage or
 *    security incident can never be triaged below High), and
 *  - as the full answer when the AI is unavailable.
 */

export const URGENCY_LEVELS = ['Low', 'Medium', 'High']

const HIGH_THRESHOLD = 60
const MEDIUM_THRESHOLD = 30

// `critical` signals force High urgency on their own, whatever else is said.
const SIGNALS = [
  {
    id: 'security',
    label: 'Possible security incident',
    weight: 70,
    critical: true,
    pattern: /\b(hack(ed|ing|er)?|breach(ed)?|compromised|unauthori[sz]ed|fraud(ulent)?|phishing|stolen|suspicious (log ?ins?|activity|charges?)|password (was|has been|got) changed|log ?ins? from (another|a different|an unknown))\b/gi,
  },
  {
    id: 'outage',
    label: 'Service outage',
    weight: 60,
    critical: true,
    pattern: /\b((server|site|website|service|system|app|api|database|db|platform|production|prod|everything|checkout|page|portal|store|shop|login|payment)s?\b[^.!?]{0,40}?\b(down|offline|unavailable|unreachable|not responding|crash(ed|ing|es)?)|outage|connection (lost|refused|failed|dropped)|(is|are|went|goes|been|still) down)\b/gi,
  },
  {
    id: 'data-loss',
    label: 'Possible data loss',
    weight: 60,
    critical: true,
    pattern: /\b(lost (all |my |our )*(data|files|work|records|messages|contacts)|data (loss|is gone|was deleted|has disappeared|disappeared)|(deleted|wiped|erased|disappeared|vanished|missing) (all |my |our )*(data|files|records|messages|contacts|customers))\b/gi,
  },
  {
    id: 'blocked',
    label: 'Customer is blocked / something is broken',
    weight: 35,
    pattern: /\b((can'?t|cannot|can not|unable to|couldn'?t|won'?t let (me|us|them)) (?!(wait|thank|believe|imagine|complain|recommend|say|tell|decide|remember|find the words)\b)\w+|locked out|nothing (works|is working|loads|is loading)|(won'?t|doesn'?t|not|isn'?t|stopped) (load|loading|work|working|open|opening|respond|responding)|keeps? (loading|crashing|timing out|failing|freezing)|tim(es|ed|ing) out|errors?|broken|bugs?|crash(es|ed|ing)?|fail(s|ed|ing|ure)?)\b/gi,
  },
  {
    id: 'money',
    label: 'Money at stake (incorrect charge / refund)',
    weight: 35,
    pattern: /\b(charged (me )?(twice|double|again|after)|double[- ]charg(e|ed)|overcharg(e|ed)|refund(s|ed)?|(wrong|unexpected|incorrect|unknown) (amount|charge|charges)|billed (twice|incorrectly|again)|charges?\b[^.!?]{0,40}?\b(don'?t|do not|didn'?t|did not) (recogni[sz]e|authori[sz]e|make)|unrecogni[sz]ed)\b/gi,
  },
  {
    id: 'time-pressure',
    label: 'Explicit time pressure',
    weight: 30,
    pattern: /\b(urgent(ly)?|asap|immediately|right (now|away)|emergency|critical|as soon as possible|time[- ]sensitive|deadline|by (today|tonight|tomorrow|eod|end of day))\b/gi,
  },
  {
    id: 'churn-risk',
    label: 'Churn or escalation risk',
    weight: 30,
    pattern: /\b(cancel(s|led|ed|ling|ing|lation|ation)?|chargeback|disput(e|ing)|lawyer|attorney|legal action|switch(ing)? to|competitors?|unacceptable|ridiculous|furious|fed up|(third|fourth|fifth) time|still (not|waiting|no|broken|down)|no (one|response|reply))\b/gi,
  },
  {
    id: 'broad-impact',
    label: 'Affects many users or revenue',
    weight: 25,
    pattern: /\b(every (single )?(customer|user|client|order)|(zero|no) (orders|sales)|all (of )?(our |my |the )?(users|customers|clients|team|staff|employees)|every(one|body)|(our|my) (customers|clients|users)|production|company[- ]wide|entire (team|company|organi[sz]ation)|losing (money|sales|revenue|customers|business))\b/gi,
  },
]

const NEGATION_BEFORE = /\b(no|not|never|without|zero|isn'?t|wasn'?t|aren'?t|weren'?t)\s+(\w+\s+){0,2}$/i
const RESOLVED = /\b(fixed|resolved|sorted( out)?|working (now|again|fine)|all good|no longer (an issue|a problem|happening))\b/gi

/** Normalise typographic quotes so "can’t" matches "can't". */
export function normalize(message) {
  return String(message ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
}

function hasAffirmedMatch(text, pattern) {
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, match.index - 25), match.index)
    if (!NEGATION_BEFORE.test(before)) return true
  }
  return false
}

/**
 * Score the urgency of a customer message.
 *
 * @param {string} message
 * @returns {{urgency: 'Low'|'Medium'|'High', score: number, critical: boolean,
 *            signals: {id: string, label: string}[]}}
 */
export function scoreUrgency(message) {
  const text = normalize(message)
  const signals = []
  let score = 0
  let critical = false

  for (const signal of SIGNALS) {
    if (hasAffirmedMatch(text, signal.pattern)) {
      signals.push({ id: signal.id, label: signal.label })
      score += signal.weight
      if (signal.critical) critical = true
    }
  }

  // Shouting only adds weight when a real problem is already being reported.
  const letters = text.replace(/[^a-zA-Z]/g, '')
  const upperRatio = letters.length ? letters.replace(/[^A-Z]/g, '').length / letters.length : 0
  if (score >= MEDIUM_THRESHOLD && letters.length >= 12 && upperRatio > 0.7) {
    signals.push({ id: 'shouting', label: 'Written in all caps' })
    score += 10
  }

  // "It's fixed now, thanks" should not page anyone.
  if (score > 0 && hasAffirmedMatch(text, RESOLVED)) {
    signals.push({ id: 'resolved', label: 'Customer says the issue is resolved' })
    score -= 50
    critical = false
  }

  score = Math.max(0, Math.min(100, score))

  let urgency = 'Low'
  if (critical || score >= HIGH_THRESHOLD) urgency = 'High'
  else if (score >= MEDIUM_THRESHOLD) urgency = 'Medium'

  return { urgency, score, critical, signals }
}

/** Back-compatible helper: just the urgency label. */
export function calculateUrgency(message) {
  return scoreUrgency(message).urgency
}

/** The more urgent of two levels. */
export function maxUrgency(a, b) {
  return URGENCY_LEVELS.indexOf(a) >= URGENCY_LEVELS.indexOf(b) ? a : b
}
