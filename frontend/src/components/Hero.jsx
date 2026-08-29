const TRUST = [
  'Measured accuracy',
  'Honest exceptions',
  'Bounded execution',
  'Full audit trail',
  'Appropriate AI use',
]

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-rzp" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

export default function Hero() {
  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-white px-6 py-10 shadow-card sm:px-10 sm:py-14">
      {/* Soft geometric accents (RazorSense-style) */}
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-rzp/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-28 top-8 hidden h-24 w-24 rotate-12 rounded-3xl bg-rzp-bright/10 sm:block" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-rzp-bright/10 blur-3xl" />

      <div className="relative max-w-3xl">
        <span className="chip border-rzp/20 bg-rzp-tint text-rzp-darker">
          <span className="h-1.5 w-1.5 rounded-full bg-rzp" />
          Razorpay AI Buildathon 2026 · AI Finance Controller
        </span>

        <h2 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-navy sm:text-5xl lg:text-[3.4rem]">
          The AI finance controller that{' '}
          <span className="text-rzp">closes the reconciliation loop</span>.
        </h2>

        <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          Three-way reconciliation across your order ledger, Razorpay settlements, and the
          bank — with measured accuracy, honest exception reporting, and a full audit trail.
          It <span className="font-semibold text-navy-700">recommends</span>; it never auto-posts.
        </p>

        <div className="mt-7 flex flex-wrap gap-2">
          {TRUST.map((t) => (
            <span key={t} className="chip border-line bg-white text-navy-700 shadow-sm">
              <Check />
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
