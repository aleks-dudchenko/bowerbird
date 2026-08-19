import { useEffect, useMemo, useState } from 'react'
import { buildIndex, search, applyFilters } from '../shared/search.js'

// The index is built in the renderer because the items are already here:
// shipping them to the main process to be indexed and back would cost
// more than the indexing does. Rebuilds on every library change, which is
// a few milliseconds for thousands of items.
export function useSearch(items, root) {
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState(new Set())
  const [collection, setCollection] = useState(null)
  const [favourite, setFavourite] = useState(false)
  const [colour, setColour] = useState(null)
  const [semantic, setSemantic] = useState(false)
  const [semanticIds, setSemanticIds] = useState(null)
  const [thinking, setThinking] = useState(false)

  const index = useMemo(() => buildIndex(items), [items])

  // Semantic search is a round trip to the model, so it is debounced and
  // never runs on every keystroke the way the text index does.
  useEffect(() => {
    if (!semantic || !root || query.trim().length < 3) {
      setSemanticIds(null)
      return
    }
    let cancelled = false
    setThinking(true)
    const timer = setTimeout(async () => {
      try {
        const hits = await window.zbirka.semanticQuery(root, query.trim(), 60)
        if (!cancelled) setSemanticIds(hits.map((h) => h.id))
      } finally {
        if (!cancelled) setThinking(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
      setThinking(false)
    }
  }, [semantic, query, root])

  const results = useMemo(() => {
    const filtered = applyFilters(items, {
      tags: [...tags],
      collection,
      favourite,
      colour,
    })
    const ranked = semantic ? semanticIds : search(index, query)
    if (ranked === null) return filtered

    // Keep search ranking rather than library order — the whole point of
    // scoring is lost if the result set is re-sorted by date afterwards.
    const allowed = new Set(filtered.map((i) => i.id))
    const byId = new Map(items.map((i) => [i.id, i]))
    return ranked.filter((id) => allowed.has(id)).map((id) => byId.get(id))
  }, [items, index, query, tags, collection, favourite, colour, semantic, semanticIds])

  const facets = useMemo(() => {
    const tagCounts = new Map()
    const collections = new Set()
    const swatches = new Map()
    for (const i of items) {
      for (const t of i.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
      for (const c of i.collections || []) collections.add(c)
      const top = (i.colors || [])[0]
      if (top) {
        // Coarse key so the swatch rail shows a dozen colours, not one
        // per image.
        const key = top.map((v) => Math.round(v / 48) * 48).join(',')
        if (!swatches.has(key)) swatches.set(key, top)
      }
    }
    return {
      tags: [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      collections: [...collections].sort(),
      swatches: [...swatches.values()].slice(0, 14),
    }
  }, [items])

  function toggleTag(tag) {
    setTags((prev) => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  const active = !!query || tags.size > 0 || !!collection || favourite || !!colour

  function clear() {
    setQuery('')
    setTags(new Set())
    setCollection(null)
    setFavourite(false)
    setColour(null)
  }

  return {
    query, setQuery, tags, toggleTag, collection, setCollection,
    favourite, setFavourite, colour, setColour,
    semantic, setSemantic, thinking,
    results, facets, active, clear,
  }
}
