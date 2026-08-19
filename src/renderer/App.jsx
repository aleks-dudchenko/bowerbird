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
    if (skipped) console.warn(`пропущено файлів (формат): ${skipped}`)
  }

  // Escape знімає вибір — очікувана поведінка панелі деталей.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Лічильник глибини: dragleave стріляє на кожному вкладеному елементі,
  // без нього підсвітка блимає під час руху курсора над сіткою.
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
              Змінити папку
            </button>
          </>
        )}
      </header>

      {!root ? (
        <main className="empty">
          <div className="empty-inner">
            <h1>Оберіть папку бібліотеки</h1>
            <p>
              Файли зберігатимуться там звичайними файлами, поряд із кожним —
              сайдкар із тегами. Папку можна покласти в Dropbox чи iCloud.
            </p>
            <button className="primary" onClick={chooseLibrary}>
              Обрати папку
            </button>
          </div>
        </main>
      ) : items.length === 0 ? (
        <main className="empty">
          <div className="empty-inner">
            <h1>Бібліотека порожня</h1>
            <p>Перетягни сюди зображення — вони скопіюються в папку бібліотеки.</p>
            <span className="hint">PNG · JPG · WEBP · GIF · AVIF · TIFF · SVG</span>
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

      {dragging && <div className="dropveil">Відпусти, щоб додати</div>}
    </div>
  )
}
