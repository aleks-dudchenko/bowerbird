import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, access, unlink } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import sharp from 'sharp'
import { shell } from 'electron'
import { itemsDir, thumbsDir, writeAtomic } from './library.js'
import { extractPalette } from './palette.js'
import { SCHEMA } from '../shared/migrate.js'
import { videoPoster, quickLookThumb, recogniseText } from './helper.js'

const IMAGE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.tif', '.tiff', '.svg',
])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm'])
// sharp decodes HEIC but not PDF. Both go through QuickLook instead, so
// there is a single code path for "the system already knows how to
// preview this" rather than a second image library.
const SYSTEM_EXT = new Set(['.heic', '.heif', '.pdf'])

export const kindOf = (p) => {
  const ext = extname(p).toLowerCase()
  if (IMAGE_EXT.has(ext) || SYSTEM_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  return null
}

export const needsSystemPreview = (p) => SYSTEM_EXT.has(extname(p).toLowerCase())

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

// Video frames used to come from a bundled ffmpeg whose binary declares
// itself "not legally redistributable". AVFoundation does the same job
// through the helper, with hardware decoding and no licence problem.
async function videoThumb(src, dest) {
  const tmp = `${dest}.jpg`
  const { duration } = await videoPoster(src, tmp)
  await sharp(tmp)
    .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(dest)
  await unlink(tmp).catch(() => {})
  return { duration }
}

// PDF and HEIC go through QuickLook, then get normalised to webp like
// everything else so the renderer has one format to deal with.
async function systemThumb(src, dest) {
  const tmp = `${dest}.jpg`
  await quickLookThumb(src, tmp, 640)
  await sharp(tmp)
    .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(dest)
  await unlink(tmp).catch(() => {})
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

  // randomUUID().slice(0, 12) kept a literal dash and left only 44 bits
  // of entropy. Strip the dashes and check the destination before
  // copying — a silent overwrite would destroy someone's reference.
  const ext = extname(srcPath).toLowerCase()
  let id
  let dest
  for (let attempt = 0; ; attempt++) {
    id = randomUUID().replace(/-/g, '').slice(0, 12)
    dest = join(dir, `${id}${ext}`)
    try {
      await access(dest)
      if (attempt > 4) throw new Error('could not allocate a free id')
    } catch (err) {
      if (err.message === 'could not allocate a free id') throw err
      break // access() threw ENOENT, so the path is free
    }
  }
  const thumb = join(thumbsDir(root), `${id}.webp`)

  await copyFile(srcPath, dest)

  let width = null
  let height = null
  let duration = null

  if (kind === 'image') {
    if (needsSystemPreview(dest)) {
      try {
        await systemThumb(dest, thumb)
        const meta = await sharp(thumb).metadata()
        width = meta.width ?? null
        height = meta.height ?? null
      } catch {
        // unpreviewable — it still enters the library, just without art
      }
    } else {
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

  // The palette is read from the thumbnail rather than the original: it
  // is already downscaled, and a 6000px source would dominate import.
  const colors = await extractPalette(thumb).catch(() => [])

  const meta = {
    schema: SCHEMA,
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
    ocr: null,
    ocrAt: null,
    autoTags: [],
    colors,
    favourite: false,
    collections: [],
    sourceUrl: extra.sourceUrl || null,
    deletedAt: null,
  }

  await writeAtomic(join(dir, `${id}.json`), JSON.stringify(meta, null, 2))
  return { ...meta, path: dest, thumb }
}

// The sidecar is the only place metadata is written.
export async function updateSidecar(item, patch) {
  const sidecar = item.path.replace(/\.[^.]+$/, '.json')
  const next = { ...JSON.parse(await readFile(sidecar, 'utf8')), ...patch }
  await writeAtomic(sidecar, JSON.stringify(next, null, 2))
  return next
}

// Trashing does not move files. It stamps deletedAt in the sidecar and
// loadIndex filters those out. No file movement means no sync conflicts
// in a Dropbox folder, and restoring is clearing one field.
export async function trashItem(item) {
  return updateSidecar(item, { deletedAt: new Date().toISOString() })
}

export async function restoreItem(item) {
  return updateSidecar(item, { deletedAt: null })
}

// Emptying the trash hands the originals to the OS trash rather than
// unlinking them, so Finder remains the last line of recovery.
export async function purgeItem(item) {
  const sidecar = item.path.replace(/\.[^.]+$/, '.json')
  for (const f of [item.path, sidecar, item.thumb]) {
    try {
      await shell.trashItem(f)
    } catch {
      /* already gone, or not trashable — nothing to recover either way */
    }
  }
  return true
}


// Existing libraries predate the palette field. Rather than a migration
// step at launch, colours are filled in lazily on request with progress
// reported to the window.
export async function backfillPalette(item) {
  const colors = await extractPalette(item.thumb).catch(() => [])
  return updateSidecar(item, { colors, schema: SCHEMA })
}


// OCR is on demand rather than at import: it is the slowest thing the app
// does, and most references are never searched by the text inside them.
export async function runOcr(item) {
  const { text } = await recogniseText(item.path)
  return updateSidecar(item, { ocr: text || null, ocrAt: new Date().toISOString() })
}
