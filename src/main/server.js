import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { net } from 'electron'
import { readSettings, writeSettings } from './library.js'
import { ingestFile, kindOf } from './ingest.js'

// A fixed port, because the extension has no way to discover a random
// one. 47821 is outside the registered range and unlikely to collide.
export const PORT = 47821
const MAX_BYTES = 64 * 1024 * 1024

let server = null
let bound = false
let bindError = null

// Pairing window. Copy-pasting a token works but is a poor first run, and
// an endpoint that simply hands the token to anyone would defeat the point
// of having one. The compromise: the token is only obtainable while the
// user has explicitly opened a short window from inside the app, and only
// to a caller whose Origin is an extension — a web page cannot forge that
// header, so no page in an open tab can reach it.
const PAIR_WINDOW_MS = 120_000
let pairingUntil = 0

export function openPairing() {
  pairingUntil = Date.now() + PAIR_WINDOW_MS
  return { until: pairingUntil, seconds: PAIR_WINDOW_MS / 1000 }
}

export const closePairing = () => { pairingUntil = 0 }
export const pairingOpen = () => Date.now() < pairingUntil

export async function getToken() {
  const s = await readSettings()
  if (s.serverToken) return s.serverToken
  const token = randomBytes(24).toString('base64url')
  await writeSettings({ serverToken: token })
  return token
}

export async function rotateToken() {
  const token = randomBytes(24).toString('base64url')
  await writeSettings({ serverToken: token })
  return token
}

// Only extensions may talk to this. A wildcard inside a scheme is not
// valid CORS — the origin has to be echoed back exactly, or refused.
const allowedOrigin = (origin) =>
  origin && origin.startsWith('chrome-extension://') ? origin : null

function send(res, status, body, origin) {
  const allow = allowedOrigin(origin)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...(allow
      ? {
          'Access-Control-Allow-Origin': allow,
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          Vary: 'Origin',
        }
      : {}),
  })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > 1_000_000) {
        reject(new Error('request too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// An explicit allowlist rather than a default. Falling back to .jpg for
// an unrecognised type let a zip through as an image: the bytes landed in
// the library under an extension that made them look legitimate.
const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/tiff': '.tiff',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
}

const extForMime = (type) => MIME_EXT[String(type).split(';')[0].trim().toLowerCase()] ?? null

// The extension sends a URL rather than bytes, so the download happens
// here where Electron's network stack (and the user's proxy settings)
// apply. Data URLs are accepted too, for canvas-rendered images.
// Plenty of hosts — Wikimedia among them — reject requests with no
// User-Agent, and CDNs commonly hotlink-protect by Referer. Without both
// of these the extension fails on a large share of the real web.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Bowerbird/0.4 Safari/537.36'

async function fetchImage(url, pageUrl) {
  if (url.startsWith('data:')) {
    const [head, b64] = url.split(',')
    const ext = extForMime(head.slice(5).replace(/;base64$/, ''))
    if (!ext) throw new Error('unsupported format')
    return { buffer: Buffer.from(b64, 'base64'), ext }
  }

  // Referer must go through the spec's `referrer` option, not a header:
  // it is a forbidden header name, and setting it by hand makes Electron
  // reject the whole request with ERR_BLOCKED_BY_CLIENT.
  const res = await net.fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'image/*,video/*;q=0.9,*/*;q=0.8' },
    ...(pageUrl ? { referrer: pageUrl } : {}),
  })
  if (!res.ok) {
    const err = new Error(`the source refused the download (${res.status})`)
    err.upstream = true
    throw err
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_BYTES) throw new Error('file too large')

  // Trust the declared type first, then the URL's own extension. If
  // neither names something we support, refuse rather than guess.
  const ext = extForMime(res.headers.get('content-type'))
    ?? (kindOf(`x${extname(new URL(url).pathname).toLowerCase()}`)
      ? extname(new URL(url).pathname).toLowerCase()
      : null)
  if (!ext) throw new Error('unsupported format')
  return { buffer, ext }
}

// Saves used to be titled after the temp file they arrived in —
// "bowerbird-1787217222181", which tells the user nothing. Use the image's
// own filename, then the page it came from.
export function titleFor(url, pageUrl) {
  try {
    if (!url.startsWith('data:')) {
      const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
      const stem = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
      if (stem && !/^\d+$/.test(stem)) return stem.slice(0, 120)
    }
    if (pageUrl) {
      const u = new URL(pageUrl)
      const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '')
      const stem = last.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
      return (stem ? `${stem} — ${u.hostname}` : u.hostname).slice(0, 120)
    }
  } catch {
    /* an unparseable URL just falls through to the default */
  }
  return 'Saved from the web'
}

