import { memo } from 'react'
import { srcOf } from './Grid.jsx'

// One node on the board. Position is a translate3d so that dragging can
// write straight to style.transform without React re-rendering, and
// stacking is CSS z-index so bringing a node forward never reorders the
// DOM (which would remount the subtree and restart any media).
function CanvasNode({ node, item, selected, registerRef, onPointerDown }) {
  if (!item) return null

  return (
    <div
      ref={(el) => registerRef(node.nodeId, el)}
      className={`node ${selected ? 'is-selected' : ''}`}
      style={{
        transform: `translate3d(${node.x}px, ${node.y}px, 0) rotate(${node.rotation}deg)`,
        width: node.w,
        height: node.h,
        zIndex: node.z,
        opacity: node.opacity,
      }}
      onPointerDown={(e) => onPointerDown(e, node)}
    >
      <img
        src={srcOf(item.thumb)}
        alt={item.title}
        draggable={false}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          const el = e.currentTarget
          if (el.dataset.fallback) return
          el.dataset.fallback = '1'
          // Video posters have no second source to fall back to; images
          // can still show the original.
          if (item.kind === 'image') el.src = srcOf(item.path)
          else el.closest('.node')?.classList.add('is-noposter')
        }}
      />
      {item.kind === 'video' && <span className="node-badge">▶</span>}
    </div>
  )
}

export default memo(CanvasNode)
