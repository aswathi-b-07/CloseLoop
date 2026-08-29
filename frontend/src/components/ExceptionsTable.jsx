import { useMemo, useState } from 'react'
import { ExceptionBadge, TierBadge, ConfidenceBar, LoadingPanel, ErrorPanel, EmptyPanel } from './ui'
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Exceptions</h2>
          <p className="text-xs text-slate-400">
            {data?.count != null ? `${data.count} flagged` : 'Flagged for review'} · click a row for the evidence
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input py-1.5"
          >
            {types.map((t) => (
              <option key={t} value={t} className="bg-ink-850">
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
      </div>

      {loading && !data ? (
        <LoadingPanel label="Loading exceptions…" />
      ) : error ? (
        <ErrorPanel error={error} onRetry={onRetry} />
      ) : filtered.length === 0 ? (
        <EmptyPanel label={rows.length === 0 ? 'No exceptions in this run.' : 'No rows match your filter.'} />
      ) : (
        <div className="max-h-[520px] overflow-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-ink-850/95 backdrop-blur">
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
                  className="cursor-pointer border-t border-white/5 transition-colors hover:bg-accent/[0.06]"
                >
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs font-medium text-slate-200">{r.entity_id}</span>
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
                  <td className="px-3 py-2.5 text-slate-400" title={r.reason || ''}>
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
