import { Spinner } from './ui'

function LlmBadge({ health }) {
  if (!health) {
    return (
      <span className="chip border-white/10 text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
        Checking…
      </span>
    )
  }
  const connected = health.llm_configured
  return (
    <span
      className={`chip border ${
        connected
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      }`}
      title={connected ? 'Gemini API key configured' : 'Running in deterministic fallback mode'}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`}
      />
      {connected ? 'Gemini: connected' : 'Fallback mode'}
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
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent/25 to-indigo2/25 ring-1 ring-white/10">
              <svg viewBox="0 0 32 32" className="h-6 w-6">
                <path
                  d="M16 6a10 10 0 1 0 8.5 15.2l-3-1.7A6.5 6.5 0 1 1 16 9.5c1.4 0 2.7.45 3.8 1.2l1.9-3A9.95 9.95 0 0 0 16 6z"
                  fill="#2dd4bf"
                />
                <circle cx="22" cy="10" r="2.4" fill="#818cf8" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                CloseLoop
              </h1>
              <p className="text-sm text-slate-400">
                AI Finance Controller — three-way reconciliation with measured accuracy
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <LlmBadge health={health} />

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2">
            <label htmlFor="seed" className="text-xs font-medium text-slate-400">
              Seed
            </label>
            <input
              id="seed"
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="w-20 bg-transparent text-sm text-slate-100 outline-none tabular-nums"
            />
            <span className="mx-1 h-4 w-px bg-white/10" />
            <button
              type="button"
              role="switch"
              aria-checked={useLlm}
              onClick={() => setUseLlm((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium text-slate-300"
              title="Use Gemini Tier-3 reasoning for ambiguous cases"
            >
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  useLlm ? 'bg-accent' : 'bg-white/15'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
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
                <Spinner className="h-4 w-4 text-ink-950" />
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
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <span>Active run</span>
          <code className="rounded bg-white/5 px-2 py-0.5 font-mono text-slate-400">
            {runId}
          </code>
        </div>
      )}
    </header>
  )
}
