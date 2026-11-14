import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { analyzeMessage } from '../utils/llmHelper'
import { validateMessage, MAX_MESSAGE_LENGTH } from '../utils/triage'
import { saveAnalysis } from '../utils/historyStore'

const EXAMPLES = [
  { label: 'Outage', text: 'Our checkout page has been down since this morning and customers can\'t place orders.' },
  { label: 'Billing', text: 'I was charged twice for my subscription this month. Can I get a refund?' },
  { label: 'Feature idea', text: 'It would be great if I could export my reports to CSV.' },
]

const URGENCY_STYLE = {
  High: { card: 'border-red-500 bg-red-50', badge: 'bg-red-600 text-white' },
  Medium: { card: 'border-yellow-500 bg-yellow-50', badge: 'bg-yellow-500 text-white' },
  Low: { card: 'border-green-500 bg-green-50', badge: 'bg-green-600 text-white' },
}

function AnalyzePage() {
  const [message, setMessage] = useState('')
  const [results, setResults] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState([])
  const [copied, setCopied] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    // Pick up an example message chosen on the home page
    try {
      const exampleMessage = localStorage.getItem('exampleMessage')
      if (exampleMessage) {
        setMessage(exampleMessage)
        localStorage.removeItem('exampleMessage')
      }
    } catch {
      // Browser storage unavailable - nothing to pre-fill
    }
    inputRef.current?.focus()
  }, [])

  const handleAnalyze = async () => {
    if (isLoading) return

    const check = validateMessage(message)
    if (!check.ok) {
      setError(check.error)
      setResults(null)
      inputRef.current?.focus()
      return
    }

    // Same message as the result on screen: nothing new to do.
    if (results && results.message === check.text) return

    setError('')
    setNotes([])
    setCopied('')
    setIsLoading(true)
    setResults(null)

    try {
      // One structured AI call, checked against rule-based safety signals.
      // Falls back to rules alone (and says so) if the AI is unavailable.
      const triage = await analyzeMessage(check.text)
      const analysisResult = { ...triage, timestamp: new Date().toISOString() }
      setResults(analysisResult)

      const saved = saveAnalysis(analysisResult)
      setNotes([
        check.notice,
        saved ? '' : 'This result could not be saved to History (browser storage is full or blocked).',
      ].filter(Boolean))
    } catch (err) {
      console.error('Error analyzing message:', err)
      setError('Something went wrong and this message was not analyzed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setMessage('')
    setResults(null)
    setError('')
    setNotes([])
    setCopied('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleAnalyze()
    }
  }

  const handleCopy = async () => {
    const text = `${results.urgency} urgency - send to ${results.team}\nCategory: ${results.category}\nWhat to do: ${results.recommendedAction}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied('Copied')
    } catch {
      setCopied('Could not copy - select the text and copy it manually.')
    }
  }

  const overLimit = message.trim().length > MAX_MESSAGE_LENGTH
  const style = results ? URGENCY_STYLE[results.urgency] : null

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Triage a customer message</h1>
          <p className="text-gray-600 mb-5">
            Paste a message to see how urgent it is, who should handle it, and what to do next.
          </p>

          <label htmlFor="customer-message" className="block text-sm font-semibold text-gray-700 mb-2">
            Customer message
          </label>
          <textarea
            id="customer-message"
            ref={inputRef}
            value={message}
            onChange={(e) => { setMessage(e.target.value); if (error) setError('') }}
            onKeyDown={handleKeyDown}
            placeholder="Paste the customer's message here..."
            aria-invalid={Boolean(error)}
            aria-describedby="message-help"
            className={`w-full border rounded-lg p-3 h-36 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              error ? 'border-red-400' : 'border-gray-300'
            }`}
            disabled={isLoading}
          />
          <div id="message-help" className="flex items-start justify-between gap-4 mt-1 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-gray-500">
              <span>Try an example:</span>
              {EXAMPLES.map(example => (
                <button
                  key={example.label}
                  type="button"
                  disabled={isLoading}
                  onClick={() => { setMessage(example.text); setError(''); setResults(null); setNotes([]); inputRef.current?.focus() }}
                  className="px-2.5 py-0.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  {example.label}
                </button>
              ))}
            </div>
            <span className={`whitespace-nowrap ${overLimit ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>
              {message.length.toLocaleString('en-US')} / {MAX_MESSAGE_LENGTH.toLocaleString('en-US')}
            </span>
          </div>

          {overLimit && !error && (
            <p className="mt-2 text-sm text-amber-800">
              This is longer than {MAX_MESSAGE_LENGTH.toLocaleString('en-US')} characters. Only the first part will be analyzed.
            </p>
          )}
          {error && (
            <div role="alert" className="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleAnalyze}
              disabled={isLoading}
              className={`flex-1 py-3 rounded-lg font-semibold ${
                isLoading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Analyzing...
                </span>
              ) : (
                'Analyze message'
              )}
            </button>
            <button
              onClick={handleClear}
              disabled={isLoading || (!message && !results)}
              className="px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Tip: press Ctrl+Enter (or ⌘+Enter) to analyze.</p>
        </div>

        {/* Result: one verdict, one action, at most one caution. Detail is behind "Why?". */}
        {results && (
          <div aria-live="polite" className={`rounded-xl shadow-md border-l-8 p-6 ${style.card}`}>
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wide ${style.badge}`}>
                {results.urgency} urgency
              </span>
              <span className="text-sm text-gray-600">
                {results.category}
                {results.secondaryCategory && ` · also ${results.secondaryCategory}`}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              Send to {results.team}{results.escalate ? ' now' : ''}
            </h2>
            {results.summary && <p className="text-gray-700 mb-3">{results.summary}</p>}

            <div className="bg-white rounded-lg border border-gray-200 p-4 mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">What to do</div>
              <p className="text-gray-900">{results.recommendedAction}</p>
            </div>

            {(results.reviewReasons.length > 0 || notes.length > 0) && (
              <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-3 mt-3 text-sm">
                <div className="font-semibold mb-0.5">Before you act</div>
                {[...results.reviewReasons, ...notes].map(reason => <p key={reason}>{reason}</p>)}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 mt-4">
              <button
                onClick={handleCopy}
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 font-semibold text-sm"
              >
                Copy result
              </button>
              {copied && <span role="status" className="text-sm text-gray-600">{copied}</span>}
            </div>

            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-semibold text-gray-700">Why this result?</summary>
              <div className="mt-2 bg-white rounded-lg border border-gray-200 p-4">
                <div className="prose prose-sm max-w-none text-gray-700">
                  <ReactMarkdown>{results.reasoning}</ReactMarkdown>
                </div>
                {results.signals.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {results.signals.map(signal => (
                      <span key={signal.id} className="text-xs bg-gray-50 border border-gray-300 text-gray-700 px-2 py-1 rounded-full">
                        {signal.label}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-3">
                  {results.source === 'ai' ? 'Decided by AI, checked against safety rules.' : 'Decided by backup keyword rules (no AI).'}
                </p>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

export default AnalyzePage
