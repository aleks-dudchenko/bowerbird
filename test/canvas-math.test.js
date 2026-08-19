import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clamp, toWorld, zoomAt, cull, bounds, fitView, snap, hitTest, freeSpot,
  MIN_ZOOM, MAX_ZOOM,
} from '../src/shared/canvas-math.js'

const node = (id, x, y, w = 100, h = 100) => ({ nodeId: id, x, y, w, h, z: 1 })
const RECT = { left: 0, top: 0 }
const SIZE = { width: 1000, height: 800 }

test('clamp holds the bounds', () => {
  assert.equal(clamp(5, 0, 10), 5)
  assert.equal(clamp(-1, 0, 10), 0)
  assert.equal(clamp(99, 0, 10), 10)
})

test('toWorld inverts the viewport transform', () => {
  const view = { x: 120, y: -40, zoom: 2 }
  assert.deepEqual(toWorld(320, 160, RECT, view), { x: 100, y: 100 })
})

test('zoomAt keeps the world point under the cursor fixed', () => {
  // The whole point of zoom-to-cursor: whatever is under the pointer must
  // still be under it afterwards. Off-by-one here is invisible until it
  // makes the canvas feel like it is sliding away from you.
  const view = { x: 37, y: -12, zoom: 0.8 }
  const [px, py] = [420, 310]
  const before = toWorld(px, py, RECT, view)
  const after = toWorld(px, py, RECT, zoomAt(view, px, py, 1.6))
  assert.ok(Math.abs(before.x - after.x) < 1e-9, `x drifted: ${before.x} vs ${after.x}`)
  assert.ok(Math.abs(before.y - after.y) < 1e-9, `y drifted: ${before.y} vs ${after.y}`)
})

test('zoomAt respects the zoom limits', () => {
  assert.equal(zoomAt({ x: 0, y: 0, zoom: MAX_ZOOM }, 0, 0, 4).zoom, MAX_ZOOM)
  assert.equal(zoomAt({ x: 0, y: 0, zoom: MIN_ZOOM }, 0, 0, 0.1).zoom, MIN_ZOOM)
})

test('cull keeps what is on screen and drops what is far away', () => {
  const nodes = [node('near', 50, 50), node('far', 90000, 90000), node('behind', -90000, 0)]
  const kept = cull(nodes, { x: 0, y: 0, zoom: 1 }, SIZE).map((n) => n.nodeId)
  assert.deepEqual(kept, ['near'])
})

test('cull keeps nodes straddling the viewport edge', () => {
  // A node half off-screen must still render, or images pop in visibly.
  const kept = cull([node('edge', 980, 400)], { x: 0, y: 0, zoom: 1 }, SIZE, 0)
  assert.equal(kept.length, 1)
})

test('cull follows the viewport when panned', () => {
  const nodes = [node('a', 0, 0), node('b', 5000, 0)]
  const panned = { x: -5000, y: 0, zoom: 1 }
  assert.deepEqual(cull(nodes, panned, SIZE, 0).map((n) => n.nodeId), ['b'])
})

test('bounds wraps every node, null when empty', () => {
  assert.equal(bounds([]), null)
  assert.deepEqual(bounds([node('a', 0, 0), node('b', 200, 300)]), { l: 0, t: 0, r: 300, b: 400 })
})

test('fitView centres the content', () => {
  const nodes = [node('a', 0, 0), node('b', 400, 400)]
  const view = fitView(nodes, SIZE)
  const box = bounds(nodes)
  const cx = (box.l + box.r) / 2 * view.zoom + view.x
  const cy = (box.t + box.b) / 2 * view.zoom + view.y
  assert.ok(Math.abs(cx - SIZE.width / 2) < 1e-9)
  assert.ok(Math.abs(cy - SIZE.height / 2) < 1e-9)
})

test('fitView never zooms past 1:1', () => {
  assert.ok(fitView([node('tiny', 0, 0, 10, 10)], SIZE).zoom <= 1)
})

