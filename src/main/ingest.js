import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'
import { itemsDir, thumbsDir } from './library.js'

const run = promisify(execFile)

const IMAGE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.tif', '.tiff', '.svg',
])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm'])

export const kindOf = (p) => {
  const ext = extname(p).toLowerCase()
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  return null
}

export const isSupported = (p) => kindOf(p) !== null

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

// Thumbnails are webp, 640px on the long side, stored in the cache
// directory rather than next to the original.
async function imageThumb(src, dest) {
  await sharp(src, { animated: false })
    .rotate()
    .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(dest)
}

// ffmpeg writes "Duration: 00:01:23.45" to stderr. Cheaper than shipping
// a second binary just to read one number.
function parseDuration(stderr) {
  const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderr || '')
  if (!m) return null
  return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])
}

// Poster frame at 1s — far enough in to skip fade-ins and black leaders,
// early enough that clips shorter than a second still work via -ss 0.
async function videoThumb(src, dest) {
  let stderr = ''
  for (const seek of ['00:00:01', '00:00:00']) {
    try {
      const res = await run(ffmpegPath, [
        '-hide_banner', '-loglevel', 'info',
        '-ss', seek, '-i', src,
        '-frames:v', '1', '-vf', 'scale=640:-2:flags=lanczos',
        '-f', 'webp', '-quality', '82', '-y', dest,
      ])
      stderr = res.stderr
      return { duration: parseDuration(stderr) }
    } catch (err) {
      stderr = err.stderr || ''
    }
  }
  throw new Error('ffmpeg could not extract a frame')
}

// One file in: original into items/YYYY/MM/, sidecar beside it,
// thumbnail into the rebuildable cache.
export async function ingestFile(root, srcPath, extra = {}) {
  const kind = kindOf(srcPath)
  if (!kind) return { skipped: 'unsupported format', srcPath }

  const now = new Date()
  const dir = join(
    itemsDir(root),
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0')
  )
  await mkdir(dir, { recursive: true })

  const id = randomUUID().slice(0, 12)
  const ext = extname(srcPath).toLowerCase()
  const dest = join(dir, `${id}${ext}`)
  const thumb = join(thumbsDir(root), `${id}.webp`)

  await copyFile(srcPath, dest)

  let width = null
  let height = null
  let duration = null

  if (kind === 'image') {
    try {
      const meta = await sharp(dest).metadata()
      width = meta.width ?? null
      height = meta.height ?? null
    } catch {
      // SVG without intrinsic size, or a corrupt file — not fatal
    }
    try {
      await imageThumb(dest, thumb)
    } catch {
      // no thumbnail — the renderer falls back to the original
    }
  } else {
    try {
      ;({ duration } = await videoThumb(dest, thumb))
      // The poster frame carries the video's dimensions, so one probe
      // covers both without a separate ffprobe binary.
      const meta = await sharp(thumb).metadata()
      width = meta.width ?? null
      height = meta.height ?? null
    } catch {
      // unreadable video — it still lands in the library, just without
      // a poster frame; the renderer shows a placeholder
    }
  }

  const meta = {
    id,
    file: `${id}${ext}`,
    kind,
    title: basename(srcPath, ext),
    addedAt: now.toISOString(),
    sha256: await sha256(dest),
    width,
    height,
    duration,
    tags: [],
    note: '',
    sourceUrl: extra.sourceUrl || null,
  }

  await writeFile(join(dir, `${id}.json`), JSON.stringify(meta, null, 2))
  return { ...meta, path: dest, thumb }
}

// The sidecar is the only place metadata is written.
export async function updateSidecar(item, patch) {
  const sidecar = item.path.replace(/\.[^.]+$/, '.json')
  const next = { ...JSON.parse(await readFile(sidecar, 'utf8')), ...patch }
  await writeFile(sidecar, JSON.stringify(next, null, 2))
  return next
}

// Deletes original, sidecar and thumbnail. No trash yet — see M2.
export async function removeItem(item) {
  const sidecar = item.path.replace(/\.[^.]+$/, '.json')
  for (const f of [item.path, sidecar, item.thumb]) {
    try {
      await unlink(f)
    } catch {
      /* already gone */
    }
  }
}
