import SearchBar from '../components/SearchBar.jsx'
import Grid from '../components/Grid.jsx'
import FilterRail from '../components/FilterRail.jsx'

export default function LibraryView({
  root, s, total, selectedIds, onSelect, onChooseLibrary, onAddFiles,
  onAddToSpace, hasSpace, searchRef, trashCount, onOpenTrash,
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
      <SearchBar
        ref={searchRef}
        s={s}
        count={s.results.length}
        total={total}
        selectionSize={selectedIds.size}
        hasSpace={hasSpace}
        onAddToSpace={onAddToSpace}
      />

      <FilterRail facets={s.facets} active={s.tags} onToggle={s.toggleTag} />

      {s.results.length === 0 ? (
        <main className="empty">
          <div className="empty-inner">
            <h1>{s.active ? 'Nothing matches' : 'Library is empty'}</h1>
            <p>
              {s.active
                ? 'Try fewer words, or clear the filters.'
                : 'Drop images or video anywhere in the window, or use Add files.'}
            </p>
            {s.active
              ? <button className="primary" onClick={s.clear}>Clear filters</button>
              : <button className="primary" onClick={onAddFiles}>Add files…</button>}
            {!s.active && (
              <span className="hint">
                PNG · JPG · WEBP · GIF · AVIF · TIFF · SVG · MP4 · MOV · WEBM
              </span>
            )}
          </div>
        </main>
      ) : (
        <Grid items={s.results} selectedIds={selectedIds} onSelect={onSelect} />
      )}

      {trashCount > 0 && (
        <button className="trash-tab" onClick={onOpenTrash}>
          Trash · {trashCount}
        </button>
      )}
    </div>
  )
}
