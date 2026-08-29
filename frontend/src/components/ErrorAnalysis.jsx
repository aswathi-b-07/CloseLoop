import { CardHeader, ExceptionBadge, TierBadge, Skeleton } from './ui'

export default function ErrorAnalysis({ metrics, loading, onSelect }) {
  const rows = metrics?.error_analysis || []

  return (
    <section className="card card-pad">
      <CardHeader
        icon={
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.3-4.3" />
          </svg>
        }
        title="Honest error analysis"
        subtitle="The cases we still get wrong — no cherry-picking"
        right={
          <span className="chip border-rose-200 bg-rose-50 text-rose-700">
            {rows.length} misclassified
          </span>
        }
      />

      {loading && !metrics ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-700">
          No misclassifications in this run.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-xs text-slate-500">
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
                  className="cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-slate-50"
                >
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs text-navy-800">{r.entity_id ?? '—'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <ExceptionBadge type={r.true} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ExceptionBadge type={r.predicted} />
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{r.subtype ?? '—'}</td>
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
