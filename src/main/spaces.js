import { randomUUID } from 'node:crypto'
import { readFile, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { spacesDir, writeAtomic } from './library.js'

// A space is a board: a set of positioned nodes referencing library
// items. It lives beside items/ rather than inside .bowerbird/ because it
// is authored work, not a derivable cache — deleting the cache must
// never destroy a moodboard.
//
// Node ids are separate from item ids on purpose: the same image has to
// be placeable on a board twice. That cannot be retrofitted later.
//
// Viewport is deliberately NOT stored here. Pan and zoom live in
// settings.json keyed by space id, so a pan gesture does not generate a
// file revision in Dropbox.

export const SPACE_SCHEMA = 1

const newId = () => randomUUID().replace(/-/g, '').slice(0, 12)
const filePath = (root, id) => join(spacesDir(root), `${id}.json`)

function normalise(space) {
  return {
    schema: SPACE_SCHEMA,
    id: space.id,
    name: space.name || 'Untitled',
    createdAt: space.createdAt,
    updatedAt: new Date().toISOString(),
    nodes: (space.nodes || []).map((n) => ({
      nodeId: n.nodeId,
      type: n.type || 'item',
      itemId: n.itemId,
      x: Math.round(n.x),
      y: Math.round(n.y),
      w: Math.round(n.w),
      h: Math.round(n.h),
      z: n.z ?? 0,
      rotation: n.rotation || 0,
      opacity: n.opacity ?? 1,
    })),
  }
}

// The list view only needs a summary. Reading full node arrays for every
// space would make opening the picker O(total nodes in the library).
export async function listSpaces(root) {
  let names
  try {
    names = (await readdir(spacesDir(root))).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }

  const out = []
  for (const name of names) {
    try {
      const s = JSON.parse(await readFile(join(spacesDir(root), name), 'utf8'))
      out.push({
        id: s.id,
        name: s.name,
        updatedAt: s.updatedAt,
        nodeCount: (s.nodes || []).length,
        coverItemId: s.nodes?.[0]?.itemId ?? null,
      })
    } catch {
      // unreadable space file — skip, same tolerance as the item index
    }
  }
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

export async function readSpace(root, id) {
  const s = JSON.parse(await readFile(filePath(root, id), 'utf8'))
  return { ...s, nodes: s.nodes || [] }
}

export async function writeSpace(root, space) {
  const next = normalise(space)
  await writeAtomic(filePath(root, next.id), JSON.stringify(next, null, 2))
  return next
}

export async function createSpace(root, name) {
  const now = new Date().toISOString()
  return writeSpace(root, {
    id: newId(),
    name: name || 'Untitled',
    createdAt: now,
    nodes: [],
  })
}

export async function removeSpace(root, id) {
  try {
    await unlink(filePath(root, id))
  } catch {
    /* already gone */
  }
  return true
}

export const newNodeId = () => `n${randomUUID().replace(/-/g, '').slice(0, 11)}`
