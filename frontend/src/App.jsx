import { useCallback, useEffect, useState } from 'react'
import { api } from './lib/api'
import Header from './components/Header'
import KpiCards from './components/KpiCards'
import AccuracyPanel from './components/AccuracyPanel'
import TierUsage from './components/TierUsage'
import ExceptionsTable from './components/ExceptionsTable'
import EntityDrawer from './components/EntityDrawer'
import QaPanel from './components/QaPanel'
import ErrorAnalysis from './components/ErrorAnalysis'
import { ErrorPanel } from './components/ui'

export default function App() {
  const [health, setHealth] = useState(null)

  const [seed, setSeed] = useState(1337)
  const [useLlm, setUseLlm] = useState(true)

  const [metrics, setMetrics] = useState(null)
  const [exceptions, setExceptions] = useState(null)
  const [runId, setRunId] = useState(null)

  const [running, setRunning] = useState(false)
  const [fatalError, setFatalError] = useState(null)
  const [exceptionsError, setExceptionsError] = useState(null)

  const [selectedEntity, setSelectedEntity] = useState(null)

  // Health check on mount
  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  const loadExceptions = useCallback(async () => {
    setExceptionsError(null)
    try {
      const ex = await api.exceptions()
      setExceptions(ex)
    } catch (e) {
      setExceptionsError(e)
    }
  }, [])

  const runReconcile = useCallback(async () => {
    setRunning(true)
    setFatalError(null)
    try {
      const res = await api.reconcile({
        seed: Number(seed) || 1337,
        n_orders: 150,
        exception_rate: 0.3,
        use_llm: useLlm,
      })
      setMetrics(res.metrics || null)
      setRunId(res.run_id || res.metrics?.run_id || null)
      // refresh health (llm_configured may change with use_llm) and exceptions
      api.health().then(setHealth).catch(() => {})
      await loadExceptions()
    } catch (e) {
      setFatalError(e)
    } finally {
      setRunning(false)
    }
  }, [seed, useLlm, loadExceptions])

  // Auto-run once on first load
  useEffect(() => {
    runReconcile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loading = running

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Header
          health={health}
          seed={seed}
          setSeed={setSeed}
          useLlm={useLlm}
          setUseLlm={setUseLlm}
          onRun={runReconcile}
          running={running}
          runId={runId}
        />

        {fatalError && !metrics ? (
          <div className="mt-10">
            <ErrorPanel error={fatalError} onRetry={runReconcile} />
          </div>
        ) : (
          <main className="space-y-6 animate-fade-in">
            {fatalError && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
                Last run failed: {fatalError.message}. Showing previous results.
              </div>
            )}

            {/* KPI hero row */}
            <KpiCards metrics={metrics} loading={loading} />

            {/* Accuracy + Tier usage */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <AccuracyPanel metrics={metrics} loading={loading} />
              </div>
              <div className="lg:col-span-1">
                <TierUsage metrics={metrics} loading={loading} />
              </div>
            </div>

            {/* Exceptions table */}
            <ExceptionsTable
              data={exceptions}
              loading={loading}
              error={exceptionsError}
              onRetry={loadExceptions}
              onSelect={setSelectedEntity}
            />

            {/* Q&A + Error analysis */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <QaPanel onSelect={setSelectedEntity} />
              <ErrorAnalysis metrics={metrics} loading={loading} onSelect={setSelectedEntity} />
            </div>

            <footer className="pt-2 text-center text-xs text-slate-600">
              CloseLoop — AI Finance Controller · Razorpay AI Buildathon demo
            </footer>
          </main>
        )}
      </div>

      <EntityDrawer
        entityId={selectedEntity}
        onClose={() => setSelectedEntity(null)}
        onSelect={setSelectedEntity}
      />
    </div>
  )
}
