import { ROUTES } from '../lib/nav'
import { Spinner } from './ui'

// The persistent action bar at the top of the main column: it names the current
// page (so you always know where you are) and holds the run controls.
export default function TopBar({ route, seed, setSeed, useLlm, setUseLlm, onRun, running }) {
  const r = ROUTES[route] || ROUTES.overview
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur lg:top-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-navy sm:text-2xl">
            {r.title}
          </h1>
          <p className="mt-0.5 truncate text-sm text-slate-500">{r.desc}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
            <label htmlFor="seed" className="text-xs font-medium text-slate-500">
              Seed
            </label>
            <input
              id="seed"
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="w-16 bg-transparent text-sm font-medium text-navy-800 outline-none tabular-nums"
            />
            <span className="mx-0.5 h-4 w-px bg-line" />
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
              Gemini Tier-3
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
    </div>
  )
}
