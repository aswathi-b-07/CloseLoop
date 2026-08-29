import { ExceptionBadge, TierBadge, Skeleton } from './ui'

export default function ErrorAnalysis({ metrics, loading, onSelect }) {
  const rows = metrics?.error_analysis || []

  return (
    <section className="card card-pad">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-semibold text-white">Honest error analysis</h2>
        <span className="chip border-rose-500/30 bg-rose-500/10 text-rose-300">
          {rows.length} misclassified
        </span>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        The cases we still get wrong — no cherry-picking
      </p>

      {loading && !metrics ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-6 text-center text-sm text-emerald-300">
          No misclassifications in this run.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">True</th>
                <th className="px-3 py-2 font-medium">Predicted</th>
                <th className="px-3 py-2 font-medium">Subtype</th>
                <th className="px-3 py-2 font-medium">Tier</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.entity_id}-${i}`}
                  onClick={() => r.entity_id && onSelect?.(r.entity_id)}
                  className="cursor-pointer border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs text-slate-200">{r.entity_id ?? '—'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <ExceptionBadge type={r.true} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ExceptionBadge type={r.predicted} />
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{r.subtype ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <TierBadge tier={r.tier} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
