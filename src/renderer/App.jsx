import { useCallback, useEffect, useRef, useState } from 'react'
import Grid from './components/Grid.jsx'
import DetailPanel from './components/DetailPanel.jsx'

const api = window.zbirka

export default function App() {
  const [root, setRoot] = useState(null)
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const dragDepth = useRef(0)

  const refresh = useCallback(async (dir) => {
    if (!dir) return
    setItems(await api.loadLibrary(dir))
  }, [])

  useEffect(() => {
    ;(async () => {
      const current = await api.currentLibrary()
      setRoot(current)
      await refresh(current)
      setLoading(false)
    })()
    return api.onProgress(setProgress)
  }, [refresh])

  async function chooseLibrary() {
    const dir = await api.chooseLibrary()
    if (!dir) return
    setRoot(dir)
    setSelected(null)
    await refresh(dir)
  }

  async function addPaths(paths) {
    if (!root || !paths.length) return
    setProgress({ done: 0, total: paths.length })
    const { added, skipped } = await api.addItems(root, paths)
    setProgress(null)
    if (added.length) await refresh(root)
    if (skipped) console.warn(`skipped, unsupported format: ${skipped}`)
  }

  // Escape clears the selection — expected behaviour for a detail panel.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Depth counter: dragleave fires for every nested element, and without
  // it the highlight flickers as the cursor moves across the grid.
  const onDragEnter = (e) => {
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }
  const onDragLeave = () => {
    dragDepth.current -= 1
    if (dragDepth.current <= 0) setDragging(false)
  }
  const onDrop = (e) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean)
    addPaths(paths)
  }

  async function handleUpdate(item, patch) {
    const next = await api.updateItem(item, patch)
    const merged = { ...item, ...next }
    setItems((prev) => prev.map((i) => (i.id === item.id ? merged : i)))
    setSelected(merged)
  }

  async function handleRemove(item) {
    await api.removeItem(item)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    setSelected(null)
  }

  if (loading) return <div className="app" />

  return (
    <div
      className={`app ${dragging ? 'is-dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="titlebar">
        <span className="wordmark">Zbirka</span>
        {root && (
          <>
            <button className="path" onClick={() => api.revealLibrary(root)} title={root}>
              {root.split('/').pop()}
            </button>
            <span className="count">{items.length}</span>
            <div className="spacer" />
            {progress && (
              <span className="progress">
                {progress.done} / {progress.total}
              </span>
            )}
            <button className="ghost" onClick={chooseLibrary}>
              Change folder
            </button>
          </>
        )}
      </header>

      {!root ? (
        <main className="empty">
          <div className="empty-inner">
            <h1>Choose a library folder</h1>
            <p>
              Files are stored there as plain files, each with a sidecar holding
              its tags. Put the folder in Dropbox or iCloud if you want it synced.
            </p>
            <button className="primary" onClick={chooseLibrary}>
              Choose folder
            </button>
          </div>
        </main>
      ) : items.length === 0 ? (
        <main className="empty">
          <div className="empty-inner">
            <h1>Library is empty</h1>
            <p>Drop images or video here — they are copied into the library folder.</p>
            <span className="hint">PNG · JPG · WEBP · GIF · AVIF · TIFF · SVG · MP4 · MOV · WEBM</span>
          </div>
        </main>
      ) : (
        <Grid items={items} selected={selected} onSelect={setSelected} />
      )}

      {selected && (
        <DetailPanel
          item={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
        />
      )}

      {dragging && <div className="dropveil">Drop to add</div>}
    </div>
  )
}
