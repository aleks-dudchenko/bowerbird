import Grid from '../components/Grid.jsx'
import FilterRail from '../components/FilterRail.jsx'

export default function LibraryView({
  root, items, selectedIds, onSelect, onChooseLibrary, onAddFiles,
  query, onQuery, activeTags, onToggleTag, onAddToSpace, hasSpace,
}) {
  if (!root) {
    return (
      <main className="empty">
        <div className="empty-inner">
          <h1>Choose a library folder</h1>
          <p>
            Files are stored there as plain files, each with a sidecar holding
            its tags. Put the folder in Dropbox or iCloud if you want it synced.
          </p>
          <button className="primary" onClick={onChooseLibrary}>Choose folder</button>
        </div>
      </main>
    )
  }

  return (
    <div className="library">
      <div className="library-bar">
        <input
          className="search"
          value={query}
          placeholder="Filter by name or tag"
          onChange={(e) => onQuery(e.target.value)}
        />
        {selectedIds.size > 0 && (
          <button className="primary small" disabled={!hasSpace} onClick={onAddToSpace}>
            Add {selectedIds.size} to space
          </button>
        )}
      </div>

      <FilterRail items={items} active={activeTags} onToggle={onToggleTag} />

      {items.length === 0 ? (
        <main className="empty">
          <div className="empty-inner">
            <h1>Nothing here</h1>
            <p>Drop images or video anywhere in the window, or use Add files.</p>
            <button className="primary" onClick={onAddFiles}>Add files…</button>
            <span className="hint">
              PNG · JPG · WEBP · GIF · AVIF · TIFF · SVG · MP4 · MOV · WEBM
            </span>
          </div>
        </main>
      ) : (
        <Grid items={items} selectedIds={selectedIds} onSelect={onSelect} />
      )}
    </div>
  )
}
