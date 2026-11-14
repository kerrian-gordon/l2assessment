/**
 * Routing & recommendation templates.
 *
 * Each category maps to an owning team and an action that depends on urgency,
 * so the recommendation is something an agent can act on immediately.
 */

export const CATEGORIES = [
  'Technical Problem',
  'Billing Issue',
  'Account & Security',
  'Feature Request',
  'Feedback',
  'General Inquiry',
]

export const UNKNOWN_CATEGORY = 'Unknown'

const routes = {
  'Technical Problem': {
    team: 'Technical Support',
    highTeam: 'Engineering On-Call',
    actions: {
      High: 'Escalate to the on-call engineer now and check whether other customers are affected. Acknowledge the customer straight away and keep them updated until resolved.',
      Medium: 'Reply with troubleshooting steps and ask for reproduction details (what they did, browser/device, screenshot). Open a bug ticket if it can be reproduced.',
      Low: 'Send the relevant help-centre article and log the report for tracking.',
    },
  },
  'Billing Issue': {
    team: 'Billing',
    actions: {
      High: 'Have a billing specialist review the account and recent charges today. Correct or refund any confirmed error and confirm the outcome to the customer in writing.',
      Medium: 'Review the customer\'s invoices and payment status, then reply with a specific explanation or fix.',
      Low: 'Answer the plan or pricing question and link to the billing portal for self-service changes.',
    },
  },
  'Account & Security': {
    team: 'Account Support',
    highTeam: 'Security',
    actions: {
      High: 'Treat as a possible account compromise: secure the account (force password reset, revoke sessions), verify the customer\'s identity, and hand to the security lead.',
      Medium: 'Verify the customer\'s identity, then help restore access (password reset, 2FA recovery).',
      Low: 'Send account-settings instructions for the requested change.',
    },
  },
  'Feature Request': {
    team: 'Product',
    actions: {
      High: 'Log the request for the product team and flag it as blocking this customer; reply with any available workaround.',
      Medium: 'Log the request for the product team with the customer\'s use case, and reply with any available workaround.',
      Low: 'Thank the customer, log the request with their use case in the product feedback tracker, and let them know it has been passed on.',
    },
  },
  'Feedback': {
    team: 'Customer Success',
    actions: {
      High: 'Have a customer success manager contact the customer personally today to address the complaint.',
      Medium: 'Reply personally, acknowledge the feedback, and share it with the relevant team.',
      Low: 'Send a short thank-you and share the feedback with the team. No further action needed.',
    },
  },
  'General Inquiry': {
    team: 'Support',
    actions: {
      High: 'Answer directly as a priority; the customer has indicated this is time-sensitive.',
      Medium: 'Answer the question directly and link to the relevant help-centre article.',
      Low: 'Answer the question, using the FAQ / help-centre article where one exists.',
    },
  },
  [UNKNOWN_CATEGORY]: {
    team: 'Support',
    actions: {
      High: 'Review manually now: the message could not be categorised but shows urgent signals.',
      Medium: 'Review manually: the message could not be categorised confidently.',
      Low: 'Reply asking the customer for more detail about what they need.',
    },
  },
}

/**
 * Where a message should go and what the agent should do.
 *
 * @param {string} category
 * @param {'Low'|'Medium'|'High'} urgency
 * @returns {{team: string, action: string}}
 */
export function getRouting(category, urgency = 'Low') {
  const route = routes[category] || routes[UNKNOWN_CATEGORY]
  const team = urgency === 'High' && route.highTeam ? route.highTeam : route.team
  return { team, action: route.actions[urgency] || route.actions.Low }
}

/** Back-compatible helper: just the recommended action text. */
export function getRecommendedAction(category, urgency = 'Low') {
  return getRouting(category, urgency).action
}

export function getAvailableCategories() {
  return [...CATEGORIES, UNKNOWN_CATEGORY]
}

/**
 * Should a human lead be pulled in right away?
 * High urgency always escalates; so does any sign the customer may leave.
 *
 * @param {'Low'|'Medium'|'High'} urgency
 * @param {{id: string}[]} signals - signals from scoreUrgency()
 */
export function shouldEscalate(urgency, signals = []) {
  return urgency === 'High' || signals.some(s => s.id === 'churn-risk')
}
