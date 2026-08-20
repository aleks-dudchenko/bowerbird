import { app } from 'electron'
import { mkdir, readFile, writeFile, readdir, stat, rename, unlink, rm } from 'node:fs/promises'
import { join, dirname, resolve, sep } from 'node:path'
import { migration } from '../shared/migrate.js'

// Library layout. The core decision of this project: the folder is the
// source of truth.
//
//   MyLibrary/
//   ├─ items/2026/08/<id>.png     original
//   ├─ items/2026/08/<id>.json    sidecar: tags, note, source
//   ├─ spaces/<id>.json           authored boards — NOT a cache
//   └─ .bowerbird/                   rebuildable cache only
//      ├─ thumbs/<id>.webp
//      └─ previews/<id>.webp
//
// Everything under .bowerbird/ can be deleted — the index rebuilds from
// the sidecars and spaces survive untouched.

const SETTINGS = () => join(app.getPath('userData'), 'settings.json')

export async function readSettings() {
  try {
    return JSON.parse(await readFile(SETTINGS(), 'utf8'))
  } catch {
    return {}
  }
}

// Settings are patched from several places at once — window bounds, the
// open mode, canvas viewports, the server token. Without serialising, two
// read-modify-write cycles interleave and one of them is simply lost.
export function writeSettings(patch) {
  return withLock(SETTINGS(), async () => {
    const next = { ...(await readSettings()), ...patch }
    await writeAtomic(SETTINGS(), JSON.stringify(next, null, 2))
    return next
  })
}

export const itemsDir = (root) => join(root, 'items')
export const spacesDir = (root) => join(root, 'spaces')
export const cacheDir = (root) => join(root, '.bowerbird')
export const thumbsDir = (root) => join(root, '.bowerbird', 'thumbs')
export const previewsDir = (root) => join(root, '.bowerbird', 'previews')

// One promise chain per path, so concurrent writers to the same file
// queue instead of racing.
const locks = new Map()

export function withLock(key, fn) {
  const previous = locks.get(key) ?? Promise.resolve()
  const next = previous.then(fn, fn)
  // Keep the chain alive but never let a rejection poison later writers.
  locks.set(key, next.then(() => {}, () => {}))
  return next
}

// Spaces are rewritten on every drag commit, so a torn write would cost
// the user real work. Write to a sibling temp file and rename — rename is
// atomic within a filesystem.
//
// The temp name must be unique: a fixed `${path}.tmp` meant two
// concurrent writers shared one scratch file, and the second rename threw
// ENOENT because the first had already moved it away.
let writeCounter = 0
export async function writeAtomic(path, contents) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${writeCounter++}.tmp`
  try {
    await writeFile(tmp, contents)
    await rename(tmp, path)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}

// The cache folder was called .zbirka before the project was renamed. A
// plain rename is not enough: ensureLibrary itself creates the new folder,
// so after one launch the destination always exists and a rename-or-skip
// check would refuse forever, leaving a dead-named folder in the user's
// library permanently. Merge the contents instead.
async function carryOverLegacyCache(root) {
  const legacy = join(root, '.zbirka')
  try {
    await stat(legacy)
  } catch {
    return // nothing to carry over
  }

  const target = cacheDir(root)
  await mkdir(target, { recursive: true })

  for (const entry of await readdir(legacy, { withFileTypes: true })) {
    const from = join(legacy, entry.name)
    const to = join(target, entry.name)
    try {
      await rename(from, to)
    } catch {
      // The destination already exists, so move what is inside it rather
      // than the folder itself.
      if (entry.isDirectory()) {
        await mkdir(to, { recursive: true })
        for (const child of await readdir(from)) {
          await rename(join(from, child), join(to, child)).catch(() => {})
        }
      }
    }
  }

  await rm(legacy, { recursive: true, force: true }).catch(() => {})
}

export async function ensureLibrary(root) {
  await carryOverLegacyCache(root)

  for (const d of [itemsDir(root), spacesDir(root), thumbsDir(root), previewsDir(root)]) {
    await mkdir(d, { recursive: true })
  }
  return root
}

// The bb:// protocol handler would otherwise serve any absolute path on
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
      let meta = JSON.parse(await readFile(f, 'utf8'))

      // Libraries outlive the code that wrote them. Anything derivable
      // from the file is filled in once, here, and written back — an
      // item missing `kind` was invisible to every feature that checks
      // it, with nothing anywhere reporting why.
      const patch = migration(meta)
      if (patch) {
        meta = { ...meta, ...patch }
        await writeAtomic(f, JSON.stringify(meta, null, 2))
      }

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
