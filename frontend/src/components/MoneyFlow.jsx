import { useEffect, useRef, useState } from 'react'
import { formatINR, formatINRCompact, formatPct } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// The reconciliation loop, as a living money-flow cockpit.
//
// A dark, high-contrast hero panel that visibly *funnels* money downward —
// Orders → Captured → Settled → Bank-confirmed — with animated streams, 3D glass
// slabs, count-up figures, leaks branching off, and the one split a finance lead
// remembers: auto-reconciled (safe) vs. at-risk (needs a human). Every number is
// live from the engine (metrics.business_impact.flow) — nothing is hardcoded.
// ─────────────────────────────────────────────────────────────────────────────

const STAGE = {
  ordered: { c1: '#8B93FF', c2: '#4F46E5', glow: 'rgba(99,102,241,.55)' },
  captured: { c1: '#5AA9FF', c2: '#2563EB', glow: 'rgba(59,130,246,.55)' },
  settled: { c1: '#34D3C5', c2: '#0D9488', glow: 'rgba(20,184,166,.55)' },
  reconciled: { c1: '#4ADE80', c2: '#059669', glow: 'rgba(16,185,129,.6)' },
}
const DROP_REASON = {
  captured: 'not captured at PSP',
  settled: 'captured · not settled',
  reconciled: 'settled · not confirmed',
}

const CSS = `
.mf-panel{position:relative;overflow:hidden;border-radius:24px;color:#fff;
  background:
    radial-gradient(130% 80% at 12% -10%, rgba(79,70,229,.28), transparent 55%),
    radial-gradient(120% 90% at 110% 120%, rgba(16,185,129,.20), transparent 55%),
    linear-gradient(165deg,#0a1130 0%,#0e1940 55%,#0a1130 100%);
  background-color:#0b1233;
  box-shadow:0 30px 80px -40px rgba(8,15,45,.9),inset 0 1px 0 rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.08);padding:28px 24px 26px}
@media(min-width:640px){.mf-panel{padding:34px 34px 30px}}
.mf-grid{position:absolute;inset:0;opacity:.5;pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
  background-size:34px 34px;mask-image:radial-gradient(80% 60% at 50% 0%,#000,transparent 80%)}
.mf-slab{position:relative;overflow:hidden;border-radius:16px;
  transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s,filter .35s;
  will-change:transform}
.mf-slab:hover{transform:translateY(-3px) scale(1.015);filter:brightness(1.08);z-index:5}
.mf-liquid{position:absolute;inset:0;
  background-image:repeating-linear-gradient(115deg,rgba(255,255,255,.10) 0 16px,transparent 16px 46px);
  background-size:220% 100%;animation:mf-flow 11s linear infinite;opacity:.45}
.mf-shine{position:absolute;top:0;bottom:0;width:34%;pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),transparent);
  transform:skewX(-18deg) translateX(-160%);animation:mf-shine 8s ease-in-out infinite}
.mf-tip{position:absolute;left:50%;bottom:calc(100% + 12px);transform:translateX(-50%) translateY(6px);
  min-width:210px;padding:12px 14px;border-radius:12px;opacity:0;pointer-events:none;
  background:rgba(9,14,38,.96);border:1px solid rgba(255,255,255,.14);
  box-shadow:0 20px 40px -18px rgba(0,0,0,.8);transition:opacity .25s,transform .25s;z-index:20}
.mf-slab:hover .mf-tip{opacity:1;transform:translateX(-50%) translateY(0)}
.mf-tip::after{content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);
  border:7px solid transparent;border-top-color:rgba(9,14,38,.96)}
.mf-stream{stroke-dasharray:2 9;stroke-linecap:round;animation:mf-stream 1.7s linear infinite}
.mf-dot{animation:mf-drop 2.6s cubic-bezier(.5,0,.7,1) infinite}
.mf-leak{stroke-dasharray:2 7;stroke-linecap:round;animation:mf-stream 2s linear infinite}
.mf-pod{position:relative;overflow:hidden;border-radius:18px;transition:transform .35s,box-shadow .35s}
.mf-pod:hover{transform:translateY(-3px)}
.mf-halo{position:absolute;border-radius:9999px;filter:blur(38px);animation:mf-pulse 3.4s ease-in-out infinite}
.mf-fill{transition:width 1.1s cubic-bezier(.2,.8,.2,1)}
.mf-rise{animation:mf-rise .7s both}
@keyframes mf-flow{to{background-position:-220% 0}}
@keyframes mf-shine{0%{transform:skewX(-18deg) translateX(-160%)}55%,100%{transform:skewX(-18deg) translateX(420%)}}
@keyframes mf-stream{to{stroke-dashoffset:-11}}
@keyframes mf-drop{0%{transform:translateY(-14px);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translateY(14px);opacity:0}}
@keyframes mf-pulse{0%,100%{opacity:.45;transform:scale(.96)}50%{opacity:.85;transform:scale(1.04)}}
@keyframes mf-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:reduce){
  .mf-liquid,.mf-shine,.mf-stream,.mf-dot,.mf-leak,.mf-halo,.mf-rise{animation:none}
  .mf-fill{transition:none}}
`

