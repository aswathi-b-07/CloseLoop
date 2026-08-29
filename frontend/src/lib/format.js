// --- Number & currency formatting helpers ---

// Indian digit grouping (lakh/crore style): e.g. 209327 -> "2,09,327"
const inrGroup = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export function formatINR(value, { decimals = 0, symbol = true } = {}) {
  if (value == null || Number.isNaN(Number(value))) return symbol ? '₹—' : '—'
  const n = Number(value)
  const fmt = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  })
  return `${symbol ? '₹' : ''}${fmt.format(n)}`
}

// Compact INR for very large numbers -> "₹2.09 L", "₹1.4 Cr"
export function formatINRCompact(value) {
  if (value == null || Number.isNaN(Number(value))) return '₹—'
  const n = Number(value)
  const abs = Math.abs(n)
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`
  return `₹${inrGroup.format(n)}`
}

// value expected as a fraction 0..1 by default
export function formatPct(value, { fraction = true, decimals = 1 } = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const pct = fraction ? Number(value) * 100 : Number(value)
  return `${pct.toFixed(decimals)}%`
}

// For metrics like precision/recall/f1 shown as 0.000 .. 1.000
export function formatRatio(value, decimals = 3) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(decimals)
}

export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function truncate(str, len = 90) {
  if (!str) return ''
  const s = String(str)
  return s.length > len ? s.slice(0, len - 1) + '…' : s
}
