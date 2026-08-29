import { useState } from 'react'
import { api } from '../lib/api'
import { Spinner, ErrorPanel } from './ui'

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
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-semibold text-white">Settlement Q&amp;A</h2>
        {result?.mode && (
          <span
            className={`chip border text-[11px] ${
              result.mode === 'llm'
                ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}
          >
            {result.mode === 'llm' ? 'Grounded · Gemini' : 'Fallback'}
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Ask about the current run — answers are grounded in the reconciliation data
      </p>

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
          {loading ? <Spinner className="h-4 w-4 text-ink-950" /> : 'Ask'}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => ask(ex)}
            disabled={loading}
            className="chip border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-5 text-sm text-slate-400">
            <Spinner className="h-4 w-4" /> Thinking…
          </div>
        ) : error ? (
          <ErrorPanel error={error} onRetry={() => ask()} />
        ) : result ? (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
              {result.answer || 'No answer returned.'}
            </p>

            {/* Fallback structured extras */}
            {result.mode === 'fallback' && Array.isArray(result.top_exceptions) && result.top_exceptions.length > 0 && (
              <div className="mt-3 border-t border-white/5 pt-3">
                <p className="section-title mb-2">Top exceptions</p>
                <ul className="space-y-1 text-xs text-slate-400">
                  {result.top_exceptions.slice(0, 5).map((t, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-slate-500" />
                      {typeof t === 'string' ? t : t.entity_id ? `${t.entity_id} — ${t.predicted_exception || ''}` : JSON.stringify(t)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {citations.length > 0 && (
              <div className="mt-4 border-t border-white/5 pt-3">
                <p className="section-title mb-2">Citations · click to inspect</p>
                <div className="flex flex-wrap gap-2">
                  {citations.map((c) => {
                    const id = typeof c === 'string' ? c : c?.entity_id || String(c)
                    return (
                      <button
                        key={id}
                        onClick={() => onSelect?.(id)}
                        className="chip border-accent/30 bg-accent/10 font-mono text-accent-soft hover:bg-accent/20"
                      >
                        {id}
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
            Ask a question or pick an example above.
          </p>
        )}
      </div>
    </section>
  )
}
