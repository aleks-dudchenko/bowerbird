// Sidecars written by older versions are missing fields the current code
// branches on. Anything derivable from the file itself is filled in;
// anything that is a genuine user decision is left alone.
//
// This matters more than it sounds: an item imported before `kind`
// existed was silently skipped by every feature that checks it — OCR,
// the video badge, the detail panel — with no error anywhere.

export const SCHEMA = 1

const IMAGE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.tif', '.tiff', '.svg',
  '.heic', '.heif', '.pdf',
])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm'])

function kindFromFile(file) {
  const dot = String(file || '').lastIndexOf('.')
  if (dot === -1) return null
  const ext = file.slice(dot).toLowerCase()
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  return null
}

/**
 * Returns the patch needed to bring a sidecar up to date, or null when it
 * is already current. Returning a patch rather than a whole object keeps
 * the caller from rewriting files that do not need it.
 */
export function migration(meta) {
  const patch = {}

  if (meta.schema !== SCHEMA) patch.schema = SCHEMA
  if (!meta.kind) {
    const kind = kindFromFile(meta.file)
    if (kind) patch.kind = kind
  }
  if (!Array.isArray(meta.tags)) patch.tags = []
  if (!Array.isArray(meta.collections)) patch.collections = []
  if (!Array.isArray(meta.autoTags)) patch.autoTags = []
  if (!Array.isArray(meta.colors)) patch.colors = []
  if (typeof meta.favourite !== 'boolean') patch.favourite = false
  if (meta.deletedAt === undefined) patch.deletedAt = null
  if (meta.ocr === undefined) patch.ocr = null
  if (meta.note == null) patch.note = ''

  return Object.keys(patch).length ? patch : null
}

/** The migrated record, without touching disk. */
export const migrated = (meta) => {
  const patch = migration(meta)
  return patch ? { ...meta, ...patch } : meta
}
