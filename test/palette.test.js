import { test } from 'node:test'
import assert from 'node:assert/strict'
import { palette, bucketOf } from '../src/shared/palette.js'

const fill = (n, rgb) => {
  const out = new Uint8Array(n * 3)
  for (let i = 0; i < n; i++) {
    out[i * 3] = rgb[0]
    out[i * 3 + 1] = rgb[1]
    out[i * 3 + 2] = rgb[2]
  }
  return out
}
const concat = (...arrays) => {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0))
  let at = 0
  for (const a of arrays) { out.set(a, at); at += a.length }
  return out
}

test('a solid image yields its own colour', () => {
  const [first] = palette(fill(100, [200, 60, 40]))
  assert.deepEqual(first, [200, 60, 40])
})

test('the most common colour comes first', () => {
  const px = concat(fill(90, [10, 200, 90]), fill(10, [200, 20, 20]))
  assert.deepEqual(palette(px)[0], [10, 200, 90])
})

test('a white background does not drown out the actual subject', () => {
  // Every screenshot has one. Without down-weighting, colour search
  // returns "white" for the entire library and is useless.
  const px = concat(fill(800, [252, 252, 252]), fill(200, [220, 90, 30]))
  assert.deepEqual(palette(px)[0], [220, 90, 30])
})

test('an all-white image still reports white rather than nothing', () => {
  const out = palette(fill(50, [255, 255, 255]))
  assert.equal(out.length, 1)
  assert.deepEqual(out[0], [255, 255, 255])
})

test('transparent pixels are ignored when there is an alpha channel', () => {
  const px = new Uint8Array([
    255, 0, 0, 0,      // fully transparent red
    0, 0, 255, 255,    // opaque blue
    0, 0, 255, 255,
  ])
  assert.deepEqual(palette(px, 4), [[0, 0, 255]])
})

test('the result is capped at the requested count', () => {
  const px = concat(
    fill(10, [200, 10, 10]), fill(10, [10, 200, 10]), fill(10, [10, 10, 200]),
    fill(10, [200, 200, 10]), fill(10, [200, 10, 200]), fill(10, [10, 200, 200])
  )
  assert.equal(palette(px, 3, 3).length, 3)
})

test('empty input yields an empty palette, not a crash', () => {
  assert.deepEqual(palette(new Uint8Array(0)), [])
})

test('similar shades collapse into one bucket', () => {
  const px = concat(fill(50, [200, 70, 40]), fill(50, [204, 74, 44]))
  assert.equal(palette(px).length, 1, 'near-identical reds are one colour, not two')
})

test('bucketOf merges close colours and separates distinct ones', () => {
  assert.equal(bucketOf(200, 70, 40), bucketOf(204, 74, 44))
  assert.notEqual(bucketOf(200, 60, 40), bucketOf(40, 60, 200))
})

test('bucketing splits colours that straddle a boundary', () => {
  // Buckets are fixed at 0/64/128/192 per channel, so two visually
  // identical colours on opposite sides of an edge are reported
  // separately. Worth knowing: it is why colour search uses a distance
  // tolerance rather than exact bucket equality.
  assert.notEqual(bucketOf(200, 63, 40), bucketOf(200, 64, 40))
})
