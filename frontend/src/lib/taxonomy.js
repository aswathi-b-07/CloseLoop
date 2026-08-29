// Exception taxonomy -> label + color classes (Tailwind, light theme).
// Each entry provides badge classes and a solid accent color for bars/dots.

export const EXCEPTION_META = {
  FEE_MISMATCH: {
    label: 'Fee Mismatch',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: '#f59e0b',
  },
  AMOUNT_MISMATCH: {
    label: 'Amount Mismatch',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: '#f97316',
  },
  MISSING_SETTLEMENT: {
    label: 'Missing Settlement',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: '#f43f5e',
  },
  MISSING_PAYMENT: {
    label: 'Missing Payment',
    badge: 'bg-red-50 text-red-700 border-red-200',
    dot: '#ef4444',
  },
  DUPLICATE_PAYMENT: {
    label: 'Duplicate Payment',
    badge: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    dot: '#d946ef',
  },
  REFUND_NOT_REFLECTED: {
    label: 'Refund Not Reflected',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    dot: '#8b5cf6',
  },
  CHARGEBACK: {
    label: 'Chargeback',
    badge: 'bg-pink-50 text-pink-700 border-pink-200',
    dot: '#ec4899',
  },
  UNMATCHED_BANK_CREDIT: {
    label: 'Unmatched Bank Credit',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    dot: '#0ea5e9',
  },
  NONE: {
    label: 'Matched',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: '#10b981',
  },
}

export function exceptionMeta(type) {
  if (!type) return EXCEPTION_META.NONE
  return (
    EXCEPTION_META[type] || {
      label: String(type).replace(/_/g, ' '),
      badge: 'bg-slate-100 text-slate-600 border-slate-200',
      dot: '#94a3b8',
    }
  )
}

export const TIER_META = {
  DETERMINISTIC: {
    label: 'Deterministic',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bar: '#12b76a',
    hint: 'Rule-based, exact match',
  },
  HEURISTIC: {
    label: 'Heuristic',
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
    bar: '#14b8a6',
    hint: 'Tolerance / scoring',
  },
  LLM: {
    label: 'Gemini (LLM)',
    badge: 'bg-rzp-tint text-rzp-darker border-rzp/30',
    bar: '#3395FF',
    hint: 'Tier-3 reasoning',
  },
  FALLBACK: {
    label: 'Fallback',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    bar: '#f59e0b',
    hint: 'LLM unavailable',
  },
}

export function tierMeta(tier) {
  if (!tier) return { label: '—', badge: 'bg-slate-100 text-slate-600 border-slate-200', bar: '#94a3b8', hint: '' }
  return (
    TIER_META[tier] || {
      label: String(tier),
      badge: 'bg-slate-100 text-slate-600 border-slate-200',
      bar: '#94a3b8',
      hint: '',
    }
  )
}

export const TIER_ORDER = ['DETERMINISTIC', 'HEURISTIC', 'LLM', 'FALLBACK']
