import { useMemo, useState } from 'react'
import { CardHeader, ExceptionBadge, TierBadge, ConfidenceBar, LoadingPanel, ErrorPanel, EmptyPanel } from './ui'
import { exceptionMeta } from '../lib/taxonomy'
import { truncate } from '../lib/format'

export default function ExceptionsTable({ data, loading, error, onRetry, onSelect }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')

  const rows = data?.exceptions || []

  const types = useMemo(() => {
    const set = new Set()
    rows.forEach((r) => r.predicted_exception && set.add(r.predicted_exception))
    return ['ALL', ...Array.from(set)]
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (typeFilter !== 'ALL' && r.predicted_exception !== typeFilter) return false
      if (!q) return true
      return (
        String(r.entity_id || '').toLowerCase().includes(q) ||
        String(r.predicted_exception || '').toLowerCase().includes(q) ||
        String(r.reason || '').toLowerCase().includes(q)
      )
    })
  }, [rows, query, typeFilter])

  return (
    <section className="card card-pad">
      <CardHeader
        icon={
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.86l-8.5 14.7A2 2 0 003.5 21.5h17a2 2 0 001.7-3L13.7 3.86a2 2 0 00-3.4 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
          </svg>
        }
        title="Exceptions"
        subtitle={`${data?.count != null ? `${data.count} flagged` : 'Flagged for review'} · click a row for the evidence`}
        right={
          <div className="flex items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input py-1.5"
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t === 'ALL' ? 'All types' : exceptionMeta(t).label}
                </option>
              ))}
            </select>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="input py-1.5"
            />
          </div>
        }
      />

      {loading && !data ? (
        <LoadingPanel label="Loading exceptions…" />
      ) : error ? (
        <ErrorPanel error={error} onRetry={onRetry} />
      ) : filtered.length === 0 ? (
        <EmptyPanel label={rows.length === 0 ? 'No exceptions in this run.' : 'No rows match your filter.'} />
      ) : (
        <div className="max-h-[520px] overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
              <tr className="text-left text-xs text-slate-500">
                <th className="px-3 py-2.5 font-medium">Entity</th>
                <th className="px-3 py-2.5 font-medium">Exception</th>
                <th className="px-3 py-2.5 font-medium">Tier</th>
                <th className="px-3 py-2.5 font-medium">Confidence</th>
                <th className="px-3 py-2.5 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={`${r.entity_id}-${i}`}
                  onClick={() => onSelect?.(r.entity_id)}
                  className="cursor-pointer border-t border-line transition-colors hover:bg-rzp-tint"
                >
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs font-semibold text-navy-800">{r.entity_id}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <ExceptionBadge type={r.predicted_exception} />
                  </td>
                  <td className="px-3 py-2.5">
                    <TierBadge tier={r.tier} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ConfidenceBar value={r.confidence} />
                  </td>
                  <td className="px-3 py-2.5 text-slate-500" title={r.reason || ''}>
                    {truncate(r.reason, 80) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
