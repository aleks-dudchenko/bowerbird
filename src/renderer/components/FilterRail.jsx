import { useMemo } from 'react'

// Tag counts straight off the in-memory items array. This is most of the
// practical value of search for a library that is already being tagged,
// and it costs no backend at all.
export default function FilterRail({ items, active, onToggle }) {
  const tags = useMemo(() => {
    const counts = new Map()
    for (const i of items) for (const t of i.tags || []) counts.set(t, (counts.get(t) || 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [items])

  if (!tags.length) return null

  return (
    <div className="rail">
      {tags.map(([tag, count]) => (
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
