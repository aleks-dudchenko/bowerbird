import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalise, dot, cosine, nearest, pack, unpack } from '../src/shared/vector.js'

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

test('normalise produces unit length', () => {
  const v = normalise([3, 4])
  assert.ok(near(Math.hypot(v[0], v[1]), 1))
})

test('normalise survives a zero vector instead of dividing by zero', () => {
  const v = normalise([0, 0, 0])
  assert.ok([...v].every((x) => x === 0))
})

test('cosine is 1 for identical direction, -1 for opposite, 0 for orthogonal', () => {
  assert.ok(near(cosine([1, 0], [5, 0]), 1))
  assert.ok(near(cosine([1, 0], [-2, 0]), -1))
  assert.ok(near(cosine([1, 0], [0, 3]), 0))
})

test('cosine ignores magnitude', () => {
  assert.ok(near(cosine([1, 2, 3], [10, 20, 30]), 1))
})

test('nearest ranks by similarity, best first', () => {
  const entries = new Map([
    ['far', normalise([0, 1])],
    ['exact', normalise([1, 0])],
    ['close', normalise([0.9, 0.2])],
  ])
  const ids = nearest([1, 0], entries, 10, -1).map((r) => r.id)
  assert.deepEqual(ids, ['exact', 'close', 'far'])
})

test('nearest respects the score floor', () => {
  const entries = new Map([['opposite', normalise([-1, 0])], ['same', normalise([1, 0])]])
  assert.deepEqual(nearest([1, 0], entries, 10, 0.15).map((r) => r.id), ['same'])
})

test('nearest respects k', () => {
  const entries = new Map(
    Array.from({ length: 20 }, (_, i) => [`i${i}`, normalise([1, i / 100])])
  )
  assert.equal(nearest([1, 0], entries, 5, -1).length, 5)
})

test('an empty store returns no results rather than throwing', () => {
  assert.deepEqual(nearest([1, 0], new Map()), [])
})

test('pack and unpack round-trip exactly', () => {
  const entries = new Map([
    ['a', Float32Array.from([0.5, -0.5, 0.25])],
    ['b', Float32Array.from([1, 0, 0])],
  ])
  const back = unpack(pack(entries, 3))
  assert.deepEqual([...back.keys()], ['a', 'b'])
  assert.deepEqual([...back.get('a')], [0.5, -0.5, 0.25])
  assert.deepEqual([...back.get('b')], [1, 0, 0])
})

test('ranking survives a pack/unpack cycle', () => {
  // The store is written to disk between launches; retrieval must not
  // change because of that round trip.
  const entries = new Map([
    ['exact', normalise([1, 0, 0])],
    ['close', normalise([0.8, 0.3, 0])],
    ['far', normalise([0, 0, 1])],
  ])
  const before = nearest([1, 0, 0], entries, 10, -1).map((r) => r.id)
  const after = nearest([1, 0, 0], unpack(pack(entries, 3)), 10, -1).map((r) => r.id)
  assert.deepEqual(after, before)
})

test('dot on normalised vectors equals cosine', () => {
  const a = [2, 3, 4]
  const b = [-1, 5, 2]
  assert.ok(near(dot(normalise(a), normalise(b)), cosine(a, b)))
})
