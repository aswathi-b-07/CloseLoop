import { TIER_ORDER, tierMeta } from '../lib/taxonomy'
import { Skeleton } from './ui'

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
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Tier usage</h2>
        <span className="text-xs text-slate-500">{total} decisions</span>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Cheapest tool that can be right — most cases never reach the LLM
      </p>

      {loading && !metrics ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No tier data.</p>
      ) : (
        <>
          {/* Stacked bar */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
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
                  <span className="text-sm text-slate-200">{e.label}</span>
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(e.count / total) * 100}%`, background: e.bar }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-200">
                  {e.count}
                </span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-500">
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
