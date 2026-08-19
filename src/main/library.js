import { app } from 'electron'
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'

// Library layout. The core decision of this project: the folder is the
// source of truth.
//
//   MyLibrary/
//   ├─ items/2026/08/<id>.png     original
//   ├─ items/2026/08/<id>.json    sidecar: tags, note, source
//   └─ .zbirka/thumbs/<id>.webp   cache, always rebuildable
//
// Everything under .zbirka/ can be deleted — the index rebuilds from
// the sidecars.

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
  await mkdir(dirname(SETTINGS()), { recursive: true })
  await writeFile(SETTINGS(), JSON.stringify(next, null, 2))
  return next
}

export const itemsDir = (root) => join(root, 'items')
export const cacheDir = (root) => join(root, '.zbirka')
export const thumbsDir = (root) => join(root, '.zbirka', 'thumbs')

export async function ensureLibrary(root) {
  await mkdir(itemsDir(root), { recursive: true })
  await mkdir(thumbsDir(root), { recursive: true })
  return root
}

// Walks items/ recursively and returns every sidecar path.
async function walkSidecars(dir, out = []) {
  let entries = []
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
// database, but it proves the library is self-contained. SQLite arrives
// in M2, when full-text search needs it.
export async function loadIndex(root) {
  const files = await walkSidecars(itemsDir(root))
  const items = []
  for (const f of files) {
    try {
      const meta = JSON.parse(await readFile(f, 'utf8'))
      const file = join(dirname(f), meta.file)
      await stat(file) // original is gone — skip the record
      items.push({ ...meta, path: file, thumb: join(thumbsDir(root), `${meta.id}.webp`) })
    } catch {
      // broken sidecar or missing original — skip quietly
    }
  }
  items.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
  return items
}
