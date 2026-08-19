import { useEffect, useState } from 'react'
import { srcOf } from './Grid.jsx'

const api = window.zbirka

export default function DetailPanel({ item, onClose, onUpdate, onTrash }) {
  const [title, setTitle] = useState(item.title)
  const [note, setNote] = useState(item.note || '')
  const [tagDraft, setTagDraft] = useState('')

  // Switching to another item must reload the fields rather than keep
  // the previous item's text.
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
        <button className="ghost" onClick={onClose}>Close</button>
        <div className="spacer" />
        <button className="ghost" onClick={() => api.revealInFinder(item)}>Finder</button>
        <button className="danger" onClick={() => onTrash(item)}>Trash</button>
      </div>

      <div className="detail-preview">
        {item.kind === 'video' ? (
          <video src={srcOf(item.path)} controls preload="metadata" />
        ) : (
          <img src={srcOf(item.path)} alt={item.title} />
        )}
      </div>

      <label className="field">
        <span>Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== item.title && commit({ title })}
        />
      </label>

      <div className="field">
        <span>Tags</span>
        <div className="tags">
          {(item.tags || []).map((t) => (
            <button
              key={t}
              className="tag"
              title="Remove tag"
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
            placeholder="Add a tag, press Enter"
          />
        </form>
      </div>

      <label className="field">
        <span>Note</span>
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (item.note || '') && commit({ note })}
        />
      </label>

      <dl className="meta">
        <dt>Kind</dt>
        <dd>{item.kind === 'video' ? 'Video' : 'Image'}</dd>
        <dt>Size</dt>
        <dd>{item.width && item.height ? `${item.width} × ${item.height}` : '—'}</dd>
        {item.kind === 'video' && (
          <>
            <dt>Length</dt>
            <dd>{item.duration ? `${Math.round(item.duration)}s` : '—'}</dd>
          </>
        )}
        <dt>Added</dt>
        <dd>{new Date(item.addedAt).toLocaleDateString('en-GB')}</dd>
        <dt>File</dt>
        <dd className="mono">{item.file}</dd>
        {item.sourceUrl && (
          <>
            <dt>Source</dt>
            <dd>
              <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                {new URL(item.sourceUrl).hostname}
              </a>
            </dd>
          </>
        )}
      </dl>
    </aside>
  )
}
