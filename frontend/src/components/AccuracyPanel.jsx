import { formatRatio } from '../lib/format'
import { exceptionMeta } from '../lib/taxonomy'
import { Skeleton } from './ui'

function Stat({ label, value, highlight }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-white/5 bg-white/[0.02]'
      }`}
    >
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tabular-nums ${
          highlight ? 'text-emerald-300' : 'text-slate-100'
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
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Detection accuracy</h2>
          <p className="text-xs text-slate-400">
            Measured on a labelled synthetic ledger — not self-reported
          </p>
        </div>
        {det?.recall != null && Number(det.recall) >= 0.999 && (
          <span className="chip border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Recall 1.000 — zero missed exceptions
          </span>
        )}
      </div>

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
            <div className="rounded-lg bg-white/[0.02] py-2">
              <span className="block text-slate-500">TP</span>
              <span className="font-semibold tabular-nums text-emerald-300">{det?.tp ?? '—'}</span>
            </div>
            <div className="rounded-lg bg-white/[0.02] py-2">
              <span className="block text-slate-500">FP</span>
              <span className="font-semibold tabular-nums text-amber-300">{det?.fp ?? '—'}</span>
            </div>
            <div className="rounded-lg bg-white/[0.02] py-2">
              <span className="block text-slate-500">FN</span>
              <span className="font-semibold tabular-nums text-rose-300">{det?.fn ?? '—'}</span>
            </div>
            <div className="rounded-lg bg-white/[0.02] py-2">
              <span className="block text-slate-500">TN</span>
              <span className="font-semibold tabular-nums text-slate-300">{det?.tn ?? '—'}</span>
            </div>
          </div>

          {/* Per-class table */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="section-title">Per-class classification</p>
              {macro && (
                <p className="text-xs text-slate-400">
                  Macro F1 <span className="font-semibold text-slate-200">{formatRatio(macro.f1)}</span>
                </p>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left text-xs text-slate-500">
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
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        No per-class data.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(perClass).map(([type, m]) => {
                      const meta = exceptionMeta(type)
                      return (
                        <tr key={type} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
                              <span className="text-slate-200">{meta.label}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">{formatRatio(m.precision)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">{formatRatio(m.recall)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">{formatRatio(m.f1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-400">{m.support ?? '—'}</td>
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
