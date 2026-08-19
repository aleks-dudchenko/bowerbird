// Masonry via CSS columns: no library, no position maths. The trade-off
// is reading order — top-to-bottom per column rather than left-to-right.
// Shift-ranges are therefore defined by array index, which looks
// scattered on screen; that is the first real cost of this choice and it
// gets revisited when search brings keyboard navigation.
import { useRef } from 'react'

export const srcOf = (p) => `zb://local/${encodeURIComponent(p)}`

const formatDuration = (s) => {
  if (!s && s !== 0) return null
  const total = Math.round(s)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default function Grid({ items, selectedIds, onSelect }) {
  const anchor = useRef(null)

  function click(e, item, index) {
    if (e.shiftKey && anchor.current !== null) {
      const [from, to] = [anchor.current, index].sort((a, b) => a - b)
      const range = items.slice(from, to + 1).map((i) => i.id)
      onSelect(new Set(e.metaKey ? [...selectedIds, ...range] : range))
      return
    }
    anchor.current = index
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selectedIds)
      next.has(item.id) ? next.delete(item.id) : next.add(item.id)
      onSelect(next)
    } else {
      onSelect(new Set([item.id]))
    }
  }

  return (
    <main className="grid">
      {items.map((item, index) => {
        const duration = item.kind === 'video' ? formatDuration(item.duration) : null
        return (
          <button
            key={item.id}
            className={`card ${selectedIds.has(item.id) ? 'is-selected' : ''}`}
            onClick={(e) => click(e, item, index)}
            title={item.title}
          >
            <img
              src={srcOf(item.thumb)}
              alt={item.title}
              loading="lazy"
              decoding="async"
              // A thumbnail may be missing (SVG, exotic codec). Images can
              // fall back to the original; video cannot, so it gets a
              // placeholder block instead of a broken icon.
              onError={(e) => {
                const el = e.currentTarget
                if (el.dataset.fallback) return
                el.dataset.fallback = '1'
                if (item.kind === 'image') el.src = srcOf(item.path)
                else el.closest('.card')?.classList.add('is-noposter')
              }}
            />
            {item.kind === 'video' && (
              <span className="badge">
                <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
                  <path d="M2 1l6 4-6 4z" fill="currentColor" />
                </svg>
                {duration}
              </span>
            )}
          </button>
        )
      })}
    </main>
  )
}
