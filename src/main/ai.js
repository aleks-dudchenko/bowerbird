import { embedImage, embedText, loadStore, saveStore, semanticSearch } from './clip.js'
import { loadIndex } from './library.js'
import { updateSidecar } from './ingest.js'
import { nearest, cosine } from '../shared/vector.js'
import { AUTO_TAGS } from '../shared/vocabulary.js'

let cancelled = false
export const cancelIndexing = () => { cancelled = true }

/**
 * Embed everything that has no vector yet. The store is a cache keyed by
 * item id, so this is resumable: interrupting it loses nothing but the
 * item in flight.
 */
export async function indexLibrary(root, onProgress) {
  cancelled = false
  const { items } = await loadIndex(root)
  const store = await loadStore(root)
  const pending = items.filter((i) => !store.has(i.id))

  for (const [n, item] of pending.entries()) {
    if (cancelled) break
    try {
      store.set(item.id, await embedImage(item.thumb, (p) => onProgress?.({ phase: 'model', ...p })))
    } catch {
      // an unreadable thumbnail should not stop the run
    }
    onProgress?.({ phase: 'index', done: n + 1, total: pending.length })
    if (n % 25 === 24) await saveStore(root, store)
  }

  await saveStore(root, store)
  return { indexed: pending.length, total: store.size, cancelled }
}

export async function query(root, text, k) {
  return semanticSearch(root, text, k)
}

// Label embeddings are computed once per run and reused across items.
export async function autoTag(root, items, onProgress) {
  const labels = []
  for (const [tag, prompt] of AUTO_TAGS) labels.push([tag, await embedText(prompt)])

  const store = await loadStore(root)
  let tagged = 0

  for (const [n, item] of items.entries()) {
    const vec = store.get(item.id) ?? (await embedImage(item.thumb).catch(() => null))
    if (vec) {
      const scored = labels
        .map(([tag, lab]) => ({ tag, score: cosine(vec, lab) }))
        .sort((a, b) => b.score - a.score)
      // A relative cut: CLIP's absolute similarities are low and vary by
      // image, so "within 85% of the best match" beats a fixed threshold.
      const best = scored[0].score
      const chosen = scored.filter((s) => s.score >= best * 0.85).slice(0, 5).map((s) => s.tag)
      await updateSidecar(item, { autoTags: chosen })
      tagged += 1
    }
    onProgress?.({ phase: 'autotag', done: n + 1, total: items.length })
  }

  return { tagged }
}

export { nearest }
