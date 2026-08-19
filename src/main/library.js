import { app } from 'electron'
import { mkdir, readFile, writeFile, readdir, stat, rename } from 'node:fs/promises'
import { join, dirname, resolve, sep } from 'node:path'

// Library layout. The core decision of this project: the folder is the
// source of truth.
//
//   MyLibrary/
//   ├─ items/2026/08/<id>.png     original
//   ├─ items/2026/08/<id>.json    sidecar: tags, note, source
//   ├─ spaces/<id>.json           authored boards — NOT a cache
//   └─ .zbirka/                   rebuildable cache only
//      ├─ thumbs/<id>.webp
//      └─ previews/<id>.webp
//
// Everything under .zbirka/ can be deleted — the index rebuilds from
// the sidecars and spaces survive untouched.

const SETTINGS = () => join(app.getPath('userData'), 'settings.json')

export async function readSettings() {
  try {
    return JSON.parse(await readFile(SETTINGS(), 'utf8'))
  } catch {
    return {}
  }
}

export async function writeSettings(patch) {
  const next = { ...(await readSettings()), ...patch }
  await writeAtomic(SETTINGS(), JSON.stringify(next, null, 2))
  return next
}

export const itemsDir = (root) => join(root, 'items')
export const spacesDir = (root) => join(root, 'spaces')
export const cacheDir = (root) => join(root, '.zbirka')
export const thumbsDir = (root) => join(root, '.zbirka', 'thumbs')
export const previewsDir = (root) => join(root, '.zbirka', 'previews')

// Spaces are rewritten on every drag commit, so a torn write would cost
// the user real work. Write to a sibling temp file and rename — rename
// is atomic within a filesystem.
export async function writeAtomic(path, contents) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, contents)
  await rename(tmp, path)
}

export async function ensureLibrary(root) {
  for (const d of [itemsDir(root), spacesDir(root), thumbsDir(root), previewsDir(root)]) {
    await mkdir(d, { recursive: true })
  }
  return root
}

// The zb:// protocol handler would otherwise serve any absolute path on
// disk to the renderer. It is only ever asked for files inside the
// library, so confine it there and keep the current root in memory
// rather than re-reading settings on every image request.
let allowedRoot = null
export const setAllowedRoot = (root) => { allowedRoot = root }

export function isInsideLibrary(path) {
  if (!allowedRoot) return false
  const base = resolve(allowedRoot)
  const target = resolve(path)
  return target === base || target.startsWith(base + sep)
}

// Walks items/ recursively and returns every sidecar path.
async function walkSidecars(dir, out = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) await walkSidecars(full, out)
    else if (e.name.endsWith('.json')) out.push(full)
  }
  return out
}

// The index is rebuilt from sidecars on every launch. Slower than a
// database, but it proves the library is self-contained. A persistent
// index lands when search needs one.
//
// Returns { items, trashed, bySha } — bySha powers duplicate detection
// on import without a second pass over the disk.
export async function loadIndex(root) {
  const files = await walkSidecars(itemsDir(root))
  const items = []
  const trashed = []
  const bySha = new Map()

  for (const f of files) {
    try {
      const meta = JSON.parse(await readFile(f, 'utf8'))
      const file = join(dirname(f), meta.file)
      await stat(file) // original is gone — skip the record
      const record = {
        ...meta,
        path: file,
        thumb: join(thumbsDir(root), `${meta.id}.webp`),
      }
      if (meta.sha256 && !bySha.has(meta.sha256)) bySha.set(meta.sha256, meta.id)
      if (meta.deletedAt) trashed.push(record)
      else items.push(record)
    } catch {
      // broken sidecar or missing original — skip quietly
    }
  }

  const newestFirst = (a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')
  items.sort(newestFirst)
  trashed.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
  return { items, trashed, bySha: [...bySha] }
}
