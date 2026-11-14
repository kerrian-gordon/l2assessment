# Assessment write-up: Customer Inbox Triage

Relay AI sells one promise: a small support team can handle more customer messages without hiring,
because the product categorizes, prioritizes and routes them. This write-up covers what was wrong with
the triage tool, what was changed, and how the change was tested.

## How the original app behaved

Thirteen customer messages were run through the original app before any change. A selection:

| Customer message | Urgency | Category | Recommended action |
|---|---|---|---|
| "Database connection lost" | Low | General Inquiry | Respond with FAQ link |
| "Server down now" | Low | Technical Problem | Suggest user to restart their browser |
| "URGENT: ALL OUR USERS ARE LOCKED OUT" | Low | General Inquiry | Respond with FAQ link |
| "I think someone hacked my account..." | Medium | General Inquiry | Respond with FAQ link |
| "Hi! ... you have a really nice design! ..." (praise only) | High | General Inquiry | Respond with FAQ link |
| "Could you add an export to CSV feature?" | Low | Feature Request | Ask user to check billing portal |
| "I was charged twice ... I'm cancelling and disputing with my bank." | Medium | Billing Issue | Ask user to check billing portal |

Two things were discovered while getting it to run:

- **The AI feature was silently broken.** The app pointed at a Groq model that Groq no longer serves
  (`model_not_found`). Instead of reporting this, it showed randomly chosen canned text under the heading
  "AI Reasoning". Every result above came from that hidden fallback.
- **With no API key the app showed a blank page**, although the setup guide promised an automatic fallback.

## Top 3 areas for improvement

### 1. Urgency scoring was effectively inverted

Urgency was calculated from message length, exclamation marks, polite words and the time of day the
message was analyzed. Short outage reports scored Low; long, enthusiastic praise scored High. The same
message could score differently on a weekend. For a prioritization product this is the most costly
failure: an outage sits at the bottom of the queue while a compliment sits at the top.

### 2. Categorization was unreliable and misleading

The prompt gave the model no list of categories and asked for free text. The code then searched the
reply for words such as "billing", so a reply saying "this is not a billing issue" would be filed as
Billing. Results varied between runs, messages spanning two topics got one label, there was no signal of
how sure the result was, and failures were hidden behind fake "AI Reasoning".

### 3. Recommendations were not actionable and nothing was routed

Actions were one fixed sentence per category and ignored urgency. Feature requests were told to check
the billing portal; a production outage was told to restart the browser; a suspected account takeover
got an FAQ link. Escalation was decided by whether the message was longer than 100 characters, and that
result was never used. The product is described as routing messages, but no message was sent to anyone.

Other issues noted and not addressed: the API key is exposed in the browser (acceptable only for local
development), and messages can only be triaged one at a time.

## What was implemented, and why this one

The improvement chosen was to make the triage decision itself trustworthy, because every other feature
(history, dashboard, routing) is only as good as that decision.

| Change | What it fixes |
|---|---|
| Urgency based on what the customer reports: outage, security incident, data loss, being blocked, wrong charges, deadlines, threats to cancel | Area 1 |
| One structured AI request with defined categories and a validated answer, giving consistent results | Area 2 |
| Safety net: rules can raise the AI's urgency but never lower it, so a detected outage is always High | Areas 1 and 2 |
| Each category and urgency maps to an owning team and a concrete action, with escalation for High urgency and churn risk | Area 3 |
| When the AI is unavailable the app still triages by rules, says so, and names the cause | Area 2 |
| Input validation: empty input, input with no words, very long messages, and too-short messages each get a clear message | Edge cases |
| Corrupt or full browser storage no longer breaks a page | Edge cases |
| Results screen reduced to one verdict, one action and at most one caution, with reasoning behind "Why this result?" | Ease of use |
| Default model switched to one Groq currently serves, and made configurable | The broken AI feature |

The first version of the results screen showed eight separate blocks and a caution on every rule-based
result. It was simplified after a critical review: an agent working a queue needs the verdict and the
action first, and a caution that always appears stops being read.

## Testing

**Automated:** 48 tests cover urgency scoring, categorization, routing, validation of the AI's answer,
input validation and failure handling. Run them with `npm test`; no API key is needed.

**Live AI, run locally with a real Groq key (`openai/gpt-oss-120b`):**

| Customer message | Result | Correct? |
|---|---|---|
| "Our checkout page has been down since this morning and customers can't place orders." | High, Technical Problem, Engineering On-Call | Yes |
| "Thank you so much!!! Your team has been amazing!!!" | Low, Feedback, Customer Success | Yes |
| "I was charged twice this month and want a refund or I'm cancelling." | High, Billing Issue, Billing | Yes |
| "Could you add an export to CSV feature?" | Low, Feature Request, Product | Yes |
| "My payment failed and now I can't access the dashboard." | High, Billing Issue and Technical Problem | Yes |
| "hi" | No category guessed; asks the customer for detail | Yes |

**Edge cases checked in the browser:** empty input, input with no words, a 10,000-character message,
a non-English message without AI, corrupt saved history, full browser storage, a failed copy to
clipboard, and each way the AI call can fail.

## Known limits

- **Six live messages is a sanity check, not an accuracy measurement.** A real evaluation needs a larger
  labelled set of customer messages.
- **The backup keyword rules are brittle and English-only.** They missed "has been down" until a test
  caught it. They are a safety net, not a substitute for the AI.
- **The "What to do" text is a template per category and urgency.** For the payment-failure message it
  gave the standard billing action and did not mention restoring access.
- **Team names are assumed.** "Engineering On-Call" and "Security" may not exist in a five-person
  business; routing targets should be configurable per customer.
- **Three lint errors remain** from the original code, in parts that were not changed.

## Recommended next steps

1. **Batch triage.** Paste or import many messages and get back one prioritized queue. This is the
   change that most directly serves the promise of handling more volume without more staff.
2. **Move the AI call to a server** so the API key is not exposed in the browser.
3. **Let agents correct a result**, and use those corrections to measure and improve accuracy.
4. **Tailor the recommended action to the message** instead of using a fixed template.
5. **Make teams and routing rules configurable** per business.

## How this was built

The analysis, implementation and testing were done with Claude Code as a pair programmer. The live AI
testing was run by hand on a local machine.
