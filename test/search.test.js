import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tokenize, buildIndex, search, applyFilters, matchesColour, colourDistance,
} from '../src/shared/search.js'

const LIB = [
  { id: 'a', title: 'Brutalist poster', tags: ['brutalist', 'print'], note: 'concrete texture', colors: [[210, 90, 30]] },
  { id: 'b', title: 'Swiss grid layout', tags: ['typography', 'print'], note: '', colors: [[20, 20, 22]] },
  { id: 'c', title: 'DarkModeDashboard', tags: ['ui', 'dark'], note: 'charts and tables', favourite: true, collections: ['work'] },
  { id: 'd', title: 'Sunset gradient', tags: ['colour'], note: '', ocr: 'limited edition', colors: [[240, 120, 40]] },
]
const IDX = buildIndex(LIB)

test('tokenize lowercases, strips punctuation and drops stopwords', () => {
  assert.deepEqual(tokenize('The Quick, Brown-Fox!'), ['quick', 'brown', 'fox'])
})

test('tokenize keeps the whole compound and its parts', () => {
  // Screenshot filenames and design exports are full of these. Splitting
  // alone would lose the whole word; keeping only the whole word would
  // make "dashboard" unfindable.
  assert.deepEqual(
    tokenize('DarkModeDashboard'),
    ['darkmodedashboard', 'dark', 'mode', 'dashboard']
  )
})

test('tokenize does not mangle irregular casing', () => {
  assert.ok(tokenize('MiXeD').includes('mixed'), 'the real word survives')
})

test('tokenize ignores single characters and empty input', () => {
  assert.deepEqual(tokenize('a I x9'), ['x9'])
  assert.deepEqual(tokenize(null), [])
})

test('tokenize handles non-latin scripts', () => {
  assert.deepEqual(tokenize('Шрифт Гротеск'), ['шрифт', 'гротеск'])
})

test('an empty query means no filter, not no results', () => {
  assert.equal(search(IDX, ''), null)
  assert.equal(search(IDX, '   '), null)
})

test('search finds by title, tag, note and ocr alike', () => {
  assert.deepEqual(search(IDX, 'brutalist'), ['a'])
  assert.deepEqual(search(IDX, 'typography'), ['b'])
  assert.deepEqual(search(IDX, 'charts'), ['c'])
  assert.deepEqual(search(IDX, 'edition'), ['d'], 'text lifted out of the image itself')
})

test('search matches prefixes so results appear while typing', () => {
  assert.deepEqual(search(IDX, 'brut'), ['a'])
  assert.deepEqual(search(IDX, 'grad'), ['d'])
})

test('multiple terms are ANDed', () => {
  assert.deepEqual(search(IDX, 'print brutalist'), ['a'])
  assert.deepEqual(search(IDX, 'print typography'), ['b'])
})

test('an unmatched term yields nothing even if others match', () => {
  assert.deepEqual(search(IDX, 'print xyzzy'), [])
})

test('tags outrank titles in scoring', () => {
  // "print" is a tag on two items; the ordering must be stable and
  // driven by weight, not by insertion order.
  const items = [
    { id: 'title-only', title: 'print', tags: [] },
    { id: 'tagged', title: 'poster', tags: ['print'] },
  ]
  assert.deepEqual(search(buildIndex(items), 'print'), ['tagged', 'title-only'])
})

test('search is case-insensitive both ways', () => {
  assert.deepEqual(search(buildIndex([{ id: 'x', title: 'MiXeD CaSe' }]), 'mixed'), ['x'])
})

test('filters: tags are ANDed', () => {
  assert.deepEqual(applyFilters(LIB, { tags: ['print'] }).map((i) => i.id), ['a', 'b'])
  assert.deepEqual(applyFilters(LIB, { tags: ['print', 'brutalist'] }).map((i) => i.id), ['a'])
})

test('filters: favourite and collection', () => {
  assert.deepEqual(applyFilters(LIB, { favourite: true }).map((i) => i.id), ['c'])
  assert.deepEqual(applyFilters(LIB, { collection: 'work' }).map((i) => i.id), ['c'])
})

test('filters: no criteria returns everything', () => {
  assert.equal(applyFilters(LIB, {}).length, LIB.length)
})

test('colour distance is symmetric and zero for identical colours', () => {
  assert.equal(colourDistance([1, 2, 3], [1, 2, 3]), 0)
  assert.equal(colourDistance([0, 0, 0], [10, 0, 0]), colourDistance([10, 0, 0], [0, 0, 0]))
})

test('colour match finds near neighbours and rejects far ones', () => {
  const orange = [235, 110, 35]
  assert.ok(matchesColour(LIB[3], orange), 'sunset gradient is orange')
  assert.ok(!matchesColour(LIB[1], orange), 'the near-black one is not')
})

test('colour tolerance widens the net', () => {
  const item = { colors: [[100, 100, 100]] }
  assert.ok(!matchesColour(item, [200, 100, 100], 50))
  assert.ok(matchesColour(item, [200, 100, 100], 120))
})

test('an item with no palette never matches a colour query', () => {
  assert.ok(!matchesColour({ id: 'x' }, [0, 0, 0], 999))
})
