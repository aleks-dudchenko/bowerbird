// Dominant-colour extraction, kept pure so the bucketing can be tested
// without decoding an image.

const BITS = 2 // 4 levels per channel = 64 buckets
const LEVELS = 1 << BITS

const bucketOf = (r, g, b) =>
  ((r >> (8 - BITS)) << (BITS * 2)) | ((g >> (8 - BITS)) << BITS) | (b >> (8 - BITS))

/**
 * Reduce raw RGB pixels to the few colours a person would name if asked
 * what the image "is". Near-white and near-black are skipped unless the
 * image is nothing but those, because almost every screenshot has a
 * background that would otherwise win every time.
 */
export function palette(pixels, channels = 3, count = 5) {
  const sums = new Map()

  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    if (channels === 4 && pixels[i + 3] < 128) continue // transparent

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const dull = max < 24 || min > 232 || (max - min < 12 && (max > 200 || max < 48))

    const key = bucketOf(r, g, b)
    let acc = sums.get(key)
    if (!acc) sums.set(key, (acc = { r: 0, g: 0, b: 0, n: 0, weight: 0 }))
    acc.r += r
    acc.g += g
    acc.b += b
    acc.n += 1
    acc.weight += dull ? 0.05 : 1
  }

  if (!sums.size) return []

  const ranked = [...sums.values()].sort((a, b) => b.weight - a.weight).slice(0, count)
  return ranked.map((c) => [
    Math.round(c.r / c.n),
    Math.round(c.g / c.n),
    Math.round(c.b / c.n),
  ])
}

export { LEVELS, bucketOf }
