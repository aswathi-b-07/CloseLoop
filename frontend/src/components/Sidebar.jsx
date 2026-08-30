import { ROUTES, ROUTE_ORDER } from '../lib/nav'

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rzp to-rzp-dark shadow-glow">
        <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
          <path
            d="M16 5a11 11 0 1 0 9.5 16.6l-3.1-1.8A7.4 7.4 0 1 1 16 8.6c1.6 0 3 .5 4.2 1.3l1.9-3.1A10.9 10.9 0 0 0 16 5z"
            fill="#ffffff"
          />
          <circle cx="23.5" cy="9" r="2.6" fill="#ffffff" />
        </svg>
      </div>
      <div className="leading-tight">
        <p className="font-display text-xl font-extrabold tracking-tight text-navy">CloseLoop</p>
        <p className="text-[11px] font-medium text-slate-400">AI Finance Controller</p>
      </div>
    </div>
  )
}

function NavButton({ id, active, onClick, badge, compact }) {
  const r = ROUTES[id]
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      title={r.desc}
      aria-current={active ? 'page' : undefined}
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
        active
          ? 'bg-rzp-tint font-semibold text-rzp-darker ring-1 ring-rzp/15'
          : 'font-medium text-navy-700 hover:bg-slate-50'
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center ${
          active ? 'text-rzp' : 'text-slate-400 group-hover:text-navy-600'
        }`}
      >
        {r.icon}
      </span>
      <span className="flex-1">{r.label}</span>
      {badge != null && badge > 0 && (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
            active ? 'bg-rzp text-white' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {badge}
        </span>
      )}
      {!compact && (
        <span className="hidden truncate text-[11px] font-normal text-slate-400" />
      )}
    </button>
  )
}

function HealthPill({ health }) {
  if (!health) {
    return (
      <span className="chip border-line text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> Checking…
      </span>
    )
  }
  const on = health.llm_configured
  return (
    <span
      className={`chip border ${
        on
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
      title={on ? 'Gemini API key configured' : 'Running in deterministic fallback mode'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {on ? 'Gemini connected' : 'Fallback mode'}
    </span>
  )
}

// Desktop: a fixed left rail.
export function Sidebar({ route, navigate, health, runId, exceptionsCount }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-white/90 backdrop-blur lg:flex">
      <div className="px-5 py-5">
        <Brand />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Workspace
        </p>
        {ROUTE_ORDER.map((id) => (
          <NavButton
            key={id}
            id={id}
            active={route === id}
            onClick={navigate}
            badge={id === 'exceptions' ? exceptionsCount : undefined}
          />
        ))}
      </nav>

      <div className="space-y-2 border-t border-line px-5 py-4">
        <HealthPill health={health} />
        {runId && (
          <p className="truncate text-[11px] text-slate-400">
            Run <code className="font-mono text-slate-500">{runId}</code>
          </p>
        )}
        <p className="text-[11px] leading-snug text-slate-400">
          Recommends, never auto-posts — every decision is logged.
        </p>
      </div>
    </aside>
  )
}

// Mobile: a sticky top bar with brand + a horizontal scrollable pill nav.
export function MobileNav({ route, navigate, exceptionsCount }) {
  return (
    <div className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Brand />
      </div>
      <nav className="flex gap-2 overflow-x-auto px-4 pb-3">
        {ROUTE_ORDER.map((id) => {
          const active = route === id
          const badge = id === 'exceptions' ? exceptionsCount : undefined
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-colors ${
                active
                  ? 'bg-rzp text-white font-semibold shadow-glow'
                  : 'border border-line bg-white font-medium text-navy-700'
              }`}
            >
              <span className="h-4 w-4">{ROUTES[id].icon}</span>
              {ROUTES[id].label}
              {badge != null && badge > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                    active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
