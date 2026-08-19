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

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // Only the extension talks to this; a web page must never be able to
    // probe it from a tab the user happens to have open.
    'Access-Control-Allow-Origin': 'chrome-extension://*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  })
  res.end(payload)
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
async function fetchImage(url) {
  if (url.startsWith('data:')) {
    const [head, b64] = url.split(',')
    const ext = extForMime(head.slice(5).replace(/;base64$/, ''))
    if (!ext) throw new Error('unsupported format')
    return { buffer: Buffer.from(b64, 'base64'), ext }
  }

  const res = await net.fetch(url)
  if (!res.ok) throw new Error(`source responded ${res.status}`)
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

export function startServer(onSaved) {
  if (server) return serverStatus()

  server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {})
    if (req.method !== 'POST' || req.url !== '/save') return send(res, 404, { error: 'not found' })

    const token = await getToken()
    const header = req.headers.authorization || ''
    if (header !== `Bearer ${token}`) return send(res, 401, { error: 'unauthorized' })

    const { libraryRoot } = await readSettings()
    if (!libraryRoot) return send(res, 409, { error: 'no library chosen' })

    let tmp = null
    try {
      const { url, pageUrl } = JSON.parse(await readBody(req))
      if (!url) return send(res, 400, { error: 'missing url' })

      let buffer
      let ext
      try {
        ;({ buffer, ext } = await fetchImage(url))
      } catch (err) {
        return send(res, 415, { error: err.message })
      }

      tmp = join(tmpdir(), `zbirka-${Date.now()}${ext}`)
      await writeFile(tmp, buffer)
      if (!kindOf(tmp)) return send(res, 415, { error: 'unsupported format' })

      // A correct content-type header is not proof of correct bytes.
      // Decoding the image is, and it costs a few milliseconds.
      if (kindOf(tmp) === 'image' && ext !== '.svg') {
        try {
          await sharp(tmp).metadata()
        } catch {
          return send(res, 415, { error: 'not a decodable image' })
        }
      }

      const item = await ingestFile(libraryRoot, tmp, { sourceUrl: pageUrl || url })
      onSaved?.(item)
      send(res, 200, { ok: true, id: item.id, title: item.title })
    } catch (err) {
      send(res, 500, { error: err.message || 'save failed' })
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
