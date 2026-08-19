import { useCallback, useEffect, useMemo, useState } from 'react'

const api = window.zbirka

// Owns the library: which folder, what is in it, and every mutation.
// Extracted from App.jsx so both the grid and the canvas can read the
// same items without prop-drilling through a shell component.
export function useLibrary({ onToast } = {}) {
  const [root, setRoot] = useState(null)
  const [items, setItems] = useState([])
  const [trashed, setTrashed] = useState([])
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(null)

  // The canvas resolves an itemId per node on every render. Without this
  // map that is items.find() per node — O(nodes × items) each frame.
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const refresh = useCallback(async (dir) => {
    if (!dir) return
    const { items: next, trashed: gone } = await api.loadLibrary(dir)
    setItems(next)
    setTrashed(gone)
  }, [])

  useEffect(() => {
    ;(async () => {
      const current = await api.currentLibrary()
      setRoot(current)
      await refresh(current)
      setLoading(false)
    })()
    return api.onEvent((e) => {
      if (e.type === 'import:progress') {
        setProgress(e.done < e.total ? { done: e.done, total: e.total } : null)
      }
    })
  }, [refresh])

  const chooseLibrary = useCallback(async () => {
    const dir = await api.chooseLibrary()
    if (!dir) return null
    setRoot(dir)
    await refresh(dir)
    return dir
  }, [refresh])

  // Returns the items that were actually added, so the caller can place
  // them on a canvas at the drop point.
  const addPaths = useCallback(
    async (paths, opts) => {
      if (!root || !paths?.length) return []
      setProgress({ done: 0, total: paths.length })
      const { added, skipped, duplicates } = await api.addItems(root, paths, opts)
      setProgress(null)
      if (added.length) await refresh(root)

      const notes = []
      if (added.length) notes.push(`Added ${added.length}`)
      if (duplicates.length) notes.push(`${duplicates.length} already in library`)
      if (skipped.length) notes.push(`${skipped.length} skipped`)
      if (notes.length) onToast?.(notes.join(' · '))

      return added
    },
    [root, refresh, onToast]
  )

  const addViaDialog = useCallback(async () => {
    const paths = await api.addFilesDialog(root)
    return paths ? addPaths(paths) : []
  }, [root, addPaths])

  const updateItem = useCallback(async (item, patch) => {
    const next = await api.updateItem(item, patch)
    const merged = { ...item, ...next }
    setItems((prev) => prev.map((i) => (i.id === item.id ? merged : i)))
    return merged
  }, [])

  // Trash stamps deletedAt rather than moving anything, so undo is one
  // more sidecar write and the file never leaves its folder.
  const trashItems = useCallback(
    async (list) => {
      if (!list.length) return
      await api.trashItems(list)
      await refresh(root)
      onToast?.(`Moved ${list.length} to trash`, {
        label: 'Undo',
        run: async () => {
          await api.restoreItems(list)
          await refresh(root)
        },
      })
    },
    [root, refresh, onToast]
  )

  return {
    root, items, trashed, byId, loading, progress,
    chooseLibrary, refresh, addPaths, addViaDialog, updateItem, trashItems,
  }
}
