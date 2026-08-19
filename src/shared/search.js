// Full-text search without a database.
//
// The roadmap promised SQLite with FTS5. It is not worth it here: a
// native module rebuilt against Electron's ABI, doubled for a universal
// build, landing in CI right before release — to search a single user's
// library. An inverted index over a few tens of thousands of records is
// a few megabytes and answers in well under a millisecond.
//
// Revisit if a cold launch on a 50k-item library exceeds two seconds.

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'at'])

/**
 * Lowercase word-ish tokens. Compound words are indexed twice — whole and
 * split on camelCase — because "DarkModeDashboard" should be findable by
 * "dashboard", while splitting alone would mangle irregular casing like
 * "MiXeD" into fragments nobody would ever type.
 */
export function tokenize(text) {
  if (!text) return []
  const out = []
  for (const raw of String(text).split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue
    const whole = raw.toLowerCase()
    if (whole.length > 1 && !STOP.has(whole)) out.push(whole)

    const parts = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(' ')
    if (parts.length > 1) {
      for (const part of parts) {
        if (part.length > 1 && !STOP.has(part) && part !== whole) out.push(part)
      }
    }
  }
  return out
}

/** Every searchable string on an item, weighted by how much it means. */
export function fieldsOf(item) {
  return [
    { text: item.title, weight: 3 },
    { text: (item.tags || []).join(' '), weight: 4 },
    { text: item.note, weight: 2 },
    { text: item.ocr, weight: 1 },
    { text: (item.autoTags || []).join(' '), weight: 1 },
  ]
}

/** token -> Map<itemId, score>. */
export function buildIndex(items) {
  const index = new Map()
  for (const item of items) {
    for (const { text, weight } of fieldsOf(item)) {
      for (const token of tokenize(text)) {
        let postings = index.get(token)
        if (!postings) index.set(token, (postings = new Map()))
        postings.set(item.id, (postings.get(item.id) || 0) + weight)
      }
    }
  }
  return index
}

// Prefix matching, so "brut" finds "brutalist" while the user is still
// typing. Exact hits score higher than prefix hits.
function lookup(index, term) {
  const hits = new Map()
  const exact = index.get(term)
  if (exact) for (const [id, s] of exact) hits.set(id, s * 2)
  for (const [token, postings] of index) {
    if (token.length > term.length && token.startsWith(term)) {
      for (const [id, s] of postings) hits.set(id, (hits.get(id) || 0) + s)
    }
  }
  return hits
}

/**
 * All terms must match (AND). Returns ids ordered by descending score.
 * An empty query returns null, meaning "no text filter" rather than
 * "no results" — the caller decides what to show.
 */
export function search(index, query) {
  const terms = tokenize(query)
  if (!terms.length) return null

  let acc = null
  for (const term of terms) {
    const hits = lookup(index, term)
    if (!hits.size) return []
    if (acc === null) {
      acc = hits
    } else {
      const merged = new Map()
      for (const [id, score] of hits) {
        if (acc.has(id)) merged.set(id, acc.get(id) + score)
      }
      acc = merged
    }
    if (!acc.size) return []
  }

  return [...acc].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id)
}

/**
 * The non-text filters. Kept separate from scoring so that facets can be
 * combined with a query, or used on their own.
 */
export function applyFilters(items, { tags, collection, favourite, colour, colourTolerance } = {}) {
  return items.filter((item) => {
    if (tags?.length && !tags.every((t) => (item.tags || []).includes(t))) return false
    if (collection && !(item.collections || []).includes(collection)) return false
    if (favourite && !item.favourite) return false
    if (colour && !matchesColour(item, colour, colourTolerance)) return false
    return true
  })
}

/** Squared distance in RGB. Good enough for "show me the orange ones". */
export const colourDistance = (a, b) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

export function matchesColour(item, target, tolerance = 90) {
  const limit = tolerance ** 2
  return (item.colors || []).some((c) => colourDistance(c, target) <= limit)
}