test('fitView on an empty board is the identity viewport', () => {
  assert.deepEqual(fitView([], SIZE), { x: 0, y: 0, zoom: 1 })
})

test('snap pulls a left edge onto a neighbour right edge', () => {
  // Offset vertically on purpose: with equal tops the vertical edges
  // would also align and the result would carry a second guide.
  const nodes = [node('fixed', 0, 0), node('moving', 104, 500)]
  const out = snap(nodes, new Set(['moving']), 0, 0, 1)
  assert.equal(out.dx, -4, 'should close the 4px gap')
  assert.equal(out.dy, 0)
  assert.deepEqual(out.lines, [{ axis: 'x', at: 100 }])
})

test('snap emits a guide per aligned axis', () => {
  const nodes = [node('fixed', 0, 0), node('moving', 104, 0)]
  const out = snap(nodes, new Set(['moving']), 0, 0, 1)
  assert.deepEqual(
    out.lines.map((l) => l.axis).sort(),
    ['x', 'y'],
    'tops already line up, so both axes report'
  )
})

test('snap ignores neighbours beyond tolerance', () => {
  const nodes = [node('fixed', 0, 0), node('moving', 400, 400)]
  assert.deepEqual(snap(nodes, new Set(['moving']), 0, 0, 1), { dx: 0, dy: 0, lines: [] })
})

test('snap tolerance is in screen pixels, not world units', () => {
  // Zoomed far out, a 6px screen pull must reach much further in world
  // space — otherwise magnetism silently dies as you zoom out.
  const nodes = [node('fixed', 0, 0), node('moving', 130, 400)]
  assert.equal(snap(nodes, new Set(['moving']), 0, 0, 1).dx, 0, 'out of reach at 1x')
  assert.equal(snap(nodes, new Set(['moving']), 0, 0, 0.15).dx, -30, 'in reach at 0.15x')
})

test('snap corrects both axes at once', () => {
  const nodes = [node('fixed', 0, 0), node('moving', 103, 3)]
  const out = snap(nodes, new Set(['moving']), 0, 0, 1)
  assert.equal(out.dx, -3)
  assert.equal(out.dy, -3)
  assert.equal(out.lines.length, 2)
})

test('snap does nothing when everything is moving', () => {
  const nodes = [node('a', 0, 0), node('b', 104, 0)]
  assert.deepEqual(snap(nodes, new Set(['a', 'b']), 7, 7, 1), { dx: 7, dy: 7, lines: [] })
})

test('snap treats a multi-node selection as one box', () => {
  const nodes = [node('fixed', 0, 0), node('m1', 200, 400), node('m2', 304, 400)]
  const out = snap(nodes, new Set(['m1', 'm2']), -96, 0, 1)
  assert.equal(out.dx, -100, 'selection left edge lands on the neighbour right edge')
})

test('hitTest selects overlapping nodes only', () => {
  const nodes = [node('in', 10, 10), node('out', 500, 500)]
  const hit = hitTest(nodes, { l: 0, t: 0, r: 50, b: 50 }).map((n) => n.nodeId)
  assert.deepEqual(hit, ['in'])
})

test('hitTest counts a partial overlap', () => {
  const hit = hitTest([node('edge', 40, 40)], { l: 0, t: 0, r: 45, b: 45 })
  assert.equal(hit.length, 1)
})

test('freeSpot returns the point when nothing is there', () => {
  assert.deepEqual(freeSpot([], { x: 80, y: 80 }), { x: 80, y: 80 })
})

test('freeSpot cascades past occupied points', () => {
  // The defect this exists to prevent: adding items one at a time put
  // every one of them on identical coordinates, so each hid the last.
  const existing = [node('a', 80, 80), node('b', 108, 108)]
  assert.deepEqual(freeSpot(existing, { x: 80, y: 80 }), { x: 136, y: 136 })
})
