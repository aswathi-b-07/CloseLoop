import ExceptionsTable from '../ExceptionsTable'

export default function ExceptionsPage({ exceptions, loading, error, onRetry, onSelect }) {
  return (
    <div className="animate-fade-in">
      <ExceptionsTable
        data={exceptions}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onSelect={onSelect}
      />
    </div>
  )
}
