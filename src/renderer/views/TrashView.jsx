import { srcOf } from '../components/Grid.jsx'
import { IconButton } from '../components/Icon.jsx'

// Deleting a designer's file with one click is the most damaging thing a
// tool like this can do, so nothing is destroyed until it is asked for
// twice — and even then it goes to the system trash, not to oblivion.
export default function TrashView({ items, onRestore, onPurge, onBack }) {
  return (
    <div className="library">
      <div className="library-bar">
        <button className="ghost" onClick={onBack}>Back to library</button>
        <span className="count">{items.length} in trash</span>
        <div className="spacer" />
        {items.length > 0 && (
          <button className="danger" onClick={() => onPurge(items)}>
            Empty trash
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <main className="empty">
          <div className="empty-inner">
            <h1>Trash is empty</h1>
            <p>Items you delete land here first. Files stay on disk until you empty it.</p>
          </div>
        </main>
      ) : (
        <main className="grid">
          {items.map((item) => (
            <div key={item.id} className="card is-trashed">
              <img src={srcOf(item.thumb)} alt={item.title} loading="lazy" />
              <div className="trash-actions">
                <IconButton
                  icon="restore"
                  tip="Put this back in the library"
                  align="right"
                  onClick={() => onRestore([item])}
                />
              </div>
            </div>
          ))}
        </main>
      )}
    </div>
  )
}
