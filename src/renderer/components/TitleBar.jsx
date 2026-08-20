import { IconButton } from './Icon.jsx'

const api = window.bowerbird

export default function TitleBar({
  root, count, mode, onMode, progress, onChooseLibrary, onAddFiles, onSettings,
}) {
  return (
    <header className="titlebar">
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

          <button
            className="path"
            onClick={() => api.revealLibrary(root)}
            data-tip="Show this folder in Finder"
          >
            {root.split('/').pop()}
          </button>
          <span className="count">{count}</span>

          <div className="spacer" />

          {progress && (
            <span className="progress">
              {progress.done} / {progress.total}
            </span>
          )}
          <IconButton icon="plus" tip="Add files" onClick={onAddFiles} />
          <IconButton icon="folder" tip="Change library folder" onClick={onChooseLibrary} />
          <IconButton icon="gear" tip="Settings" align="right" onClick={onSettings} />
        </>
      )}
    </header>
  )
}
