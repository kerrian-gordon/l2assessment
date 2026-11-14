import Groq from 'groq-sdk'
import { buildMessages, parseLlmResponse, buildTriage, describeAiFailure } from './triage.js'

/**
 * LLM Helper - asks Groq for a structured triage of a customer message and
 * combines it with the rule-based safety net.
 *
 * If the AI cannot be used (no key, network/rate-limit error, unusable reply)
 * the message is still triaged by deterministic rules, and the result says so.
 */

// Groq retires models over time (the original llama-3.3-70b-versatile is gone).
// Override with VITE_GROQ_MODEL in .env.local if this one is retired too.
const MODEL = import.meta.env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b'

let client = null
function getClient() {
  // Stray spaces or quotes around a pasted key would break the request.
  const apiKey = (import.meta.env.VITE_GROQ_API_KEY || '').trim().replace(/^["'\u201C\u2018]+|["'\u201D\u2019]+$/g, '')
  if (!apiKey || apiKey === 'your_groq_api_key_here') return null
  if (!client) {
    client = new Groq({
      apiKey,
      dangerouslyAllowBrowser: true, // Local development only - never ship a key to the browser.
      timeout: 10000,
      maxRetries: 1,
    })
  }
  return client
}

/**
 * Triage a customer support message.
 *
 * @param {string} message
 * @returns {Promise<object>} triage decision - see buildTriage()
 */
export async function analyzeMessage(message) {
  const groq = getClient()
  if (!groq) {
    return buildTriage(message, null, 'AI is not set up (no API key).')
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return buildTriage(message, null, 'You appear to be offline, so the AI could not be reached.')
  }

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: buildMessages(message),
      temperature: 0, // same message -> same triage
      response_format: { type: 'json_object' },
      max_tokens: 2000, // leaves room for models that reason before answering
    })
    const parsed = parseLlmResponse(response.choices?.[0]?.message?.content)
    if (!parsed) {
      return buildTriage(message, null, 'The AI gave an answer that could not be used.')
    }
    return buildTriage(message, parsed)
  } catch (error) {
    console.warn('Groq API failed, using rule-based triage:', error?.status ?? '', error?.message)
    const reason = describeAiFailure(error)
    return buildTriage(message, null, reason)
  }
}
