import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migration, migrated, SCHEMA } from '../src/shared/migrate.js'

// What a sidecar written by the very first version looked like.
const V0 = {
  id: 'de652d3e08b',
  file: 'de652d3e08b.png',
  title: 'Screenshot',
  addedAt: '2026-08-19T00:00:00.000Z',
  sha256: 'abc',
  width: 1712,
  height: 1412,
  tags: [],
  note: '',
  sourceUrl: null,
}

test('an old sidecar is missing kind, which silently breaks features', () => {
  assert.equal(V0.kind, undefined)
  assert.equal(migrated(V0).kind, 'image')
})

test('kind is derived from the file extension, images and video alike', () => {
  assert.equal(migrated({ ...V0, file: 'x.mp4' }).kind, 'video')
  assert.equal(migrated({ ...V0, file: 'x.heic' }).kind, 'image')
  assert.equal(migrated({ ...V0, file: 'x.pdf' }).kind, 'image')
})

test('an unknown extension leaves kind unset rather than guessing', () => {
  assert.equal(migrated({ ...V0, file: 'x.xyz' }).kind, undefined)
})

test('every field the current code reads gets a safe default', () => {
  const out = migrated(V0)
  assert.equal(out.schema, SCHEMA)
  assert.deepEqual(out.collections, [])
  assert.deepEqual(out.autoTags, [])
  assert.deepEqual(out.colors, [])
  assert.equal(out.favourite, false)
  assert.equal(out.deletedAt, null)
  assert.equal(out.ocr, null)
})

test('migration never overwrites real user data', () => {
  const rich = {
    ...V0, schema: SCHEMA, kind: 'image',
    tags: ['brutalist'], note: 'keep me', favourite: true,
    collections: ['work'], autoTags: ['poster'], colors: [[1, 2, 3]],
    deletedAt: '2026-01-01T00:00:00.000Z', ocr: 'some text',
  }
  assert.equal(migration(rich), null, 'nothing to do')
  const out = migrated(rich)
  assert.deepEqual(out.tags, ['brutalist'])
  assert.equal(out.note, 'keep me')
  assert.equal(out.favourite, true)
  assert.equal(out.ocr, 'some text')
  assert.equal(out.deletedAt, '2026-01-01T00:00:00.000Z')
})

test('a current sidecar needs no write', () => {
  assert.equal(migration(migrated(V0)), null, 'migration is idempotent')
})

test('a trashed old item stays trashed', () => {
  assert.equal(migrated({ ...V0, deletedAt: '2026-02-02T00:00:00.000Z' }).deletedAt,
    '2026-02-02T00:00:00.000Z')
})

test('an empty note is left empty rather than nulled', () => {
  assert.equal(migrated({ ...V0, note: undefined }).note, '')
})
