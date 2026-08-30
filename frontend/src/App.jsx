import { useCallback, useEffect, useState } from 'react'
import { api } from './lib/api'
import { DEFAULT_ROUTE, ROUTE_ORDER } from './lib/nav'
import { Sidebar, MobileNav } from './components/Sidebar'
import TopBar from './components/TopBar'
import OverviewPage from './components/pages/OverviewPage'
import AccuracyPage from './components/pages/AccuracyPage'
import ExceptionsPage from './components/pages/ExceptionsPage'
import AskPage from './components/pages/AskPage'
import EntityDrawer from './components/EntityDrawer'
import { ErrorPanel } from './components/ui'

// Tiny hash router — real URLs (#/accuracy), back/forward works, no dependency.
function useHashRoute() {
  const read = () => {
    const r = window.location.hash.replace(/^#\/?/, '')
    return ROUTE_ORDER.includes(r) ? r : DEFAULT_ROUTE
  }
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const navigate = useCallback((r) => {
    window.location.hash = `#/${r}`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])
  return [route, navigate]
}

export default function App() {
  const [route, navigate] = useHashRoute()

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

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [])

  const loadExceptions = useCallback(async () => {
    setExceptionsError(null)
    try {
      setExceptions(await api.exceptions())
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
      api.health().then(setHealth).catch(() => {})
      await loadExceptions()
    } catch (e) {
      setFatalError(e)
    } finally {
      setRunning(false)
    }
  }, [seed, useLlm, loadExceptions])

  useEffect(() => {
    runReconcile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loading = running

  const renderPage = () => {
    if (fatalError && !metrics) {
      return <ErrorPanel error={fatalError} onRetry={runReconcile} />
    }
    switch (route) {
      case 'accuracy':
        return <AccuracyPage metrics={metrics} loading={loading} onSelect={setSelectedEntity} />
      case 'exceptions':
        return (
          <ExceptionsPage
            exceptions={exceptions}
            loading={loading}
            error={exceptionsError}
            onRetry={loadExceptions}
            onSelect={setSelectedEntity}
          />
        )
      case 'ask':
        return <AskPage onSelect={setSelectedEntity} />
      default:
        return <OverviewPage metrics={metrics} loading={loading} />
    }
  }

  return (
    <div className="min-h-screen lg:pl-64">
      <Sidebar
        route={route}
        navigate={navigate}
        health={health}
        runId={runId}
        exceptionsCount={exceptions?.count}
      />
      <MobileNav route={route} navigate={navigate} exceptionsCount={exceptions?.count} />

      <TopBar
        route={route}
        seed={seed}
        setSeed={setSeed}
        useLlm={useLlm}
        setUseLlm={setUseLlm}
        onRun={runReconcile}
        running={running}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {fatalError && metrics && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Last run failed: {fatalError.message}. Showing previous results.
          </div>
        )}

        {renderPage()}

        <footer className="pt-8 text-center text-xs text-slate-400">
          CloseLoop — AI Finance Controller · Razorpay AI Buildathon demo
        </footer>
      </main>

      <EntityDrawer
        entityId={selectedEntity}
        onClose={() => setSelectedEntity(null)}
        onSelect={setSelectedEntity}
      />
    </div>
  )
}
