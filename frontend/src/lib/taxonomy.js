// Exception taxonomy -> label + color classes (Tailwind).
// Each entry provides badge classes and a solid accent color for bars/dots.

export const EXCEPTION_META = {
  FEE_MISMATCH: {
    label: 'Fee Mismatch',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: '#f59e0b',
  },
  AMOUNT_MISMATCH: {
    label: 'Amount Mismatch',
    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    dot: '#fb923c',
  },
  MISSING_SETTLEMENT: {
    label: 'Missing Settlement',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: '#fb7185',
  },
  MISSING_PAYMENT: {
    label: 'Missing Payment',
    badge: 'bg-red-500/15 text-red-300 border-red-500/30',
    dot: '#f87171',
  },
  DUPLICATE_PAYMENT: {
    label: 'Duplicate Payment',
    badge: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    dot: '#e879f9',
  },
  REFUND_NOT_REFLECTED: {
    label: 'Refund Not Reflected',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    dot: '#a78bfa',
  },
  CHARGEBACK: {
    label: 'Chargeback',
    badge: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
    dot: '#f472b6',
  },
  UNMATCHED_BANK_CREDIT: {
    label: 'Unmatched Bank Credit',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    dot: '#38bdf8',
  },
  NONE: {
    label: 'Matched',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: '#34d399',
  },
}

export function exceptionMeta(type) {
  if (!type) return EXCEPTION_META.NONE
  return (
    EXCEPTION_META[type] || {
      label: String(type).replace(/_/g, ' '),
      badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
      dot: '#94a3b8',
    }
  )
}

export const TIER_META = {
  DETERMINISTIC: {
    label: 'Deterministic',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    bar: '#34d399',
    hint: 'Rule-based, exact match',
  },
  HEURISTIC: {
    label: 'Heuristic',
    badge: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    bar: '#2dd4bf',
    hint: 'Tolerance / scoring',
  },
  LLM: {
    label: 'Gemini (LLM)',
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    bar: '#818cf8',
    hint: 'Tier-3 reasoning',
  },
  FALLBACK: {
    label: 'Fallback',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    bar: '#f59e0b',
    hint: 'LLM unavailable',
  },
}

export function tierMeta(tier) {
  if (!tier) return { label: '—', badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30', bar: '#94a3b8', hint: '' }
  return (
    TIER_META[tier] || {
      label: String(tier),
      badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
      bar: '#94a3b8',
      hint: '',
    }
  )
}

export const TIER_ORDER = ['DETERMINISTIC', 'HEURISTIC', 'LLM', 'FALLBACK']
