const api = window.bowerbird

export default function TitleBar({
  root, count, mode, onMode, progress, onChooseLibrary, onAddFiles, onSettings,
}) {
  return (
    <header className="titlebar">
      <span className="wordmark">Bowerbird</span>

      {root && (
        <>
          <div className="modes">
            <button
              className={mode === 'library' ? 'is-active' : ''}
              onClick={() => onMode('library')}
            >
              Library
            </button>
            <button
              className={mode === 'spaces' ? 'is-active' : ''}
              onClick={() => onMode('spaces')}
            >
              Spaces
            </button>
          </div>

          <button className="path" onClick={() => api.revealLibrary(root)} title={root}>
            {root.split('/').pop()}
          </button>
          <span className="count">{count}</span>

          <div className="spacer" />

          {progress && (
            <span className="progress">
              {progress.done} / {progress.total}
            </span>
          )}
          <button className="ghost" onClick={onAddFiles}>Add files…</button>
          <button className="ghost" onClick={onChooseLibrary}>Change folder</button>
          <button className="ghost" onClick={onSettings}>Settings</button>
        </>
      )}
    </header>
  )
}
