import QaPanel from '../QaPanel'

export default function AskPage({ onSelect }) {
  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <QaPanel onSelect={onSelect} />
    </div>
  )
}
