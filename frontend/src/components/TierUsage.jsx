import { TIER_ORDER, tierMeta } from '../lib/taxonomy'
import { CardHeader, Skeleton } from './ui'

export default function TierUsage({ metrics, loading }) {
  const usage = metrics?.tier_usage || {}
  const entries = TIER_ORDER.filter((t) => usage[t] != null).map((t) => ({
    tier: t,
    count: usage[t],
    ...tierMeta(t),
  }))
  const total = entries.reduce((s, e) => s + e.count, 0) || 1

  return (
    <section className="card card-pad">
      <CardHeader
        icon={
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 5-9 5-9-5 9-5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9 5 9-5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5l9 5 9-5" />
          </svg>
        }
        title="Tier usage"
        subtitle="Cheapest tool that can be right — most cases never reach the LLM"
        right={<span className="text-sm font-medium text-slate-500">{total} decisions</span>}
      />

      {loading && !metrics ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No tier data.</p>
      ) : (
        <>
          {/* Stacked bar */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {entries.map((e) => (
              <div
                key={e.tier}
                className="h-full transition-all"
                style={{ width: `${(e.count / total) * 100}%`, background: e.bar }}
                title={`${e.label}: ${e.count}`}
              />
            ))}
          </div>

          {/* Legend + per-tier bars */}
          <div className="mt-5 space-y-3">
            {entries.map((e) => (
              <div key={e.tier} className="flex items-center gap-3">
                <div className="flex w-40 shrink-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.bar }} />
                  <span className="text-sm text-navy-700">{e.label}</span>
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(e.count / total) * 100}%`, background: e.bar }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-navy-800">
                  {e.count}
                </span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-400">
                  {Math.round((e.count / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
