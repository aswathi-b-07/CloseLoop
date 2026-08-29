import { exceptionMeta, tierMeta } from '../lib/taxonomy'
import { formatPct } from '../lib/format'

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg
      className={`animate-spin text-accent ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

export function ExceptionBadge({ type, className = '' }) {
  const m = exceptionMeta(type)
  return (
    <span
      className={`chip border ${m.badge} ${className}`}
      title={type || 'NONE'}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />
      {m.label}
    </span>
  )
}

export function TierBadge({ tier, className = '' }) {
  const m = tierMeta(tier)
  return (
    <span className={`chip border ${m.badge} ${className}`} title={m.hint}>
      {m.label}
    </span>
  )
}

export function ConfidenceBar({ value }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0))
  const color = pct >= 0.8 ? '#34d399' : pct >= 0.5 ? '#2dd4bf' : '#f59e0b'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
      <span className="tabular-nums text-xs text-slate-400">
        {formatPct(pct, { decimals: 0 })}
      </span>
    </div>
  )
}

export function LoadingPanel({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-slate-400">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorPanel({ error, onRetry }) {
  const isDown = error?.status === 0
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 px-6 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.86l-8.5 14.7A2 2 0 003.5 21.5h17a2 2 0 001.7-3L13.7 3.86a2 2 0 00-3.4 0z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-rose-200">{error?.message || 'Something went wrong.'}</p>
      {isDown && (
        <p className="max-w-md text-xs text-slate-400">
          Start the backend first, e.g. <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-accent-soft">uvicorn src.app:app --port 8000</code>, then retry.
        </p>
      )}
      {onRetry && (
        <button className="btn-ghost mt-1" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyPanel({ label = 'No data yet.' }) {
  return (
    <div className="flex items-center justify-center py-10 text-sm text-slate-500">
      {label}
    </div>
  )
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`shimmer rounded-md bg-white/5 ${className}`} />
}
