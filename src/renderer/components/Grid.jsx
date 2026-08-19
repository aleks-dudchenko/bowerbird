// Masonry via CSS columns: no library, no position maths. The trade-off
// is reading order — top-to-bottom per column rather than left-to-right.
// Acceptable for a reference library; if it ever gets in the way, M3
// brings a virtualised grid with a real layout pass.
export const srcOf = (p) => `zb://local/${encodeURIComponent(p)}`

const formatDuration = (s) => {
  if (!s && s !== 0) return null
  const total = Math.round(s)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default function Grid({ items, selected, onSelect }) {
  return (
    <main className="grid">
      {items.map((item) => {
        const duration = item.kind === 'video' ? formatDuration(item.duration) : null
        return (
          <button
            key={item.id}
            className={`card ${selected?.id === item.id ? 'is-selected' : ''}`}
            onClick={() => onSelect(item)}
            title={item.title}
          >
            <img
              src={srcOf(item.thumb)}
              alt={item.title}
              loading="lazy"
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
