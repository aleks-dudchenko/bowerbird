import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CanvasNode from './CanvasNode.jsx'
import {
  clamp, toWorld as toWorldPoint, zoomAt, cull, fitView, snap, hitTest,
  MIN_ZOOM, MAX_ZOOM,
} from '../../shared/canvas-math.js'

// Infinite canvas as plain DOM under one transformed container.
//
// Deliberately not a canvas library: video needs real elements, images
// want native lazy loading, and both come free here. The cost is a node
// ceiling — mitigated by culling to the viewport, which is cheap because
// every node's geometry is authoritative in the space file rather than
// measured from the DOM.
export default function Canvas({
  nodes, byId, selectedNodeIds, onSelect, onMove, onRemove, onBringToFront,
  onDropFiles, viewport, onViewportChange,
}) {
  const hostRef = useRef(null)
  const worldRef = useRef(null)
  const nodeEls = useRef(new Map())
  const drag = useRef(null)
  const [marquee, setMarquee] = useState(null)
  const [guides, setGuides] = useState([])
  const [spacePan, setSpacePan] = useState(false)

  const view = viewport || { x: 0, y: 0, zoom: 1 }
  const registerRef = useCallback((id, el) => {
    if (el) nodeEls.current.set(id, el)
    else nodeEls.current.delete(id)
  }, [])

  const toWorld = useCallback(
    (clientX, clientY) => toWorldPoint(clientX, clientY, hostRef.current.getBoundingClientRect(), view),
    [view]
  )

  // Only mount what can be seen. Everything else stays one object in an
  // array, which is why thousands of nodes stay affordable.
  const visible = useMemo(() => {
    const host = hostRef.current
    if (!host) return nodes
    return cull(nodes, view, host.getBoundingClientRect())
  }, [nodes, view])

  // ---- zoom & pan ---------------------------------------------------

  const onWheel = useCallback(
    (e) => {
      e.preventDefault()
      const r = hostRef.current.getBoundingClientRect()
      const px = e.clientX - r.left
      const py = e.clientY - r.top

      if (e.ctrlKey || e.metaKey) {
        // Keep the point under the cursor fixed while scaling.
        onViewportChange(zoomAt(view, px, py, Math.exp(-e.deltaY / 200)))
      } else {
        onViewportChange({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY })
      }
    },
    [view, onViewportChange]
  )

  const fitToContent = useCallback(() => {
    if (!nodes.length || !hostRef.current) return
    onViewportChange(fitView(nodes, hostRef.current.getBoundingClientRect()))
  }, [nodes, onViewportChange])

  // ---- dragging nodes ------------------------------------------------

  const computeSnap = useCallback(
    (dx, dy, moving) => snap(nodes, moving, dx, dy, view.zoom),
    [nodes, view.zoom]
  )

  const onNodePointerDown = useCallback(
    (e, node) => {
      if (e.button !== 0 || spacePan) return
      e.stopPropagation()

      const additive = e.shiftKey || e.metaKey
      let nextSel = selectedNodeIds
      if (!selectedNodeIds.has(node.nodeId)) {
        nextSel = additive ? new Set([...selectedNodeIds, node.nodeId]) : new Set([node.nodeId])
        onSelect(nextSel)
      } else if (additive) {
        nextSel = new Set([...selectedNodeIds].filter((id) => id !== node.nodeId))
        onSelect(nextSel)
        return
      }

      const moving = new Set(nextSel)
      drag.current = {
        moving,
        startX: e.clientX,
        startY: e.clientY,
        origin: new Map(nodes.filter((n) => moving.has(n.nodeId)).map((n) => [n.nodeId, n])),
      }
      onBringToFront([...moving])
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [nodes, selectedNodeIds, onSelect, onBringToFront, spacePan]
  )

  // Pointer moves write to the DOM directly. Committing to React state
  // here would mean a re-render of the whole board per frame.
  useEffect(() => {
    const move = (e) => {
      const d = drag.current
      if (!d) return
      const rawDx = (e.clientX - d.startX) / view.zoom
      const rawDy = (e.clientY - d.startY) / view.zoom
      const { dx, dy, lines } = computeSnap(rawDx, rawDy, d.moving)
      d.dx = dx
      d.dy = dy
      setGuides(lines)

      for (const [id, n] of d.origin) {
        const el = nodeEls.current.get(id)
        if (el) {
          el.style.transform =
            `translate3d(${n.x + dx}px, ${n.y + dy}px, 0) rotate(${n.rotation}deg)`
        }
      }
    }

    const up = () => {
      const d = drag.current
      drag.current = null
      setGuides([])
      if (!d || (!d.dx && !d.dy)) return
      onMove([...d.origin.values()].map((n) => ({
        nodeId: n.nodeId,
        x: Math.round(n.x + d.dx),
        y: Math.round(n.y + d.dy),
      })))
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [computeSnap, onMove, view.zoom])

  // ---- empty-area gestures: pan or marquee ---------------------------

  const onHostPointerDown = useCallback(
    (e) => {
      if (e.target.closest('.node')) return
      const panning = spacePan || e.button === 1 || e.altKey

      if (panning) {
        const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
        const move = (ev) =>
          onViewportChange({
            ...view,
            x: start.vx + (ev.clientX - start.x),
            y: start.vy + (ev.clientY - start.y),
          })
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        return
      }

      const from = toWorld(e.clientX, e.clientY)
      if (!e.shiftKey) onSelect(new Set())

      const move = (ev) => {
        const to = toWorld(ev.clientX, ev.clientY)
        setMarquee({
          x: Math.min(from.x, to.x), y: Math.min(from.y, to.y),
          w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y),
        })
      }
      const up = (ev) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        setMarquee(null)
        const to = toWorld(ev.clientX, ev.clientY)
        const box = {
          l: Math.min(from.x, to.x), r: Math.max(from.x, to.x),
          t: Math.min(from.y, to.y), b: Math.max(from.y, to.y),
        }
        if (box.r - box.l < 3 && box.b - box.t < 3) return
        const hit = hitTest(nodes, box).map((n) => n.nodeId)
        onSelect(ev.shiftKey ? new Set([...selectedNodeIds, ...hit]) : new Set(hit))
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [nodes, selectedNodeIds, onSelect, toWorld, view, onViewportChange, spacePan]
  )

  // ---- keyboard ------------------------------------------------------

  useEffect(() => {
    const down = (e) => {
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName)
      if (e.code === 'Space' && !typing && !e.repeat) {
        e.preventDefault()
        setSpacePan(true)
      }
      if (typing) return

      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === '0') { e.preventDefault(); fitToContent() }
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        onViewportChange({ ...view, zoom: clamp(view.zoom * 1.2, MIN_ZOOM, MAX_ZOOM) })
      }
      if (mod && e.key === '-') {
        e.preventDefault()
        onViewportChange({ ...view, zoom: clamp(view.zoom / 1.2, MIN_ZOOM, MAX_ZOOM) })
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        onSelect(new Set(nodes.map((n) => n.nodeId)))
      }
      // Delete takes the node off the board. It never touches the file —
      // removing a reference from a moodboard is not deleting an asset.
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedNodeIds.size) {
        e.preventDefault()
        onRemove([...selectedNodeIds])
        onSelect(new Set())
      }
      if (e.key.startsWith('Arrow') && selectedNodeIds.size) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = (e.key === 'ArrowRight' ? step : 0) - (e.key === 'ArrowLeft' ? step : 0)
        const dy = (e.key === 'ArrowDown' ? step : 0) - (e.key === 'ArrowUp' ? step : 0)
        onMove(
          nodes
            .filter((n) => selectedNodeIds.has(n.nodeId))
            .map((n) => ({ nodeId: n.nodeId, x: n.x + dx, y: n.y + dy }))
        )
      }
    }
    const up = (e) => e.code === 'Space' && setSpacePan(false)

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [nodes, selectedNodeIds, view, onSelect, onMove, onRemove, onViewportChange, fitToContent])

  return (
    <div
      ref={hostRef}
      className={`canvas ${spacePan ? 'is-panning' : ''}`}
      onWheel={onWheel}
      onPointerDown={onHostPointerDown}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDropFiles(e, toWorld(e.clientX, e.clientY))
      }}
    >
      <div
        ref={worldRef}
        className="world"
        style={{
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`,
        }}
      >
        {visible.map((node) => (
          <CanvasNode
            key={node.nodeId}
            node={node}
            item={byId.get(node.itemId)}
            selected={selectedNodeIds.has(node.nodeId)}
            registerRef={registerRef}
            onPointerDown={onNodePointerDown}
          />
        ))}

        {guides.map((g, i) => (
          <div
            key={i}
            className={`guide guide-${g.axis}`}
            style={g.axis === 'x' ? { left: g.at } : { top: g.at }}
          />
        ))}

        {marquee && (
          <div
            className="marquee"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        )}
      </div>

      {!nodes.length && (
        <div className="canvas-empty">
          Drop files here, or drag them up from the tray
        </div>
      )}
    </div>
  )
}
