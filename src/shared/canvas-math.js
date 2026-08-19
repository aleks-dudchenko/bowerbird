// Pure geometry for the canvas. Kept out of the React component so it can
// be tested without a DOM: these are the parts that silently break and
// that no amount of clicking around reliably catches.

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 8
export const SNAP_PX = 6
export const CULL_PAD = 400

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** Screen point -> world point, given the viewport transform. */
export function toWorld(clientX, clientY, rect, view) {
  return {
    x: (clientX - rect.left - view.x) / view.zoom,
    y: (clientY - rect.top - view.y) / view.zoom,
  }
}

/**
 * Zoom about a fixed screen point. The invariant that matters: the world
 * coordinate under the cursor must be identical before and after.
 */
export function zoomAt(view, px, py, factor) {
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  return {
    zoom,
    x: px - ((px - view.x) / view.zoom) * zoom,
    y: py - ((py - view.y) / view.zoom) * zoom,
  }
}

/** Nodes intersecting the padded viewport. Everything else stays unmounted. */
export function cull(nodes, view, size, pad = CULL_PAD) {
  const left = -view.x / view.zoom - pad
  const top = -view.y / view.zoom - pad
  const right = left + size.width / view.zoom + pad * 2
  const bottom = top + size.height / view.zoom + pad * 2
  return nodes.filter(
    (n) => n.x + n.w >= left && n.x <= right && n.y + n.h >= top && n.y <= bottom
  )
}

/** Axis-aligned bounding box of a node list. Null for an empty list. */
export function bounds(nodes) {
  if (!nodes.length) return null
  return {
    l: Math.min(...nodes.map((n) => n.x)),
    t: Math.min(...nodes.map((n) => n.y)),
    r: Math.max(...nodes.map((n) => n.x + n.w)),
    b: Math.max(...nodes.map((n) => n.y + n.h)),
  }
}

/** Viewport that centres every node with a margin. */
export function fitView(nodes, size, margin = 80) {
  const box = bounds(nodes)
  if (!box) return { x: 0, y: 0, zoom: 1 }
  const zoom = clamp(
    Math.min((size.width - margin) / (box.r - box.l), (size.height - margin) / (box.b - box.t)),
    MIN_ZOOM,
    1
  )
  return {
    zoom,
    x: size.width / 2 - ((box.l + box.r) / 2) * zoom,
    y: size.height / 2 - ((box.t + box.b) / 2) * zoom,
  }
}

/**
 * Magnetism against other nodes' edges and centres. Tolerance is given in
 * screen pixels and converted to world units, so the pull feels the same
 * at every zoom level.
 */
export function snap(nodes, movingIds, dx, dy, zoom, tolPx = SNAP_PX) {
  const moving = nodes.filter((n) => movingIds.has(n.nodeId))
  const others = nodes.filter((n) => !movingIds.has(n.nodeId))
  if (!moving.length || !others.length) return { dx, dy, lines: [] }

  const tol = tolPx / zoom
  const box = bounds(moving)
  const b = { l: box.l + dx, r: box.r + dx, t: box.t + dy, b: box.b + dy }
  b.cx = (b.l + b.r) / 2
  b.cy = (b.t + b.b) / 2

  let bestX = null
  let bestY = null

  for (const n of others) {
    for (const [mine, theirs] of [
      [b.l, n.x], [b.r, n.x + n.w], [b.cx, n.x + n.w / 2],
      [b.l, n.x + n.w], [b.r, n.x],
    ]) {
      const d = theirs - mine
      if (Math.abs(d) < tol && (bestX === null || Math.abs(d) < Math.abs(bestX))) bestX = d
    }
    for (const [mine, theirs] of [
      [b.t, n.y], [b.b, n.y + n.h], [b.cy, n.y + n.h / 2],
      [b.t, n.y + n.h], [b.b, n.y],
    ]) {
      const d = theirs - mine
      if (Math.abs(d) < tol && (bestY === null || Math.abs(d) < Math.abs(bestY))) bestY = d
    }
  }

  const lines = []
  if (bestX !== null) lines.push({ axis: 'x', at: b.l + bestX })
  if (bestY !== null) lines.push({ axis: 'y', at: b.t + bestY })
  return { dx: dx + (bestX || 0), dy: dy + (bestY || 0), lines }
}

/** Nodes intersecting a marquee rectangle. */
export function hitTest(nodes, box) {
  return nodes.filter(
    (n) => n.x < box.r && n.x + n.w > box.l && n.y < box.b && n.y + n.h > box.t
  )
}

/**
 * Where a newly added node should land. Adding items one at a time used
 * to place every one of them on identical coordinates, so each hid the
 * last; cascade off whatever already occupies the point.
 */
export function freeSpot(existing, at, step = 28, tol = 12) {
  let { x, y } = { x: Math.round(at.x), y: Math.round(at.y) }
  while (existing.some((n) => Math.abs(n.x - x) < tol && Math.abs(n.y - y) < tol)) {
    x += step
    y += step
  }
  return { x, y }
}