export function startServer(onSaved) {
  if (server) return serverStatus()

  server = createServer(async (req, res) => {
    const origin = req.headers.origin
    if (req.method === 'OPTIONS') return send(res, 204, {}, origin)
    if (req.method === 'GET' && req.url !== '/status') {
      return send(res, 404, { error: 'not found' }, origin)
    }
    // Lets the options page show live state instead of asking the user to
    // race a timer they cannot see. Reveals nothing secret: whether the
    // app is up, and whether the user has opened a window.
    if (req.method === 'GET' && req.url === '/status') {
      if (!allowedOrigin(origin)) {
        return send(res, 403, { error: 'extensions only' }, origin)
      }
      return send(res, 200, { running: true, pairing: pairingOpen() }, origin)
    }

    if (req.method === 'POST' && req.url === '/pair') {
      if (!allowedOrigin(origin)) {
        return send(res, 403, { error: 'only a browser extension can pair' }, origin)
      }
      if (!pairingOpen()) {
        return send(
          res,
          403,
          { error: 'open Settings in Bowerbird and click Pair extension first' },
          origin
        )
      }
      closePairing() // single use: a window that stays open is not a window
      return send(res, 200, { token: await getToken() }, origin)
    }

    if (req.method !== 'POST' || req.url !== '/save') {
      return send(res, 404, { error: 'not found' }, origin)
    }

    const token = await getToken()
    const header = req.headers.authorization || ''
    if (header !== `Bearer ${token}`) return send(res, 401, { error: 'unauthorized' }, origin)

    const { libraryRoot } = await readSettings()
    if (!libraryRoot) return send(res, 409, { error: 'no library chosen' }, origin)

    let tmp = null
    try {
      const { url, pageUrl } = JSON.parse(await readBody(req))
      if (!url) return send(res, 400, { error: 'missing url' }, origin)

      let buffer
      let ext
      try {
        ;({ buffer, ext } = await fetchImage(url, pageUrl))
      } catch (err) {
        // A refusal from the far end is not "unsupported format" — saying
        // so sent people looking in entirely the wrong place.
        return send(res, err.upstream ? 502 : 415, { error: err.message }, origin)
      }

      tmp = join(tmpdir(), `bowerbird-${Date.now()}${ext}`)
      await writeFile(tmp, buffer)
      if (!kindOf(tmp)) return send(res, 415, { error: 'unsupported format' }, origin)

      // A correct content-type header is not proof of correct bytes.
      // Decoding the image is, and it costs a few milliseconds.
      if (kindOf(tmp) === 'image' && ext !== '.svg') {
        try {
          await sharp(tmp).metadata()
        } catch {
          return send(res, 415, { error: 'not a decodable image' }, origin)
        }
      }

      const item = await ingestFile(libraryRoot, tmp, {
        sourceUrl: pageUrl || url,
        title: titleFor(url, pageUrl),
      })
      onSaved?.(item)
      send(res, 200, { ok: true, id: item.id, title: item.title }, origin)
    } catch (err) {
      send(res, 500, { error: err.message || 'save failed' }, origin)
    } finally {
      if (tmp) await unlink(tmp).catch(() => {})
    }
  })

  // Failing to bind used to leave the app quietly not listening, with no
  // way for the user to find out why the extension had stopped working.
  server.on('error', (err) => {
    bound = false
    bindError =
      err.code === 'EADDRINUSE'
        ? `Port ${PORT} is already in use by another program.`
        : err.message
  })
  server.listen(PORT, '127.0.0.1', () => {
    bound = true
    bindError = null
  })
  return serverStatus()
}

export function stopServer() {
  server?.close()
  server = null
  bound = false
  bindError = null
}

export const serverStatus = () => ({ running: bound, port: PORT, error: bindError })

/** Resolves once the socket is listening, or rejects with the bind error. */
export function whenListening(timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = () => {
      if (bound) return resolve(serverStatus())
      if (bindError) return reject(new Error(bindError))
      if (Date.now() - started > timeoutMs) return reject(new Error('server did not start'))
      setTimeout(poll, 25)
    }
    poll()
  })
}
