import { categorizeMessage } from './llmHelper.js'
import { scoreUrgency } from './urgencyScorer.js'
import {
  getRecommendedAction,
  getRoutingDestination,
  shouldEscalate,
} from './templates.js'

/**
 * Run the full triage pipeline: classify, score urgency, pick a queue, and
 * recommend the next action. This is the product surface Relay AI sells.
 */
export async function analyzeTriage(message) {
  const classification = await categorizeMessage(message)
  const urgency = scoreUrgency(message)

  let level = urgency.level
  if (
    (classification.category === 'Positive Feedback' || classification.category === 'Feature Request') &&
    level === 'High' &&
    !urgency.signals.includes('critical operational language')
  ) {
    level = 'Low'
  }

  const routeTo = getRoutingDestination(classification.category, level)
  const recommendedAction = getRecommendedAction(classification.category, level)
  const escalate = shouldEscalate(classification.category, level, message)

  return {
    message,
    category: classification.category,
    secondaryCategory: classification.secondaryCategory || null,
    urgency: level,
    urgencyScore: urgency.score,
    urgencySignals: urgency.signals,
    routeTo,
    escalate,
    recommendedAction,
    confidence: classification.confidence,
    source: classification.source,
    reasoning: classification.reasoning,
    timestamp: new Date().toISOString(),
  }
}
