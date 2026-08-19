import { useState } from 'react'

// M0 — скелет. Тут поки лише каркас вікна і порожній стан.
// M1 замінить порожній стан на сітку бібліотеки.
export default function App() {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className={`app ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        // M1: приймання файлів, копіювання в бібліотеку, сайдкари.
        console.log('drop:', [...e.dataTransfer.files].map((f) => f.name))
      }}
    >
      <header className="titlebar">
        <span className="wordmark">Zbirka</span>
      </header>

      <main className="empty">
        <div className="empty-inner">
          <h1>Бібліотека порожня</h1>
          <p>
            Перетягни сюди зображення — вони збережуться на диск,
            поряд ляже сайдкар із тегами. Нічого не йде в хмару.
          </p>
          <span className="hint">M0 · скелет · далі M1 — бібліотека</span>
        </div>
      </main>
    </div>
  )
}
