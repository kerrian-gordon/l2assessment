import { QUEUES } from './categories.js'
import { hasCriticalOpsLanguage } from './urgencyScorer.js'

const actionTemplates = {
  'Billing Issue': {
    High: 'Route to Billing immediately. Confirm the failed charge, restore account access, and reply with a status in one business hour.',
    Medium: 'Route to Billing. Send the billing portal link, last invoice, and ask which charge needs review.',
    Low: 'Route to Billing. Reply with plan, invoice, and payment-method help from the FAQ.',
  },
  'Technical Problem': {
    High: 'Escalate to Engineering on-call. Capture time, environment, and blast radius. Do not send a generic refresh-your-browser reply.',
    Medium: 'Route to Technical Support L2. Collect repro steps, browser/app version, and a screenshot, then check the status page.',
    Low: 'Route to Support L1. Check known issues, then walk the customer through a safe retry.',
  },
  'Feature Request': {
    High: 'Route to Product. Log the request, note any workaround, and send an acknowledgment.',
    Medium: 'Route to Product. Add to the backlog and thank the customer for the suggestion.',
    Low: 'Route to Product. Log in the feature backlog and send a short acknowledgment. This is not a billing issue.',
  },
  'General Inquiry': {
    High: 'Route to Support L1. Answer from docs if possible; otherwise assign an owner the same day.',
    Medium: 'Route to Support L1. Reply with the matching FAQ or help-center article.',
    Low: 'Route to Support L1. Send the FAQ or help-center link for this question.',
  },
  'Positive Feedback': {
    High: 'Route to Customer Success. Thank the customer and share the note with the team.',
    Medium: 'Route to Customer Success. Send a thank-you; no troubleshooting needed.',
    Low: 'Route to Customer Success. Send a thank-you. Do not send an FAQ or billing link.',
  },
  'Account Access': {
    High: 'Route to Account Ops. Restore login or workspace access, then confirm the customer is unblocked.',
    Medium: 'Route to Account Ops. Verify identity and reset access with the customer.',
    Low: 'Route to Support L1. Walk through password reset and invite links.',
  },
  Unknown: {
    High: 'Hold in Human Triage. A person should read this before it is auto-replied.',
    Medium: 'Hold in Human Triage. Flag for a supervisor if the intent is still unclear after one pass.',
    Low: 'Hold in Human Triage for a quick human read.',
  },
}

export function getRoutingDestination(category, urgency) {
  const queue = QUEUES[category] || QUEUES.Unknown
  if (urgency === 'High' && (category === 'Technical Problem' || category === 'Account Access')) {
    return `${queue} (on-call)`
  }
  return queue
}

export function getRecommendedAction(category, urgency = 'Medium') {
  const byUrgency = actionTemplates[category] || actionTemplates.Unknown
  return byUrgency[urgency] || byUrgency.Medium
}

export function getAvailableCategories() {
  return Object.keys(actionTemplates)
}

export function shouldEscalate(category, urgency, message) {
  if (urgency === 'High') return true
  if (category === 'Unknown') return true
  if (hasCriticalOpsLanguage(message)) return true
  return false
}
