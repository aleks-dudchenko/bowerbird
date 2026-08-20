import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Two silent failure modes, both of which produce a working build and a
// wrong app: an icon name that is not in the set renders nothing at all,
// and a sound selector that matches no class simply never fires. Neither
// throws, so only a check like this one finds them.

const RENDERER = new URL('../src/renderer/', import.meta.url).pathname

function sources(dir = RENDERER, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.jsx?$/.test(name)) out.push([path, readFileSync(path, 'utf8')])
  }
  return out
}

const files = sources()
const all = files.map(([, text]) => text).join('\n')
const icons = readFileSync(join(RENDERER, 'components/Icon.jsx'), 'utf8')

const known = new Set([...icons.matchAll(/^ {2}([a-zA-Z]+): \[/gm)].map((m) => m[1]))

test('the icon set is not empty, so the rest of this file means something', () => {
  assert.ok(known.size >= 10, `only ${known.size} icons`)
})

test('every icon that is asked for exists', () => {
  const asked = [...all.matchAll(/icon=(?:"([a-zA-Z]+)"|\{[^}]*'([a-zA-Z]+)'[^}]*\})/g)]
    .flatMap((m) => [m[1], m[2]])
    .filter(Boolean)
  assert.ok(asked.length > 0, 'no icons are used at all')
  const unknown = [...new Set(asked)].filter((name) => !known.has(name))
  assert.deepEqual(unknown, [], `no such icon: ${unknown.join(', ')}`)
})

test('every icon button says what it does on hover', () => {
  const nameless = []
  for (const [path, text] of files) {
    for (const m of text.matchAll(/<IconButton\b([\s\S]*?)\/>/g)) {
      if (!/\btip=/.test(m[1])) nameless.push(path.split('/').pop())
    }
  }
  assert.deepEqual(nameless, [], `IconButton without a tip in: ${nameless.join(', ')}`)
})

test('every sound cue is attached to a class that exists', () => {
  const hook = readFileSync(join(RENDERER, 'useSound.js'), 'utf8')
  const cues = hook.slice(hook.indexOf('const CUES'), hook.indexOf(']\n\nconst cueFor'))
  const selectors = [...cues.matchAll(/\['([^']+)',\s*'([a-z]+)'\]/g)]
  assert.ok(selectors.length >= 5, `only ${selectors.length} cues parsed`)

  const classes = new Set(
    [...all.matchAll(/class(?:Name)?=(?:"([^"]*)"|\{`([^`]*)`|\{'([^']*)')/g)]
      .flatMap((m) => (m[1] ?? m[2] ?? m[3] ?? '').split(/[\s${}?:]+/))
      .filter(Boolean)
  )
  const orphans = []
  for (const [, selector] of selectors) {
    for (const part of selector.split(',')) {
      const first = part.trim().split(/\s+/)[0]
      if (first.startsWith('.') && !classes.has(first.slice(1))) orphans.push(first)
    }
  }
  assert.deepEqual(orphans, [], `cue attached to a class nothing has: ${orphans.join(', ')}`)
})

test('hover makes no sound', () => {
  // Explicitly asked for: a pointer crossing a toolbar is not an action.
  const hook = readFileSync(join(RENDERER, 'useSound.js'), 'utf8')
  assert.ok(!/pointerenter|mouseenter|data-cuelume-hover/.test(hook), 'a hover cue crept in')
})

test('the document itself never scrolls', () => {
  // A tooltip is absolutely positioned but still counts toward its
  // scroll container's overflow, so one wide hover label near the right
  // edge was enough to grow a scrollbar across the whole window.
  const css = readFileSync(join(RENDERER, 'styles.css'), 'utf8')
  assert.match(css, /html, body, #root \{[^}]*overflow: hidden/)
})
