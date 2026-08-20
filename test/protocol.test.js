import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Three files have to agree on the custom scheme: the main process
// registers it, the renderer builds URLs with it, and the CSP allows it.
// Renaming the project changed two of the three and left the CSP naming
// the old scheme, so every image in the app failed to load while all
// three test suites stayed green. Nothing was asserting the connection.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

const main = read('../src/main/index.js')
const html = read('../src/renderer/index.html')
const grid = read('../src/renderer/components/Grid.jsx')

const registered = /registerSchemesAsPrivileged\(\[\s*\{\s*scheme:\s*'([a-z]+)'/.exec(main)?.[1]
const handled = /protocol\.handle\('([a-z]+)'/.exec(main)?.[1]
const used = /`([a-z]+):\/\/local\//.exec(grid)?.[1]
// Anchored on the CSP meta specifically: the viewport meta also has a
// content attribute and comes first in the file.
const csp =
  /http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/.exec(html)?.[1] ?? ''

test('the scheme is registered as privileged', () => {
  assert.ok(registered, 'no registerSchemesAsPrivileged call found')
})

test('the handler serves the scheme that was registered', () => {
  assert.equal(handled, registered)
})

test('the renderer builds URLs with that same scheme', () => {
  assert.equal(used, registered, `Grid builds ${used}:// but main registers ${registered}://`)
})

test('the CSP allows images over that scheme', () => {
  const imgSrc = /img-src ([^;]+)/.exec(csp)?.[1] ?? ''
  assert.ok(imgSrc.includes(`${registered}:`), `img-src is "${imgSrc.trim()}"`)
})

test('the CSP allows video over that scheme', () => {
  const mediaSrc = /media-src ([^;]+)/.exec(csp)?.[1] ?? ''
  assert.ok(mediaSrc.includes(`${registered}:`), `media-src is "${mediaSrc.trim()}"`)
})

test('the CSP still denies everything by default', () => {
  assert.ok(csp.includes("default-src 'none'"), 'the default must stay closed')
})

test('no remote origin is allowed to load into the renderer', () => {
  assert.ok(!/https?:\/\/(?!localhost)/.test(csp), `CSP names a remote origin: ${csp}`)
})
