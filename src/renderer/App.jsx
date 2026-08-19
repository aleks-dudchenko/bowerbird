import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLibrary } from './useLibrary.js'
import { useSpace } from './useSpace.js'
import { useDropTarget } from './useDropTarget.js'
import TitleBar from './components/TitleBar.jsx'
import DetailPanel from './components/DetailPanel.jsx'
import Toast from './components/Toast.jsx'
import Settings from './components/Settings.jsx'
import LibraryView from './views/LibraryView.jsx'
import SpacesView from './views/SpacesView.jsx'

const api = window.zbirka

// Shell only: which mode is showing, what is selected, and the drop
// target shared by both views. All library state lives in useLibrary,
// all board state in useSpace.
export default function App() {
  const [mode, setMode] = useState('library')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [toast, setToast] = useState(null)
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)

  const showToast = useCallback((message, action) => setToast({ message, action }), [])

  const lib = useLibrary({ onToast: showToast })
  const space = useSpace(lib.root)

  useEffect(() => {
    api.getSettings(['mode']).then(({ mode: saved }) => saved && setMode(saved))
  }, [])

  const changeMode = useCallback((next) => {
    setMode(next)
    setSelectedIds(new Set())
    api.patchSettings({ mode: next })
  }, [])

  const focusItem = useCallback(
    (itemId) => setSelectedIds(itemId ? new Set([itemId]) : new Set()),
    []
  )

  // Selection is a set of ids, not a copy of an item. The canvas needs
  // multi-select and both views share the panel, so holding a stale
  // object here would mean reconciling it by hand in two places.
  const focused = useMemo(() => {
    if (selectedIds.size !== 1) return null
    return lib.byId.get([...selectedIds][0]) ?? null
  }, [selectedIds, lib.byId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return lib.items.filter((i) => {
      if (activeTags.size && ![...activeTags].every((t) => (i.tags || []).includes(t))) return false
      if (!q) return true
      return `${i.title} ${(i.tags || []).join(' ')}`.toLowerCase().includes(q)
    })
  }, [lib.items, query, activeTags])

  const { dragging, handlers } = useDropTarget(
    useCallback((paths) => lib.addPaths(paths), [lib])
  )

  // Dropping straight onto the canvas imports and places in one gesture,
  // which is the whole workflow when you are gathering a board.
  const dropOntoCanvas = useCallback(
    async (paths, at) => {
      const added = await lib.addPaths(paths)
      if (added.length) space.addItems(added, at)
    },
    [lib, space]
  )

  const addSelectionToSpace = useCallback(() => {
    const chosen = [...selectedIds].map((id) => lib.byId.get(id)).filter(Boolean)
    if (!chosen.length || !space.space) return
    space.addItems(chosen, { x: 0, y: 0 })
    showToast(`Added ${chosen.length} to “${space.space.name}”`)
    changeMode('spaces')
  }, [selectedIds, lib.byId, space, showToast, changeMode])

  const toggleTag = useCallback((tag) => {
    setActiveTags((prev) => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedIds(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (lib.loading) return <div className="app" />

  return (
    <div className={`app ${focused ? 'has-detail' : ''} ${dragging ? 'is-dragging' : ''}`} {...handlers}>
      <TitleBar
        root={lib.root}
        count={lib.items.length}
        mode={mode}
        onMode={changeMode}
        progress={lib.progress}
        onChooseLibrary={lib.chooseLibrary}
        onAddFiles={lib.addViaDialog}
        onSettings={() => setSettingsOpen(true)}
      />

      {mode === 'library' ? (
        <LibraryView
          root={lib.root}
          items={filtered}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onChooseLibrary={lib.chooseLibrary}
          onAddFiles={lib.addViaDialog}
          query={query}
          onQuery={setQuery}
          activeTags={activeTags}
          onToggleTag={toggleTag}
          onAddToSpace={addSelectionToSpace}
          hasSpace={!!space.space}
        />
      ) : (
        <SpacesView
          root={lib.root}
          items={lib.items}
          byId={lib.byId}
          space={space.space}
          spaces={space.spaces}
          onOpen={space.open}
          onCreate={space.create}
          onRemoveSpace={space.remove}
          onRename={space.rename}
          onAddItems={space.addItems}
          onMove={space.moveNodes}
          onRemoveNodes={space.removeNodes}
          onBringToFront={space.bringToFront}
          onDropFiles={dropOntoCanvas}
          onFocusItem={focusItem}
        />
      )}

      {focused && (
        <DetailPanel
          item={focused}
          onClose={() => setSelectedIds(new Set())}
          onUpdate={lib.updateItem}
          onTrash={(item) => {
            lib.trashItems([item])
            setSelectedIds(new Set())
          }}
        />
      )}

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {dragging && <div className="dropveil">Drop to add</div>}
    </div>
  )
}
