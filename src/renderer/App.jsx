import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLibrary } from './useLibrary.js'
import { useSpace } from './useSpace.js'
import { useDropTarget } from './useDropTarget.js'
import { useSearch } from './useSearch.js'
import { useGridKeys } from './useGridKeys.js'
import TitleBar from './components/TitleBar.jsx'
import DetailPanel from './components/DetailPanel.jsx'
import Toast from './components/Toast.jsx'
import Settings from './components/Settings.jsx'
import LibraryView from './views/LibraryView.jsx'
import SpacesView from './views/SpacesView.jsx'
import TrashView from './views/TrashView.jsx'

const api = window.zbirka

// Shell only: which mode is showing, what is selected, and the drop
// target shared by every view. Library state lives in useLibrary, board
// state in useSpace, query state in useSearch.
export default function App() {
  const [mode, setMode] = useState('library')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [toast, setToast] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const searchRef = useRef(null)

  const showToast = useCallback((message, action) => setToast({ message, action }), [])

  const lib = useLibrary({ onToast: showToast })
  const space = useSpace(lib.root)
  const s = useSearch(lib.items)

  useEffect(() => {
    api.getSettings(['mode']).then(({ mode: saved }) => saved && setMode(saved))
  }, [])

  // Menu commands arrive as events so the main process does not need its
  // own copy of what these actions mean.
  useEffect(
    () =>
      api.onEvent((e) => {
        if (e.type === 'menu:settings') setSettingsOpen(true)
        if (e.type === 'menu:addFiles') lib.addViaDialog()
        if (e.type === 'menu:chooseLibrary') lib.chooseLibrary()
        if (e.type === 'menu:newSpace') {
          space.create('Untitled')
          setMode('spaces')
        }
      }),
    [lib, space]
  )

  const changeMode = useCallback((next) => {
    setMode(next)
    setSelectedIds(new Set())
    if (next !== 'trash') api.patchSettings({ mode: next })
  }, [])

  const focusItem = useCallback(
    (itemId) => setSelectedIds(itemId ? new Set([itemId]) : new Set()),
    []
  )

  // Selection is a set of ids, not a copy of an item: the canvas needs
  // multi-select and both views share the detail panel.
  const focused = useMemo(() => {
    if (selectedIds.size !== 1) return null
    return lib.byId.get([...selectedIds][0]) ?? null
  }, [selectedIds, lib.byId])

  const { dragging, handlers } = useDropTarget(
    useCallback((paths) => lib.addPaths(paths), [lib])
  )

  // Dropping onto the canvas imports and places in one gesture, which is
  // the whole workflow when you are gathering a board.
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

  const toggleFavourite = useCallback(
    (item) => lib.updateItem(item, { favourite: !item.favourite }),
    [lib]
  )

  useGridKeys({
    enabled: mode === 'library' && !settingsOpen,
    items: s.results,
    focusedId: selectedIds.size === 1 ? [...selectedIds][0] : null,
    onFocus: focusItem,
    onOpenSearch: () => searchRef.current?.focus(),
    onFavourite: toggleFavourite,
    onTag: () => document.querySelector('.detail input')?.focus(),
    onTrash: (item) => lib.trashItems([item]),
  })

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSettingsOpen(false)
        setSelectedIds(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (lib.loading) return <div className="app" />

  return (
    <div
      className={`app ${focused ? 'has-detail' : ''} ${dragging ? 'is-dragging' : ''}`}
      {...handlers}
    >
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

      {mode === 'trash' ? (
        <TrashView
          items={lib.trashed}
          onRestore={lib.restoreItems}
          onPurge={lib.purgeItems}
          onBack={() => changeMode('library')}
        />
      ) : mode === 'library' ? (
        <LibraryView
          root={lib.root}
          s={s}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onChooseLibrary={lib.chooseLibrary}
          onAddFiles={lib.addViaDialog}
          onAddToSpace={addSelectionToSpace}
          hasSpace={!!space.space}
          searchRef={searchRef}
          trashCount={lib.trashed.length}
          onOpenTrash={() => changeMode('trash')}
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
