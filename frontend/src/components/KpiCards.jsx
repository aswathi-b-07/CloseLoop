import { formatINR, formatINRCompact, formatPct, formatRatio } from '../lib/format'
import { Skeleton } from './ui'

function KpiCard({ label, value, sub, accent, hero, icon }) {
  return (
    <div
      className={`card card-hover card-pad relative overflow-hidden ${
        hero ? 'ring-1 ring-rzp/15' : ''
      }`}
    >
      {hero && accent && (
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl"
          style={{ background: `${accent}1f` }}
        />
      )}
      <div className="flex items-start justify-between">
        <p className="section-title">{label}</p>
        {icon}
      </div>
      <p
        className={`mt-3 font-display font-extrabold tracking-tight tabular-nums ${
          hero ? 'text-3xl sm:text-4xl' : 'text-3xl'
        }`}
        style={{ color: accent || '#0F1B3D' }}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
    </div>
  )
}

export default function KpiCards({ metrics, loading }) {
  if (loading && !metrics) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card card-pad">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-9 w-32" />
            <Skeleton className="mt-3 h-3 w-20" />
          </div>
        ))}
      </div>
    )
  }

  if (!metrics) return null

  const bi = metrics.business_impact || {}
  const detF1 = metrics.detection?.f1

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Match rate"
        value={formatPct(metrics.match_rate)}
        sub={`${metrics.n_entities ?? '—'} entities reconciled`}
        accent="#0F1B3D"
      />
      <KpiCard
        label="Detection F1"
        value={formatRatio(detF1)}
        sub={`Recall ${formatRatio(metrics.detection?.recall)} · Precision ${formatRatio(
          metrics.detection?.precision,
        )}`}
        accent="#1E64E7"
      />
      <KpiCard
        hero
        label="Auto-reconciled"
        value={formatINRCompact(bi.auto_reconciled_inr)}
        sub={`${formatPct(bi.auto_reconciled_pct, { fraction: bi.auto_reconciled_pct <= 1 })} of ledger · ${formatINR(
          bi.auto_reconciled_inr,
        )}`}
        accent="#0B9E63"
        icon={
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        }
      />
      <KpiCard
        hero
        label="At-risk value"
        value={formatINRCompact(bi.at_risk_inr)}
        sub={`${formatPct(bi.at_risk_pct, { fraction: bi.at_risk_pct <= 1 })} of ledger · ${formatINR(
          bi.at_risk_inr,
        )}`}
        accent="#F04438"
        icon={
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.86l-8.5 14.7A2 2 0 003.5 21.5h17a2 2 0 001.7-3L13.7 3.86a2 2 0 00-3.4 0z" />
          </svg>
        }
      />
    </div>
  )
}
