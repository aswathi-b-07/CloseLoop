import AccuracyPanel from '../AccuracyPanel'
import TierUsage from '../TierUsage'
import ErrorAnalysis from '../ErrorAnalysis'

export default function AccuracyPage({ metrics, loading, onSelect }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <AccuracyPanel metrics={metrics} loading={loading} />
      {/* Error analysis is the honest headline here — give it 2/3; tier usage
          is supporting context, so it takes the narrower 1/3 column. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ErrorAnalysis metrics={metrics} loading={loading} onSelect={onSelect} />
        </div>
        <div className="lg:col-span-1">
          <TierUsage metrics={metrics} loading={loading} />
        </div>
      </div>
    </div>
  )
}
