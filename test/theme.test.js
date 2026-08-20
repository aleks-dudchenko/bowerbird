import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The app was dark-only, hard-coded. Both themes now exist, and these
// checks keep the structure honest: nothing may define a colour only
// inside a media query, and the user's override has to beat the system in
// both directions — forcing light on a dark machine, and the reverse.
const css = readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf8')

const block = (selector) => {
  const at = css.indexOf(selector)
  if (at === -1) return ''
  return css.slice(at, css.indexOf('\n}', at))
}
const tokensIn = (text) => [...text.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1])

const base = tokensIn(block(':root {'))
const systemDark = tokensIn(block("@media (prefers-color-scheme: dark)"))
const forcedDark = tokensIn(block(":root[data-theme='dark']"))

test('the light palette is the base definition', () => {
  for (const token of ['--bg', '--surface', '--line', '--text', '--muted', '--select']) {
    assert.ok(base.includes(token), `${token} is missing from :root`)
  }
})

test('no colour exists only inside a media query', () => {
  // Otherwise that colour is simply absent on a light system.
  const missing = systemDark.filter((t) => !base.includes(t))
  assert.deepEqual(missing, [], `defined only for dark: ${missing.join(', ')}`)
})

test('the forced-dark override covers everything the system rule does', () => {
  const missing = systemDark.filter((t) => !forcedDark.includes(t))
  assert.deepEqual(missing, [], `data-theme="dark" would miss: ${missing.join(', ')}`)
})

test('the system rule yields to an explicit light choice', () => {
  // Without :not([data-theme='light']) a dark machine would ignore the
  // user asking for light.
  assert.ok(
    /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)/.test(css),
    'the dark media rule is not guarded against an explicit light choice'
  )
})

test('selection is two-tone in both themes', () => {
  for (const [name, tokens] of [['light', base], ['dark', forcedDark]]) {
    assert.ok(tokens.includes('--select'), `${name} has no --select`)
    assert.ok(tokens.includes('--select-halo'), `${name} has no --select-halo`)
  }
})

test('no colour is hard-coded outside the token blocks', () => {
  const body = css.slice(css.indexOf('* { box-sizing'))
  const stray = body
    .split('\n')
    .filter((l) => /(#[0-9a-f]{3,8}\b|rgba?\()/i.test(l) && !l.includes('var(--'))
  assert.deepEqual(stray, [], `hard-coded colour: ${stray.join(' | ')}`)
})
