// Vector maths for semantic search. Pure, so the retrieval behaviour is
// testable without downloading a 150 MB model.

/** Unit-length copy. CLIP scores are cosine similarities, so this makes
 *  them a plain dot product. */
export function normalise(vec) {
  let sum = 0
  for (const v of vec) sum += v * v
  const len = Math.sqrt(sum) || 1
  return Float32Array.from(vec, (v) => v / len)
}

export function dot(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

/** Cosine similarity, safe on non-normalised input. */
export function cosine(a, b) {
  return dot(normalise(a), normalise(b))
}

/**
 * Brute-force nearest neighbours. At 512 dimensions and 10k items this is
 * a few milliseconds of plain arithmetic, which is why there is no vector
 * database here: adding one would cost more than it saves.
 */
export function nearest(query, entries, k = 40, floor = 0.15) {
  const q = normalise(query)
  const scored = []
  for (const [id, vec] of entries) {
    const score = dot(q, vec)
    if (score >= floor) scored.push({ id, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

/** Pack id-keyed vectors into one flat buffer plus an id list. */
export function pack(entries, dims) {
  const ids = [...entries.keys()]
  const flat = new Float32Array(ids.length * dims)
  ids.forEach((id, i) => flat.set(entries.get(id), i * dims))
  return { ids, dims, data: flat }
}

export function unpack({ ids, dims, data }) {
  const out = new Map()
  const flat = data instanceof Float32Array ? data : new Float32Array(data)
  ids.forEach((id, i) => out.set(id, flat.subarray(i * dims, (i + 1) * dims)))
  return out
}
