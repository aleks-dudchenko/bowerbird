// Tag counts come from the search hook's facets so the rail and the
// result set can never disagree about what exists.
export default function FilterRail({ facets, active, onToggle }) {
  if (!facets.tags.length) return null

  return (
    <div className="rail">
      {facets.tags.map(([tag, count]) => (
        <button
          key={tag}
          className={`tag ${active.has(tag) ? 'is-active' : ''}`}
          onClick={() => onToggle(tag)}
        >
          {tag} <em>{count}</em>
        </button>
      ))}
    </div>
  )
}
