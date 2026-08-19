import { useEffect, useState } from 'react'
import { srcOf } from './Grid.jsx'

const api = window.zbirka

export default function DetailPanel({ item, onClose, onUpdate, onRemove }) {
  const [title, setTitle] = useState(item.title)
  const [note, setNote] = useState(item.note || '')
  const [tagDraft, setTagDraft] = useState('')

  // Переключення на інший айтем має перезаряджати поля, а не лишати
  // текст від попереднього.
  useEffect(() => {
    setTitle(item.title)
    setNote(item.note || '')
    setTagDraft('')
  }, [item.id])

  const commit = (patch) => onUpdate(item, patch)

  function addTag(e) {
    e.preventDefault()
    const tag = tagDraft.trim().toLowerCase()
    if (!tag || (item.tags || []).includes(tag)) return setTagDraft('')
    commit({ tags: [...(item.tags || []), tag] })
    setTagDraft('')
  }

  return (
    <aside className="detail">
      <div className="detail-head">
        <button className="ghost" onClick={onClose}>Закрити</button>
        <div className="spacer" />
        <button className="ghost" onClick={() => api.revealInFinder(item)}>Finder</button>
        <button className="danger" onClick={() => onRemove(item)}>Видалити</button>
      </div>

      <div className="detail-preview">
        <img src={srcOf(item.path)} alt={item.title} />
      </div>

      <label className="field">
        <span>Назва</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== item.title && commit({ title })}
        />
      </label>

      <div className="field">
        <span>Теги</span>
        <div className="tags">
          {(item.tags || []).map((t) => (
            <button
              key={t}
              className="tag"
              title="Прибрати тег"
              onClick={() => commit({ tags: item.tags.filter((x) => x !== t) })}
            >
              {t} <em>×</em>
            </button>
          ))}
        </div>
        <form onSubmit={addTag}>
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            placeholder="Додати тег і Enter"
          />
        </form>
      </div>

      <label className="field">
        <span>Нотатка</span>
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (item.note || '') && commit({ note })}
        />
      </label>

      <dl className="meta">
        <dt>Розмір</dt>
        <dd>{item.width && item.height ? `${item.width} × ${item.height}` : '—'}</dd>
        <dt>Додано</dt>
        <dd>{new Date(item.addedAt).toLocaleDateString('uk-UA')}</dd>
        <dt>Файл</dt>
        <dd className="mono">{item.file}</dd>
      </dl>
    </aside>
  )
}
