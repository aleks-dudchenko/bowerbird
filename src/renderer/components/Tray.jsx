import { srcOf } from './Grid.jsx'

// The results surface. Today it holds recent imports plus whatever the
// substring filter matches; when real search lands it renders the same
// strip from ranked results, so this is not throwaway work.
export default function Tray({ items, query, onQuery, onAdd, collapsed, onToggle }) {
  return (
    <div className={`tray ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="tray-head">
        <button className="ghost" onClick={onToggle}>
          {collapsed ? 'Show library' : 'Hide'}
        </button>
        <input
          className="tray-search"
          value={query}
          placeholder="Filter by name or tag"
          onChange={(e) => onQuery(e.target.value)}
        />
        <span className="count">{items.length}</span>
      </div>

      {!collapsed && (
        <div className="tray-strip">
          {items.map((item) => (
            <button
              key={item.id}
              className="tray-item"
              title={item.title}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-bowerbird-item', item.id)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onDoubleClick={() => onAdd([item])}
            >
              <img src={srcOf(item.thumb)} alt={item.title} loading="lazy" draggable={false} />
            </button>
          ))}
          {!items.length && <span className="tray-empty">Nothing matches</span>}
        </div>
      )}
    </div>
  )
}
