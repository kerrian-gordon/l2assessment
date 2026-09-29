import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateUrgency, scoreUrgency } from './urgencyScorer.js'
import { getRecommendedAction, shouldEscalate, getRoutingDestination } from './templates.js'
import { getRulesCategorization } from './llmHelper.js'
import { analyzeTriage } from './triageEngine.js'

test('production outages are high urgency, not low', () => {
  assert.equal(calculateUrgency('Our production server is down'), 'High')
  assert.equal(calculateUrgency('Database connection lost'), 'High')
  assert.equal(calculateUrgency('Server down now'), 'High')
  assert.equal(calculateUrgency('THIS IS AN EMERGENCY ALL CUSTOMERS ARE LOCKED OUT'), 'High')
})

test('thank-you notes and feature ideas stay low urgency', () => {
  assert.equal(
    calculateUrgency('Thank you so much! Your team has been incredibly helpful and I really appreciate the fast response to my question earlier today!'),
    'Low'
  )
  assert.equal(
    calculateUrgency('Hi! I was just browsing through your website and noticed you have a really nice design! I especially like the color scheme!'),
    'Low'
  )
  assert.equal(
    calculateUrgency('Could you add an export to CSV feature? Would be really useful for my monthly reports.'),
    'Low'
  )
})

test('short length alone does not bury an incident', () => {
  const result = scoreUrgency('Database connection lost')
  assert.equal(result.level, 'High')
  assert.ok(result.signals.includes('critical operational language'))
})

test('feature requests route to Product, not Billing', () => {
  const category = getRulesCategorization('Could you add an export to CSV feature? Would be really useful for my monthly reports.')
  assert.equal(category.category, 'Feature Request')
  assert.equal(getRoutingDestination(category.category, 'Low'), 'Product')
  assert.match(getRecommendedAction(category.category, 'Low'), /Product|backlog/i)
  assert.doesNotMatch(getRecommendedAction(category.category, 'Low'), /billing portal/i)
})

test('positive feedback is not a general inquiry FAQ', () => {
  const category = getRulesCategorization('Hi there! I just wanted to say thank you for your amazing customer service.')
  assert.equal(category.category, 'Positive Feedback')
})

test('hybrid payment + access is owned by Billing with a secondary tag', () => {
  const category = getRulesCategorization(
    "My payment failed and now I can't access the dashboard. Is there a bug or do I need to update my credit card?"
  )
  assert.equal(category.category, 'Billing Issue')
  assert.ok(category.secondaryCategory === 'Account Access' || category.secondaryCategory === 'Technical Problem')
})

test('escalation uses severity, not message length', () => {
  assert.equal(shouldEscalate('Technical Problem', 'High', 'Server down now'), true)
  assert.equal(
    shouldEscalate(
      'Positive Feedback',
      'Low',
      'Hi! I was just browsing through your website and noticed you have a really nice design! I especially like the color scheme and the way you organized the navigation menu!'
    ),
    false
  )
})

test('full pipeline: outage goes to Engineering on-call', async () => {
  const result = await analyzeTriage('Our production server is down')
  assert.equal(result.category, 'Technical Problem')
  assert.equal(result.urgency, 'High')
  assert.equal(result.routeTo, 'Engineering (on-call)')
  assert.equal(result.escalate, true)
  assert.doesNotMatch(result.recommendedAction, /Suggest user to restart/i)
})

test('security incidents escalate to Engineering', async () => {
  const result = await analyzeTriage(
    'We got an alert that customer data may have been exposed in a security breach. Need someone now.'
  )
  assert.equal(result.category, 'Technical Problem')
  assert.equal(result.urgency, 'High')
  assert.equal(result.routeTo, 'Engineering (on-call)')
  assert.equal(result.escalate, true)
})

test('full pipeline: thanks go to Customer Success at low urgency', async () => {
  const result = await analyzeTriage(
    'Thank you so much! Your team has been incredibly helpful and I really appreciate the fast response to my question earlier today!'
  )
  assert.equal(result.category, 'Positive Feedback')
  assert.equal(result.urgency, 'Low')
  assert.equal(result.routeTo, 'Customer Success')
  assert.equal(result.escalate, false)
})
