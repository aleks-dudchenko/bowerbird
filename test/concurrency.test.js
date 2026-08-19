import { test } from 'node:test'
import assert from 'node:assert/strict'

// withLock is the guard around read-modify-write on shared files. It is
// pure enough to test on its own, and the bug it fixes was severe: two
// concurrent writers shared one temp file, so one rename threw ENOENT and
// the other silently lost its update.
function makeLock() {
  const locks = new Map()
  return function withLock(key, fn) {
    const previous = locks.get(key) ?? Promise.resolve()
    const next = previous.then(fn, fn)
    locks.set(key, next.then(() => {}, () => {}))
    return next
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

test('concurrent read-modify-write on one key loses nothing', async () => {
  const withLock = makeLock()
  let state = {}
  const patch = (k, v) =>
    withLock('settings', async () => {
      const snapshot = { ...state }
      await tick() // the window where an unguarded writer would be clobbered
      state = { ...snapshot, [k]: v }
    })

  await Promise.all(Array.from({ length: 10 }, (_, i) => patch(`k${i}`, i)))
  assert.equal(Object.keys(state).length, 10)
})

test('without the lock the same writes do lose updates', async () => {
  // Pins why the lock exists, so nobody removes it as ceremony.
  let state = {}
  const patch = async (k, v) => {
    const snapshot = { ...state }
    await tick()
    state = { ...snapshot, [k]: v }
  }
  await Promise.all(Array.from({ length: 10 }, (_, i) => patch(`k${i}`, i)))
  assert.ok(Object.keys(state).length < 10, 'unguarded writes collide')
})

test('different keys are not serialised against each other', async () => {
  const withLock = makeLock()
  const order = []
  const slow = withLock('a', async () => { await tick(); await tick(); order.push('a') })
  const fast = withLock('b', async () => { order.push('b') })
  await Promise.all([slow, fast])
  assert.deepEqual(order, ['b', 'a'], 'b did not wait for a')
})

test('a rejected writer does not block the next one', async () => {
  const withLock = makeLock()
  await assert.rejects(withLock('k', async () => { throw new Error('boom') }))
  assert.equal(await withLock('k', async () => 'ok'), 'ok')
})
