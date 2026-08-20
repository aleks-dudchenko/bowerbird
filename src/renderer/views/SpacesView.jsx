import { useCallback, useEffect, useState } from 'react'
import Canvas from '../components/Canvas.jsx'
import Tray from '../components/Tray.jsx'

const api = window.bowerbird

export default function SpacesView({
  items, byId, space, spaces, onOpen, onCreate, onRemoveSpace, onRename,
  onAddItems, onMove, onRemoveNodes, onBringToFront, onDropFiles, onFocusItem,
}) {
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set())
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  // Viewport lives in settings rather than the space file: a pan gesture
  // should not create a revision of a file sitting in Dropbox.
  useEffect(() => {
    if (!space) return
    setSelectedNodeIds(new Set())
    api.getSettings(['viewports']).then(({ viewports }) => {
      setViewport(viewports?.[space.id] || { x: 0, y: 0, zoom: 1 })
    })
  }, [space?.id])

  // The detail panel is shared with the library view, so selecting a node
  // has to drive it. Without this the panel keeps showing whatever was
  // last picked in the grid, which reads as a bug.
  const selectNodes = useCallback(
    (next) => {
      setSelectedNodeIds(next)
      if (next.size === 1) {
        const nodeId = [...next][0]
        onFocusItem(space?.nodes.find((n) => n.nodeId === nodeId)?.itemId ?? null)
      } else {
        onFocusItem(null)
      }
    },
    [space, onFocusItem]
  )

  const persistViewport = useCallback(
    async (next) => {
      setViewport(next)
      if (!space) return
      const { viewports } = await api.getSettings(['viewports'])
      api.patchSettings({ viewports: { ...(viewports || {}), [space.id]: next } })
    },
    [space?.id]
  )

  const filtered = query.trim()
    ? items.filter((i) => {
        const hay = `${i.title} ${(i.tags || []).join(' ')}`.toLowerCase()
        return hay.includes(query.trim().toLowerCase())
      })
    : items

  const handleDrop = useCallback(
    (e, at) => {
      // Two kinds of drop land here: files from Finder, and an item
      // dragged up out of the tray.
      const itemId = e.dataTransfer.getData('application/x-bowerbird-item')
      if (itemId) {
        const item = byId.get(itemId)
        if (item) onAddItems([item], at)
        return
      }
      const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean)
      if (paths.length) onDropFiles(paths, at)
    },
    [byId, onAddItems, onDropFiles]
  )

  if (!space) {
    return (
      <main className="empty">
        <div className="empty-inner">
          <h1>{spaces.length ? 'Open a space' : 'No spaces yet'}</h1>
          <p>
            A space is a board: drag references onto an endless canvas and
            arrange them. Each one is a plain JSON file in your library folder.
          </p>
          <div className="space-list">
            {spaces.map((s) => (
              <button key={s.id} className="space-card" onClick={() => onOpen(s.id)}>
                <strong>{s.name}</strong>
                <span>{s.nodeCount} items</span>
              </button>
            ))}
          </div>
          <button className="primary" onClick={() => onCreate('Untitled')}>New space</button>
        </div>
      </main>
    )
  }

  return (
    <div className="spaces">
      <div className="space-bar">
        <input
          className="space-name"
          value={space.name}
          onChange={(e) => onRename(e.target.value)}
        />
        <span className="count">{space.nodes.length}</span>
        <div className="spacer" />
        <select
          className="space-switch"
          value={space.id}
          onChange={(e) => onOpen(e.target.value)}
        >
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button className="ghost" onClick={() => onCreate('Untitled')}>New</button>
        <button className="danger" onClick={() => onRemoveSpace(space.id)}>Delete space</button>
      </div>

      <Canvas
        nodes={space.nodes}
        byId={byId}
        selectedNodeIds={selectedNodeIds}
        onSelect={selectNodes}
        onMove={onMove}
        onRemove={onRemoveNodes}
        onBringToFront={onBringToFront}
        onDropFiles={handleDrop}
        viewport={viewport}
        onViewportChange={persistViewport}
      />

      <Tray
        items={filtered}
        query={query}
        onQuery={setQuery}
        onAdd={(list) => onAddItems(list, { x: -viewport.x / viewport.zoom + 80, y: -viewport.y / viewport.zoom + 80 })}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
    </div>
  )
}
