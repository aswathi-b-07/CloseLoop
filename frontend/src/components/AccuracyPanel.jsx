import { formatRatio } from '../lib/format'
import { exceptionMeta } from '../lib/taxonomy'
import { CardHeader, Skeleton } from './ui'

function Stat({ label, value, highlight }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-line bg-slate-50'
      }`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tabular-nums ${
          highlight ? 'text-emerald-700' : 'text-navy'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

export default function AccuracyPanel({ metrics, loading }) {
  const det = metrics?.detection
  const perClass = metrics?.per_class || {}
  const macro = metrics?.classification_macro

  return (
    <section className="card card-pad">
      <CardHeader
        icon={
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="3.5" />
          </svg>
        }
        title="Detection accuracy"
        subtitle="Measured on a labelled synthetic ledger — not self-reported"
        right={
          det?.recall != null && Number(det.recall) >= 0.999 ? (
            <span className="chip border-emerald-200 bg-emerald-50 text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Recall 1.000
            </span>
          ) : null
        }
      />

      {loading && !metrics ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Precision" value={formatRatio(det?.precision)} />
            <Stat label="Recall" value={formatRatio(det?.recall)} highlight={Number(det?.recall) >= 0.999} />
            <Stat label="F1" value={formatRatio(det?.f1)} />
            <Stat label="Accuracy" value={formatRatio(det?.accuracy)} />
          </div>

          <div className="mt-4 grid grid-cols-4 gap-3 text-center text-xs">
            <div className="rounded-lg bg-slate-50 py-2">
              <span className="block text-slate-400">TP</span>
              <span className="font-semibold tabular-nums text-emerald-600">{det?.tp ?? '—'}</span>
            </div>
            <div className="rounded-lg bg-slate-50 py-2">
              <span className="block text-slate-400">FP</span>
              <span className="font-semibold tabular-nums text-amber-600">{det?.fp ?? '—'}</span>
            </div>
            <div className="rounded-lg bg-slate-50 py-2">
              <span className="block text-slate-400">FN</span>
              <span className="font-semibold tabular-nums text-rose-600">{det?.fn ?? '—'}</span>
            </div>
            <div className="rounded-lg bg-slate-50 py-2">
              <span className="block text-slate-400">TN</span>
              <span className="font-semibold tabular-nums text-slate-600">{det?.tn ?? '—'}</span>
            </div>
          </div>

          {/* Per-class table */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="section-title">Per-class classification</p>
              {macro && (
                <p className="text-xs text-slate-500">
                  Macro F1 <span className="font-semibold text-navy-700">{formatRatio(macro.f1)}</span>
                </p>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-3 py-2 font-medium">Exception type</th>
                    <th className="px-3 py-2 text-right font-medium">Precision</th>
                    <th className="px-3 py-2 text-right font-medium">Recall</th>
                    <th className="px-3 py-2 text-right font-medium">F1</th>
                    <th className="px-3 py-2 text-right font-medium">Support</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(perClass).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                        No per-class data.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(perClass).map(([type, m]) => {
                      const meta = exceptionMeta(type)
                      return (
                        <tr key={type} className="border-b border-line last:border-0 hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
                              <span className="text-navy-700">{meta.label}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatRatio(m.precision)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatRatio(m.recall)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatRatio(m.f1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{m.support ?? '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
