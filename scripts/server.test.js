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
import { createServer } from 'node:http'
import sharp from 'sharp'

const BASE = join(tmpdir(), `bowerbird-server-${process.pid}`)
app.setPath('userData', join(BASE, 'userData'))

const { ensureLibrary, writeSettings, loadIndex } = await import('../src/main/library.js')
const { startServer, stopServer, getToken, rotateToken, whenListening, resolveSource, PORT } =
  await import('../src/main/server.js')

const ROOT = join(BASE, 'lib')
const URL = `http://127.0.0.1:${PORT}/save`

let failures = 0
const ok = (label, cond, extra = '') => {
  if (!cond) failures++
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
}

const EXT_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'

const post = (body, token, origin = EXT_ORIGIN) =>
  fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
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

  // Bail out rather than test against whatever else happens to hold the
  // port. An earlier version slept and hoped, and spent a debugging
  // session talking to a running copy of the app with a different token.
  try {
    await whenListening()
  } catch (err) {
    console.error(`\ncannot bind port ${PORT}: ${err.message}`)
    console.error('close any running copy of Bowerbird and try again\n')
    app.exit(1)
    return
  }

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
  ok('a thumbnail was generated', (await readdir(join(ROOT, '.bowerbird', 'thumbs'))).length === 1)
  ok('the callback fired for the open window', !!saved && saved.id === body.id)

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

  console.log('\n5. CORS')
  // The extension's service worker sends an Origin header. A wildcard
  // inside a scheme is not valid CORS, so the origin has to be echoed
  // back exactly — an earlier version sent "chrome-extension://*", which
  // no browser accepts.
  const preflight = await fetch(URL, {
    method: 'OPTIONS',
    headers: { Origin: EXT_ORIGIN, 'Access-Control-Request-Method': 'POST' },
  })
  ok('preflight succeeds', preflight.status === 204, `got ${preflight.status}`)
  ok('the extension origin is echoed back exactly',
    preflight.headers.get('access-control-allow-origin') === EXT_ORIGIN,
    String(preflight.headers.get('access-control-allow-origin')))
  ok('Authorization is an allowed header',
    (preflight.headers.get('access-control-allow-headers') || '').includes('Authorization'))

  const fromPage = await fetch(URL, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' },
  })
  ok('a web page origin gets no CORS grant',
    !fromPage.headers.get('access-control-allow-origin'),
    String(fromPage.headers.get('access-control-allow-origin')))

  console.log('\n6. Saving from X')

  // A stand-in for video.twimg.com, where one variant is gone and the
  // next is not. Losing a save to a single dead URL is the failure this
  // exists to prevent.
  const origin = createServer((req, res) => {
    if (req.url === '/small.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(png)
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((done) => origin.listen(0, '127.0.0.1', done))
  const at = (path) => `http://127.0.0.1:${origin.address().port}${path}`

  const upgraded = await resolveSource({
    url: 'https://pbs.twimg.com/media/GxK9?format=jpg&name=small',
  })
  ok('an X image is upgraded, keeping the rendered size as a fallback',
    upgraded.length === 2 && upgraded[0].endsWith('name=orig'), upgraded.join(' , '))

  const plain = await resolveSource({ url: 'https://example.com/a.png' })
  ok('a URL from anywhere else is passed through untouched',
    plain.length === 1 && plain[0] === 'https://example.com/a.png', plain.join(' , '))

  let streamed = null
  await resolveSource({ url: 'blob:https://x.com/9f1', pageUrl: 'https://x.com/home' })
    .catch((err) => { streamed = err.message })
  ok('a blob: video with no post behind it explains itself',
    /streamed/.test(streamed || ''), String(streamed))

  const fallback = await post({
    variants: [
      { bitrate: 900, content_type: 'video/mp4', url: at('/gone.mp4') },
      { bitrate: 100, content_type: 'video/mp4', url: at('/small.png') },
    ],
    pageUrl: 'https://x.com/jane/status/1899',
    title: 'A post worth keeping',
  }, token)
  ok('a dead variant falls through to the next one', fallback.status === 200, `got ${fallback.status}`)

  const { items: afterX } = await loadIndex(ROOT)
  const fromX = afterX.find((i) => i.title === 'A post worth keeping')
  ok('the post\u2019s own words become the title', !!fromX)
  ok('the post, not the media file, is recorded as the source',
    fromX?.sourceUrl === 'https://x.com/jane/status/1899', fromX?.sourceUrl)

  const allDead = await post(
    { variants: [{ content_type: 'video/mp4', url: at('/gone.mp4') }] },
    token
  )
  ok('when every variant is dead the failure is reported as upstream',
    allDead.status === 502, `got ${allDead.status}`)

  const nothing = await post({ url: 'blob:https://x.com/9f1' }, token)
  ok('an unresolvable save is a 422, not a 500', nothing.status === 422, `got ${nothing.status}`)

  origin.close()

  console.log('\n7. Rotation')
  const fresh = await rotateToken()
  ok('rotation produces a different token', fresh !== token)
  const stale = await post({ url: dataUrl }, token)
  ok('the old token stops working immediately', stale.status === 401, `got ${stale.status}`)

  stopServer()
  await rm(BASE, { recursive: true, force: true })
  console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n')
  app.exit(failures ? 1 : 0)
})
