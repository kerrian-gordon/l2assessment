import Groq from 'groq-sdk'
import { CATEGORIES } from './categories.js'

const CATEGORY_SET = new Set(CATEGORIES)

function getGroqApiKey() {
  try {
    return (import.meta.env?.VITE_GROQ_API_KEY || '').trim()
  } catch {
    return ''
  }
}

function createGroqClient() {
  const apiKey = getGroqApiKey()
  if (!apiKey || apiKey === 'your_groq_api_key_here') return null
  return new Groq({
    apiKey,
    dangerouslyAllowBrowser: true,
  })
}

const SYSTEM_PROMPT = `You are the triage classifier for Relay AI, a customer-operations product for small businesses.
Classify inbound support mail so the right team sees it first.

Return JSON only, no markdown:
{
  "category": one of ${CATEGORIES.filter((c) => c !== 'Unknown').map((c) => `"${c}"`).join(', ')},
  "secondaryCategory": null or another category if the message mixes two intents,
  "confidence": number between 0 and 1,
  "reasoning": "1-2 sentences that a support manager can trust"
}

Rules:
- Production outages, downtime, crashes, data loss, and security incidents are Technical Problem.
- Failed payments, invoices, refunds, and subscription changes are Billing Issue.
- If payment failed AND they cannot access the product, use Billing Issue with secondaryCategory "Account Access".
- Login / workspace lockouts without a payment mention are Account Access.
- Product ideas and "please add X" are Feature Request, never Billing Issue.
- Pure thanks or compliments with no ask are Positive Feedback.
- Hours, how-to, and pricing questions are General Inquiry.
- Prefer a lower confidence when two categories both fit.`

function normalizeCategory(value) {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (CATEGORY_SET.has(trimmed)) return trimmed
  const lower = trimmed.toLowerCase()
  if (lower.includes('bill') || lower.includes('invoice') || lower.includes('refund') || lower.includes('payment')) {
    return 'Billing Issue'
  }
  if (lower.includes('access') || lower.includes('login') || lower.includes('lock')) {
    return 'Account Access'
  }
  if (lower.includes('technical') || lower.includes('bug') || lower.includes('outage') || lower.includes('error')) {
    return 'Technical Problem'
  }
  if (lower.includes('feature') || lower.includes('enhancement')) {
    return 'Feature Request'
  }
  if (lower.includes('thank') || lower.includes('positive') || lower.includes('compliment') || lower.includes('feedback')) {
    return 'Positive Feedback'
  }
  if (lower.includes('inquiry') || lower.includes('question') || lower.includes('general')) {
    return 'General Inquiry'
  }
  return null
}

function parseModelJson(content) {
  if (!content) return null
  const stripped = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(stripped.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Categorize a customer support message using Groq, with a local rules fallback.
 */
export async function categorizeMessage(message) {
  const groq = createGroqClient()
  if (!groq) {
    return getRulesCategorization(message)
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    })

    const parsed = parseModelJson(response.choices[0]?.message?.content)
    const category = normalizeCategory(parsed?.category) || 'Unknown'
    const secondary = normalizeCategory(parsed?.secondaryCategory)
    const confidence = typeof parsed?.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.7

    return {
      category,
      secondaryCategory: secondary && secondary !== category ? secondary : null,
      confidence,
      reasoning: parsed?.reasoning || response.choices[0]?.message?.content || 'Model returned no reasoning.',
      source: 'llm',
    }
  } catch (error) {
    console.warn('Groq API failed, using rules fallback:', error.message)
    return getRulesCategorization(message)
  }
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term))
}

/**
 * Deterministic fallback used when no API key is set or Groq is unavailable.
 */
export function getRulesCategorization(message) {
  const text = (message || '').toLowerCase()

  const billing = includesAny(text, [
    'bill', 'payment', 'charge', 'invoice', 'credit card', 'subscription',
    'refund', 'upgrade', 'pro plan', 'pricing',
  ]) || (text.includes('cancel') && text.includes('account'))

  const access = includesAny(text, [
    "can't access", 'cannot access', 'unable to access', 'locked out',
    "can't log", 'cannot log', "can't sign", 'password', 'login',
  ])

  const technical = includesAny(text, [
    'bug', 'error', 'broken', 'not working', 'crash', 'down', 'server',
    'database', 'timeout', 'timed out', 'loading', 'slow', 'outage',
    "won't load", 'will not load', 'production', 'security breach',
    'data may have been exposed', 'data loss', 'compromised',
  ]) || (text.includes('problem') && !text.includes('no problem'))

  const feature = includesAny(text, [
    'feature', 'dark mode', 'would like to see', 'suggestion', 'enhancement',
    'would be great', 'would be useful', 'export to csv', 'could you add',
    'please add',
  ]) || (text.includes('add') && (text.includes('please') || text.includes('could')))

  const positive = (
    includesAny(text, ['thank you', 'thanks', 'appreciate', 'grateful', 'amazing customer service', 'keep up the great'])
    && !includesAny(text, ['but', 'however', "can't", 'cannot', 'issue', 'problem', 'broken', 'down'])
  )

  const inquiry = includesAny(text, [
    'how do', 'how can', 'what are', 'when do', 'where do', 'can i',
    'is there', 'business hours',
  ]) || (text.includes('?') && !technical && !billing)

  if (billing && (access || technical)) {
    return {
      category: 'Billing Issue',
      secondaryCategory: access ? 'Account Access' : 'Technical Problem',
      confidence: 0.72,
      reasoning: 'The customer reports a payment problem that is also blocking product access. Billing should own it, with Account Ops in the loop.',
      source: 'rules',
    }
  }

  if (billing) {
    return {
      category: 'Billing Issue',
      secondaryCategory: null,
      confidence: 0.8,
      reasoning: 'The message is about payments, invoices, charges, or the subscription plan.',
      source: 'rules',
    }
  }

  if (access && !feature) {
    return {
      category: 'Account Access',
      secondaryCategory: technical ? 'Technical Problem' : null,
      confidence: 0.78,
      reasoning: 'The customer cannot get into their account or workspace.',
      source: 'rules',
    }
  }

  if (technical && !feature) {
    return {
      category: 'Technical Problem',
      secondaryCategory: null,
      confidence: 0.82,
      reasoning: 'The message reports downtime, errors, or a product that is not working.',
      source: 'rules',
    }
  }

  if (feature) {
    return {
      category: 'Feature Request',
      secondaryCategory: null,
      confidence: 0.8,
      reasoning: 'The customer is asking for new or improved product behavior, not reporting an incident.',
      source: 'rules',
    }
  }

  if (positive) {
    return {
      category: 'Positive Feedback',
      secondaryCategory: null,
      confidence: 0.86,
      reasoning: 'The customer is thanking the team and is not asking for support.',
      source: 'rules',
    }
  }

  if (inquiry) {
    return {
      category: 'General Inquiry',
      secondaryCategory: null,
      confidence: 0.75,
      reasoning: 'This is an informational question, not an incident or billing problem.',
      source: 'rules',
    }
  }

  return {
    category: 'Unknown',
    secondaryCategory: null,
    confidence: 0.4,
    reasoning: 'No clear billing, technical, access, or product-request signal. A person should classify this.',
    source: 'rules',
  }
}
