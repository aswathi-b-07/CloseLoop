import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { api } from '../lib/api'
import { CardHeader, Spinner, ErrorPanel } from './ui'

// Render the model's Markdown answer with Razorpay-styled elements.
const MD_COMPONENTS = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 text-sm leading-relaxed text-navy-700">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-navy">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h3 className="mt-3 mb-1 font-display text-sm font-bold text-navy">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 mb-1 font-display text-sm font-bold text-navy">{children}</h3>,
  h3: ({ children }) => <h3 className="mt-3 mb-1 font-display text-sm font-bold text-navy">{children}</h3>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">{children}</ol>,
  li: ({ children }) => <li className="marker:text-slate-400">{children}</li>,
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-rzp-darker">{children}</code>
  ),
  a: ({ children, href }) => (
    <a href={href} className="text-rzp underline" target="_blank" rel="noreferrer">{children}</a>
  ),
}

const EXAMPLES = [
  'How much is at risk from chargebacks?',
  'Which settlements are missing?',
  'Why was ORD00004 flagged?',
]

export default function QaPanel({ onSelect }) {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function ask(q) {
    const text = (q ?? question).trim()
    if (!text) return
    setQuestion(text)
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.ask(text)
      setResult(res)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }

  const citations = result?.citations || []

  return (
    <section className="card card-pad">
      <CardHeader
        icon={
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H8l-5 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        }
        title="Settlement Q&A"
        subtitle="Ask about the current run — answers are grounded in the reconciliation data"
        right={
          result?.mode ? (
            <span
              className={`chip border ${
                result.mode === 'llm'
                  ? 'border-rzp/30 bg-rzp-tint text-rzp-darker'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}
            >
              {result.mode === 'llm' ? 'Grounded · Gemini' : 'Fallback'}
            </span>
          ) : null
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask()
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. How much is at risk from chargebacks?"
          className="input flex-1"
        />
        <button type="submit" className="btn-primary" disabled={loading || !question.trim()}>
          {loading ? <Spinner className="h-4 w-4 text-white" /> : 'Ask'}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => ask(ex)}
            disabled={loading}
            className="chip border-line text-navy-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-slate-50 px-4 py-5 text-sm text-slate-500">
            <Spinner className="h-4 w-4" /> Thinking…
          </div>
        ) : error ? (
          <ErrorPanel error={error} onRetry={() => ask()} />
        ) : result ? (
          <div className="rounded-xl border border-line bg-slate-50 p-4">
            <div className="text-sm text-navy-700">
              <ReactMarkdown components={MD_COMPONENTS}>
                {result.answer || 'No answer returned.'}
              </ReactMarkdown>
            </div>

            {/* Fallback structured extras */}
            {result.mode === 'fallback' && Array.isArray(result.top_exceptions) && result.top_exceptions.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="section-title mb-2">Top exceptions</p>
                <ul className="space-y-1 text-xs text-slate-500">
                  {result.top_exceptions.slice(0, 5).map((t, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      {typeof t === 'string' ? t : t.entity_id ? `${t.entity_id} — ${t.predicted_exception || ''}` : JSON.stringify(t)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {citations.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="section-title mb-2">Citations · click to inspect</p>
                <div className="flex flex-wrap items-center gap-2">
                  {citations.slice(0, 16).map((c) => {
                    const id = typeof c === 'string' ? c : c?.entity_id || String(c)
                    return (
                      <button
                        key={id}
                        onClick={() => onSelect?.(id)}
                        className="chip border-rzp/30 bg-rzp-tint font-mono text-rzp-darker hover:bg-rzp/15"
                      >
                        {id}
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )
                  })}
                  {citations.length > 16 && (
                    <span className="text-xs text-slate-400">+{citations.length - 16} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-slate-400">
            Ask a question or pick an example above.
          </p>
        )}
      </div>
    </section>
  )
}