// Count a number up from 0 with easing (respects reduced-motion).
function useCountUp(target, duration = 1200) {
  const [v, setV] = useState(0)
  const raf = useRef()
  useEffect(() => {
    const to = Number(target)
    if (!Number.isFinite(to)) return setV(0)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return setV(to)
    let start
    const tick = (t) => {
      if (start == null) start = t
      const p = Math.min(1, (t - start) / duration)
      setV(to * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return v
}

function StageSlab({ stage, widthPct, index, mounted }) {
  const s = STAGE[stage.key] || STAGE.captured
  const shown = useCountUp(mounted ? stage.value_inr : 0, 1100 + index * 120)
  return (
    <div className="flex w-full justify-center">
      <div
        className="mf-slab group"
        style={{
          width: `${widthPct}%`,
          minWidth: 240,
          background: `linear-gradient(180deg, ${s.c1} 0%, ${s.c2} 100%)`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,.45), inset 0 -8px 16px rgba(0,0,0,.28), 0 16px 34px -14px ${s.glow}`,
        }}
      >
        <div className="mf-liquid" />
        <div className="mf-shine" />
        <div className="relative flex items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/25 text-xs font-bold text-white/90 ring-1 ring-white/30">
              {index + 1}
            </span>
            <div className="leading-tight">
              <p className="text-base font-extrabold tracking-tight text-white sm:text-lg">
                {stage.label}
              </p>
              <p className="text-xs font-medium text-white/70 sm:text-sm">{stage.hint}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-black tabular-nums leading-none text-white drop-shadow sm:text-3xl">
              {formatINRCompact(shown)}
            </p>
            <p className="mt-1 text-sm font-bold tabular-nums text-white/80">
              {formatPct(stage.pct)}
            </p>
          </div>
        </div>

        {/* Hover detail */}
        <div className="mf-tip text-left">
          <p className="text-sm font-bold text-white">{stage.label}</p>
          <p className="mt-0.5 text-xs text-slate-300">{stage.hint}</p>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <span className="font-display text-lg font-extrabold tabular-nums text-white">
              {formatINR(stage.value_inr)}
            </span>
            <span className="text-xs font-semibold text-slate-300">
              {formatPct(stage.pct)} of ledger
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// The animated stream + leak spur that sits between two slabs.
function Connector({ nextPct, drop }) {
  const thickness = Math.max(5, Math.min(12, (nextPct || 0) * 0.12))
  return (
    <div className="relative flex items-stretch justify-center" style={{ height: 46 }}>
      {/* central downward stream */}
      <svg width="26" height="46" viewBox="0 0 26 46" className="overflow-visible">
        <line x1="13" y1="0" x2="13" y2="46" stroke="rgba(255,255,255,.10)" strokeWidth={thickness} strokeLinecap="round" />
        <line x1="13" y1="0" x2="13" y2="46" className="mf-stream" stroke="rgba(180,210,255,.9)" strokeWidth={thickness - 2} />
        <circle className="mf-dot" cx="13" cy="0" r="2.4" fill="#dbeafe" />
        <circle className="mf-dot" cx="13" cy="0" r="2" fill="#bfdbfe" style={{ animationDelay: '.8s' }} />
      </svg>

      {/* leak spur to the right */}
      {drop?.value > 0 && (
        <div className="absolute left-1/2 top-1/2 flex -translate-y-1/2 items-center" style={{ marginLeft: 14 }}>
          <svg width="34" height="16" viewBox="0 0 34 16" className="overflow-visible">
            <path d="M0 8 H30" stroke="rgba(245,158,11,.25)" strokeWidth="4" strokeLinecap="round" />
            <path d="M0 8 H30" className="mf-leak" stroke="#f59e0b" strokeWidth="2.5" />
            <path d="M28 4 L34 8 L28 12 Z" fill="#f59e0b" />
          </svg>
          <span className="ml-1 whitespace-nowrap rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200">
            −{formatINRCompact(drop.value)}
            <span className="ml-1 hidden font-normal text-amber-200/70 sm:inline">{drop.reason}</span>
          </span>
        </div>
      )}
    </div>
  )
}

function OutcomePod({ tone, label, value, pct, note, icon, mounted, delay }) {
  const shown = useCountUp(mounted ? value : 0, 1300)
  const good = tone === 'good'
  const accent = good ? '#34D399' : '#FB7185'
  const c2 = good ? '#059669' : '#E11D48'
  return (
    <div
      className="mf-pod mf-rise"
      style={{
        animationDelay: `${delay}ms`,
        background: `linear-gradient(160deg, ${accent}22, rgba(9,14,38,.55))`,
        border: `1px solid ${accent}44`,
        boxShadow: `0 26px 50px -26px ${accent}77, inset 0 1px 0 rgba(255,255,255,.12)`,
      }}
    >
      <div className="mf-halo" style={{ inset: 'auto -20px -30px auto', width: 150, height: 150, background: `${accent}55` }} />
      <div className="relative p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: `${accent}22`, color: accent }}
          >
            {icon}
          </span>
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">{label}</p>
        </div>
        <p
          className="mt-3 font-display text-4xl font-black tracking-tight tabular-nums sm:text-5xl"
          style={{ color: accent, textShadow: `0 0 26px ${c2}66` }}
        >
          {formatINRCompact(shown)}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-sm font-bold tabular-nums text-white">
            {formatPct(pct)}
          </span>
          <span className="text-sm text-white/70">of ledger · {formatINR(value)}</span>
        </div>
        <p className="mt-2 text-sm text-white/60">{note}</p>
      </div>
    </div>
  )
}

export default function MoneyFlow({ metrics, loading }) {
  const flow = metrics?.business_impact?.flow
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (flow) {
      setMounted(false)
      const id = requestAnimationFrame(() => setMounted(true))
      return () => cancelAnimationFrame(id)
    }
  }, [flow])

  if (loading && !flow) {
    return (
      <section className="mf-panel">
        <style>{CSS}</style>
        <div className="mf-grid" />
        <div className="relative animate-pulse space-y-4">
          <div className="h-6 w-72 rounded bg-white/10" />
          {[100, 94, 92, 60].map((w, i) => (
            <div key={i} className="mx-auto h-14 rounded-2xl bg-white/10" style={{ width: `${w}%` }} />
          ))}
        </div>
      </section>
    )
  }
  if (!flow?.stages?.length) return null

  const maxPct = Math.max(...flow.stages.map((s) => s.pct)) || 1

  return (
    <section className="mf-panel">
      <style>{CSS}</style>
      <div className="mf-grid" />

      {/* Header */}
      <div className="relative mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-400/20 text-emerald-300">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M7 12h10M10 17h4" />
              </svg>
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300/90">
              Live reconciliation loop
            </p>
          </div>
          <h2 className="mt-2 font-display text-2xl font-black tracking-tight text-white sm:text-3xl">
            Where the money goes
          </h2>
          <p className="mt-1 text-sm text-white/60 sm:text-base">
            Every rupee followed from order to bank — and the exact amount a human still needs to see.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Processed</p>
          <p className="font-display text-2xl font-black tabular-nums text-white">
            {formatINRCompact(flow.ledger_value_inr)}
          </p>
        </div>
      </div>

      {/* Funnel */}
      <div className="relative">
        {flow.stages.map((s, i) => {
          const next = flow.stages[i + 1]
          return (
            <div key={s.key}>
              <StageSlab
                stage={s}
                index={i}
                widthPct={Math.max(46, (s.pct / maxPct) * 100)}
                mounted={mounted}
              />
              {next && (
                <Connector
                  nextPct={next.pct}
                  drop={{ value: next.drop_inr, reason: DROP_REASON[next.key] }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Split into the two outcomes */}
      <div className="relative mt-5">
        <div className="mb-3 flex items-center justify-center gap-3 text-white/40">
          <span className="h-px w-16 bg-gradient-to-r from-transparent to-white/25" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em]">The loop closes</span>
          <span className="h-px w-16 bg-gradient-to-l from-transparent to-white/25" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <OutcomePod
            tone="good"
            label="Auto-reconciled — hands off"
            value={flow.auto_reconciled_inr}
            pct={flow.auto_reconciled_pct}
            note="Closed the loop with zero human touch."
            mounted={mounted}
            delay={150}
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            }
          />
          <OutcomePod
            tone="risk"
            label="At-risk — needs review"
            value={flow.at_risk_inr}
            pct={flow.at_risk_pct}
            note="Surfaced for a human instead of leaking silently."
            mounted={mounted}
            delay={300}
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.86l-8.5 14.7A2 2 0 003.5 21.5h17a2 2 0 001.7-3L13.7 3.86a2 2 0 00-3.4 0z" />
              </svg>
            }
          />
        </div>
      </div>
    </section>
  )
}
