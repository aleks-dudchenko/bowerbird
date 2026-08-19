// End-to-end test of the browser-save endpoint.
//
// Runs on its own userData directory so it cannot touch the real
// settings file — the server reads libraryRoot from there, and a test
// that clobbered it would point the user's app at a temp folder.
import { app } from 'electron'

// Without this an async failure leaves Electron sitting on an error
// dialog forever, which reads as a hung test rather than a broken one.
process.on('unhandledRejection', (err) => {
  console.error('\nunhandled rejection:', err)
  app.exit(1)
})
import { rm, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

const BASE = join(tmpdir(), `zbirka-server-${process.pid}`)
app.setPath('userData', join(BASE, 'userData'))

const { ensureLibrary, writeSettings, loadIndex } = await import('../src/main/library.js')
const { startServer, stopServer, getToken, rotateToken, PORT } = await import('../src/main/server.js')

const ROOT = join(BASE, 'lib')
const URL = `http://127.0.0.1:${PORT}/save`

let failures = 0
const ok = (label, cond, extra = '') => {
  if (!cond) failures++
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
}

const post = (body, token) =>
  fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

app.whenReady().then(async () => {
  await rm(BASE, { recursive: true, force: true })
  await mkdir(BASE, { recursive: true })
  await ensureLibrary(ROOT)
  await writeSettings({ libraryRoot: ROOT })

  const png = await sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 30, g: 120, b: 200 } },
  }).png().toBuffer()
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`

  let saved = null
  startServer((item) => { saved = item })
  await new Promise((r) => setTimeout(r, 400))

  console.log('\n1. Authentication')
  const noToken = await post({ url: dataUrl })
  ok('no token is rejected', noToken.status === 401, `got ${noToken.status}`)

  const badToken = await post({ url: dataUrl }, 'not-the-token')
  ok('wrong token is rejected', badToken.status === 401, `got ${badToken.status}`)

  const token = await getToken()
  ok('token is long enough to be worth having', token.length >= 24, `${token.length} chars`)

  console.log('\n2. Routing')
  const wrongPath = await fetch(`http://127.0.0.1:${PORT}/anything`, { method: 'POST' })
  ok('unknown path is a 404, not a crash', wrongPath.status === 404)
  const wrongMethod = await fetch(URL, { method: 'GET' })
  ok('GET is refused', wrongMethod.status === 404)

  console.log('\n3. Saving')
  const res = await post({ url: dataUrl, pageUrl: 'https://example.com/article' }, token)
  const body = await res.json()
  ok('a valid save succeeds', res.status === 200, `got ${res.status}`)
  ok('the response names the new item', !!body.id)

  const { items } = await loadIndex(ROOT)
  ok('the item is in the library', items.length === 1, `${items.length}`)
  ok('sourceUrl is recorded', items[0]?.sourceUrl === 'https://example.com/article', items[0]?.sourceUrl)
  ok('dimensions were probed', items[0]?.width === 300 && items[0]?.height === 200)
  ok('a thumbnail was generated', (await readdir(join(ROOT, '.zbirka', 'thumbs'))).length === 1)
  ok('the callback fired for the open window', saved?.id === body.id)

  console.log('\n4. Validation')
  const noUrl = await post({}, token)
  ok('a request without a url is a 400', noUrl.status === 400, `got ${noUrl.status}`)
  const badFormat = await post({ url: 'data:application/zip;base64,UEsDBA==' }, token)
  ok('an unsupported mime type is refused', badFormat.status === 415, `got ${badFormat.status}`)

  // A hostile page could serve anything under an image content-type, so
  // the bytes themselves have to be checked, not just the header.
  const liar = await post(
    { url: 'data:image/png;base64,VGhpcyBpcyBub3QgYSBQTkcgYXQgYWxsLg==' },
    token
  )
  ok('bytes that are not really an image are refused', liar.status === 415, `got ${liar.status}`)

  const { items: afterBad } = await loadIndex(ROOT)
  ok('nothing bogus reached the library', afterBad.length === 1, `${afterBad.length}`)

  console.log('\n5. Rotation')
  const fresh = await rotateToken()
  ok('rotation produces a different token', fresh !== token)
  const stale = await post({ url: dataUrl }, token)
  ok('the old token stops working immediately', stale.status === 401, `got ${stale.status}`)

  stopServer()
  await rm(BASE, { recursive: true, force: true })
  console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n')
  app.exit(failures ? 1 : 0)
})
