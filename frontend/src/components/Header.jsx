import { Spinner } from './ui'

function LlmBadge({ health }) {
  if (!health) {
    return (
      <span className="chip border-line text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        Checking…
      </span>
    )
  }
  const connected = health.llm_configured
  return (
    <span
      className={`chip border ${
        connected
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
      title={connected ? 'Gemini API key configured' : 'Running in deterministic fallback mode'}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
      />
      {connected ? 'Gemini · connected' : 'Fallback mode'}
    </span>
  )
}

export default function Header({
  health,
  seed,
  setSeed,
  useLlm,
  setUseLlm,
  onRun,
  running,
  runId,
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-col gap-5 rounded-2xl border border-line bg-white px-5 py-4 shadow-nav sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-rzp to-rzp-dark shadow-glow">
            <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
              <path
                d="M16 5a11 11 0 1 0 9.5 16.6l-3.1-1.8A7.4 7.4 0 1 1 16 8.6c1.6 0 3 .5 4.2 1.3l1.9-3.1A10.9 10.9 0 0 0 16 5z"
                fill="#ffffff"
              />
              <circle cx="23.5" cy="9" r="2.6" fill="#ffffff" />
            </svg>
          </div>
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-navy">
              CloseLoop
            </h1>
            <p className="text-sm text-slate-500">
              AI Finance Controller — three-way reconciliation with measured accuracy
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <LlmBadge health={health} />

          <div className="flex items-center gap-2 rounded-xl border border-line bg-slate-50/60 px-3 py-2">
            <label htmlFor="seed" className="text-xs font-medium text-slate-500">
              Seed
            </label>
            <input
              id="seed"
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="w-20 bg-transparent text-sm font-medium text-navy-800 outline-none tabular-nums"
            />
            <span className="mx-1 h-4 w-px bg-line" />
            <button
              type="button"
              role="switch"
              aria-checked={useLlm}
              onClick={() => setUseLlm((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium text-navy-700"
              title="Use Gemini Tier-3 reasoning for ambiguous cases"
            >
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  useLlm ? 'bg-rzp' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    useLlm ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </span>
              Use Gemini Tier-3
            </button>
          </div>

          <button className="btn-primary" onClick={onRun} disabled={running}>
            {running ? (
              <>
                <Spinner className="h-4 w-4 text-white" />
                Running…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
                Run reconciliation
              </>
            )}
          </button>
        </div>
      </div>

      {runId && (
        <div className="mt-3 flex items-center gap-2 px-1 text-xs text-slate-400">
          <span>Active run</span>
          <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-500">
            {runId}
          </code>
        </div>
      )}
    </header>
  )
}
