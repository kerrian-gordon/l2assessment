# Customer Inbox Triage App

> **Assessment write-up:** what was wrong, what was changed and how it was tested is in [ASSESSMENT.md](ASSESSMENT.md).

## Overview

The Customer Inbox Triage app is a lightweight AI-powered tool that helps classify customer support messages and recommend actions. It uses Groq AI to categorize messages, applies rule-based urgency scoring, and suggests next steps based on predefined templates.

## Problem Statement

Support teams waste time manually reading and triaging customer messages. This tool provides an automated first pass at classification to help prioritize and route messages more efficiently.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **AI**: Groq API, free tier (model `openai/gpt-oss-120b` by default; set `VITE_GROQ_MODEL` to change it)
- **Runtime**: Browser-based (local development only)

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Groq API key (FREE - get from https://console.groq.com)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "L2 assessment"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Groq API Key**
   
   Create a `.env.local` file in the root directory:
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and add your Groq API key:
   ```
   VITE_GROQ_API_KEY=gsk_your-actual-key-here
   ```
   
   Get your FREE API key from: https://console.groq.com/keys
   
   **Why Groq?** Groq offers a generous free tier with fast inference and no credit card required!

4. **Run the application**
   ```bash
   npm run dev
   ```
   
   The app will be available at `http://localhost:5173`

## How It Works

1. **Paste Message**: User pastes a customer support message into the text area
2. **Analyze**: Click "Analyze Message" to process the input
3. **Triage**: The app produces one triage decision from two sources:
   - **AI classification** (`src/utils/llmHelper.js`, `src/utils/triage.js`): a single structured Groq call
     (JSON output, temperature 0) returns category, optional secondary category, urgency, confidence,
     a one-line summary and reasoning. The reply is validated against a fixed schema.
   - **Safety rules** (`src/utils/urgencyScorer.js`): deterministic signals for outages, security incidents,
     data loss, blocked customers, incorrect charges, time pressure and churn risk. Rules can *raise* the
     AI's urgency (an outage is never triaged below High) but never lower it.
4. **Routing** (`src/utils/templates.js`): category + urgency map to an owning team and a concrete
   recommended action; High urgency and churn-risk messages are flagged for escalation.
5. **Result**: one verdict ("High urgency - Send to Engineering On-Call now"), one action, and at most
   one "Before you act" caution (AI unsure, AI unavailable, rules overrode the AI, or not enough detail).
   The reasoning is one click away under "Why this result?".
6. **History**: analyses are saved to localStorage and listed most-urgent-first in the History tab

### When the AI is unavailable

With no API key, a rejected key, a rate limit, a network error or an unusable AI reply, the app still
triages the message using the rules alone. The result says so in plain words under "Before you act",
with the reason, so it is never mistaken for an AI answer. The rules only understand English.

### Input handling

- Empty input, or input with no words (e.g. `???`), is rejected with an inline message; nothing is saved.
- Messages over 5,000 characters are analyzed on their first 5,000 characters, and the result says so.
- Very short messages ("hi") get a "ask the customer what they need" result instead of a guess.
- Corrupt, full or blocked browser storage never breaks a page; if a result can't be saved, the user is told.

### Tests

```bash
npm test
```

Runs the triage test suite (`tests/triage.test.js`) with Node's built-in test runner - no API key needed.

## Example Test Messages

Try analyzing these messages to see how the triage system works:

### Example 1: Production Issue
```
Our production server is down
```

### Example 2: Customer Feedback
```
Hi there! I just wanted to say thank you for your amazing customer service. I've been using your product for three years now and I'm really happy with it. Keep up the great work!
```

### Example 3: Feature Request
```
I would love to see a dark mode option in the app. It would be much easier on my eyes during night time usage.
```

### Example 4: Payment Issue
```
I tried to update my payment method but the page keeps loading forever. Is this a known issue?
```

### Example 5: Billing Question
```
Can I upgrade my subscription to the pro plan?
```

### Example 6: Technical Support
```
The dashboard won't load when I try to access it. I've tried refreshing but it keeps timing out.
```

## Security Note

⚠️ **Warning**: This application exposes the Groq API key in the browser (using `dangerouslyAllowBrowser: true`). This is acceptable for local development only but should **NEVER** be done in production. In a real application, API calls should be made from a secure backend server.

## Why Groq?

- ✅ **Completely Free** - No credit card required
- ✅ **Fast Inference** - Groq's LPU technology is incredibly fast
- ✅ **Generous Limits** - ~14,400 requests/day on free tier
- ✅ **Easy Signup** - Get started in minutes at https://console.groq.com

## License

This project is for educational purposes only.
