import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { ExceptionBadge, TierBadge, ConfidenceBar, LoadingPanel, ErrorPanel } from './ui'
import { formatINR, formatDateTime } from '../lib/format'

function Field({ label, value, mono }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`truncate text-sm text-slate-200 ${mono ? 'font-mono text-xs' : ''}`} title={String(value ?? '')}>
        {value ?? '—'}
      </dd>
    </div>
  )
}

function RecordCard({ children }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</dl>
    </div>
  )
}

function SectionHeader({ title, count }) {
  return (
    <div className="mb-2 mt-6 flex items-center gap-2 first:mt-0">
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      {count != null && (
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">{count}</span>
      )}
    </div>
  )
}

function asArray(v) {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

export default function EntityDrawer({ entityId, onClose, onSelect }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!entityId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    api
      .entity(entityId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [entityId, reloadKey])

  // Close on Escape
  useEffect(() => {
    if (!entityId) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entityId, onClose])

  if (!entityId) return null

  const orders = asArray(data?.order)
  const payments = asArray(data?.payments)
  const bankRows = asArray(data?.bank_rows)
  const findings = asArray(data?.finding)
  const audit = asArray(data?.audit_trail)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside className="relative flex h-full w-full max-w-2xl animate-slide-in flex-col border-l border-white/10 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="section-title">Entity drill-down</p>
            <h3 className="font-mono text-lg font-semibold text-white">{entityId}</h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <LoadingPanel label="Loading evidence…" />
          ) : error ? (
            <ErrorPanel error={error} onRetry={() => setReloadKey((k) => k + 1)} />
          ) : (
            <>
              {/* Finding summary */}
              {findings.length > 0 && (
                <>
                  <SectionHeader title="Finding" />
                  {findings.map((f, i) => (
                    <div key={i} className="rounded-xl border border-accent/20 bg-accent/[0.04] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <ExceptionBadge type={f.predicted_exception} />
                        <TierBadge tier={f.tier} />
                        <span className="ml-auto">
                          <ConfidenceBar value={f.confidence} />
                        </span>
                      </div>
                      {f.predicted_status && (
                        <p className="mt-3 text-xs text-slate-400">
                          Status: <span className="text-slate-200">{f.predicted_status}</span>
                        </p>
                      )}
                      {f.reason && <p className="mt-2 text-sm leading-relaxed text-slate-300">{f.reason}</p>}
                    </div>
                  ))}
                </>
              )}

              {/* Order */}
              <SectionHeader title="Order" count={orders.length} />
              {orders.length === 0 ? (
                <p className="text-sm text-slate-500">No order record.</p>
              ) : (
                <div className="space-y-3">
                  {orders.map((o, i) => (
                    <RecordCard key={i}>
                      <Field label="Order ID" value={o.order_id} mono />
                      <Field label="Amount" value={formatINR(o.amount)} />
                      <Field label="Currency" value={o.currency} />
                      <Field label="Method" value={o.method} />
                      <Field label="Status" value={o.status} />
                      <Field label="Created" value={formatDateTime(o.created_at)} />
                    </RecordCard>
                  ))}
                </div>
              )}

              {/* Payments */}
              <SectionHeader title="Payments" count={payments.length} />
              {payments.length === 0 ? (
                <p className="text-sm text-slate-500">No payment records.</p>
              ) : (
                <div className="space-y-3">
                  {payments.map((p, i) => (
                    <RecordCard key={i}>
                      <Field label="Payment ID" value={p.payment_id} mono />
                      <Field label="Amount" value={formatINR(p.amount)} />
                      <Field label="Fee" value={formatINR(p.fee)} />
                      <Field label="Tax" value={formatINR(p.tax)} />
                      <Field label="Net" value={formatINR(p.net_amount)} />
                      <Field label="Method" value={p.method} />
                      <Field label="Status" value={p.status} />
                      <Field label="Settlement" value={p.settlement_id} mono />
                      <Field label="Settled at" value={formatDateTime(p.settled_at)} />
                    </RecordCard>
                  ))}
                </div>
              )}

              {/* Bank rows */}
              <SectionHeader title="Bank statement rows" count={bankRows.length} />
              {bankRows.length === 0 ? (
                <p className="text-sm text-slate-500">No matching bank rows.</p>
              ) : (
                <div className="space-y-3">
                  {bankRows.map((b, i) => (
                    <RecordCard key={i}>
                      <Field label="Bank Txn ID" value={b.bank_txn_id} mono />
                      <Field label="UTR" value={b.utr} mono />
                      <Field label="Amount" value={formatINR(b.amount)} />
                      <Field label="Value date" value={formatDateTime(b.value_date)} />
                      <Field label="Settlement ref" value={b.settlement_ref} mono />
                      <Field label="Narration" value={b.narration} />
                    </RecordCard>
                  ))}
                </div>
              )}

              {/* Audit trail timeline */}
              <SectionHeader title="Audit trail" count={audit.length} />
              {audit.length === 0 ? (
                <p className="text-sm text-slate-500">No audit entries.</p>
              ) : (
                <ol className="relative ml-2 border-l border-white/10 pl-5">
                  {audit.map((a, i) => (
                    <li key={i} className="relative mb-5 last:mb-0">
                      <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-ink-900 bg-accent" />
                      <div className="flex flex-wrap items-center gap-2">
                        <TierBadge tier={a.tier} />
                        <ExceptionBadge type={a.predicted_exception} />
                        <span className="text-xs text-slate-500">{formatDateTime(a.logged_at)}</span>
                      </div>
                      {a.confidence != null && (
                        <div className="mt-2">
                          <ConfidenceBar value={a.confidence} />
                        </div>
                      )}
                      {a.reason && <p className="mt-1.5 text-sm text-slate-300">{a.reason}</p>}
                      {a.evidence && (
                        <pre className="mt-2 overflow-x-auto rounded-lg border border-white/5 bg-black/30 p-3 text-[11px] leading-relaxed text-slate-400">
                          {typeof a.evidence === 'string' ? a.evidence : JSON.stringify(a.evidence, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
