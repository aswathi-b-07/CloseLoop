import KpiCards from '../KpiCards'
import MoneyFlow from '../MoneyFlow'

const TRUST = [
  'Measured accuracy',
  'Honest exceptions',
  'Bounded execution',
  'Full audit trail',
  'Appropriate AI use',
]

export default function OverviewPage({ metrics, loading }) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Compact context band — sets the story without a giant hero */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-white px-6 py-6 shadow-card sm:px-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-rzp/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <span className="chip border-rzp/20 bg-rzp-tint text-rzp-darker">
            <span className="h-1.5 w-1.5 rounded-full bg-rzp" />
            Razorpay AI Buildathon 2026
          </span>
          <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight tracking-tight text-navy sm:text-3xl">
            The AI controller that <span className="text-rzp">closes the reconciliation loop</span>.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Three-way reconciliation across your ledger, Razorpay settlements, and the bank.
            It recommends; it never auto-posts.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {TRUST.map((t) => (
              <span key={t} className="chip border-line bg-white text-navy-700 shadow-sm">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-rzp" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* The star: the money-flow loop */}
      <MoneyFlow metrics={metrics} loading={loading} />

      {/* Supporting headline KPIs */}
      <KpiCards metrics={metrics} loading={loading} />
    </div>
  )
}
