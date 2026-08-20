// Pairing must be reachable by an extension during the window the user
// opened, and by nothing else at any other time.
import { app } from 'electron'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rm, mkdir } from 'node:fs/promises'

process.on('unhandledRejection', (err) => { console.error(err); app.exit(1) })

const BASE = join(tmpdir(), `zbirka-pair-${process.pid}`)
app.setPath('userData', join(BASE, 'userData'))

const { ensureLibrary, writeSettings } = await import('../src/main/library.js')
const { startServer, stopServer, whenListening, getToken, openPairing, PORT } =
  await import('../src/main/server.js')

const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
let failures = 0
const ok = (label, cond, extra = '') => {
  if (!cond) failures++
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
}
const pair = (origin) =>
  fetch(`http://127.0.0.1:${PORT}/pair`, {
    method: 'POST',
    headers: origin ? { Origin: origin } : {},
  })

app.whenReady().then(async () => {
  await rm(BASE, { recursive: true, force: true })
  await mkdir(BASE, { recursive: true })
  await ensureLibrary(join(BASE, 'lib'))
  await writeSettings({ libraryRoot: join(BASE, 'lib') })

  startServer(() => {})
  try {
    await whenListening()
  } catch (err) {
    console.error(`\ncannot bind port ${PORT}: ${err.message}`)
    console.error('close any running copy of Zbirka and try again\n')
    app.exit(1)
    return
  }

  console.log('\n1. Closed by default')
  const before = await pair(EXT)
  ok('pairing is refused before the user opens it', before.status === 403, `got ${before.status}`)

  console.log('\n2. Only extensions may ask')
  openPairing()
  const fromPage = await pair('https://evil.example.com')
  ok('a web page is refused even inside the window', fromPage.status === 403)
  const noOrigin = await pair(null)
  ok('a request with no origin is refused', noOrigin.status === 403)

  console.log('\n3. Inside the window')
  const res = await pair(EXT)
  const body = await res.json()
  ok('an extension gets the token', res.status === 200, `got ${res.status}`)
  ok('the token matches the one the app holds', body.token === (await getToken()))

  console.log('\n4. Single use')
  const again = await pair(EXT)
  ok('the window closes after one pairing', again.status === 403, `got ${again.status}`)

  stopServer()
  await rm(BASE, { recursive: true, force: true })
  console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n')
  app.exit(failures ? 1 : 0)
})
