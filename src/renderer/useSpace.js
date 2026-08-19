import { useCallback, useEffect, useRef, useState } from 'react'

const api = window.zbirka
const COMMIT_DELAY = 600

const newNodeId = () => `n${crypto.randomUUID().replace(/-/g, '').slice(0, 11)}`

// Owns the open space and its persistence. Node mutations land in state
// immediately and hit disk on a trailing debounce — a drag would
// otherwise write the file on every pointer frame.
export function useSpace(root) {
  const [spaces, setSpaces] = useState([])
  const [space, setSpace] = useState(null)
  const timer = useRef(null)
  const pending = useRef(null)

  const flush = useCallback(async () => {
    if (!pending.current || !root) return
    const toWrite = pending.current
    pending.current = null
    clearTimeout(timer.current)
    await api.writeSpace(root, toWrite)
    setSpaces(await api.listSpaces(root))
  }, [root])

  // A pending write must not be lost when the window closes or the user
  // switches boards.
  useEffect(() => {
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [flush])

  const refreshSpaces = useCallback(async () => {
    if (!root) return []
    const list = await api.listSpaces(root)
    setSpaces(list)
    return list
  }, [root])

  useEffect(() => {
    refreshSpaces()
  }, [refreshSpaces])

  const commit = useCallback(
    (next) => {
      setSpace(next)
      pending.current = next
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, COMMIT_DELAY)
    },
    [flush]
  )

  const open = useCallback(
    async (id) => {
      await flush()
      const s = await api.readSpace(root, id)
      setSpace(s)
      await api.patchSettings({ lastSpaceId: id })
      return s
    },
    [root, flush]
  )

  const create = useCallback(
    async (name) => {
      await flush()
      const s = await api.createSpace(root, name)
      setSpace(s)
      await refreshSpaces()
      return s
    },
    [root, flush, refreshSpaces]
  )

  const remove = useCallback(
    async (id) => {
      await api.removeSpace(root, id)
      if (space?.id === id) setSpace(null)
      await refreshSpaces()
    },
    [root, space, refreshSpaces]
  )

  const rename = useCallback((name) => space && commit({ ...space, name }), [space, commit])

  // Placement keeps the natural aspect ratio and caps the long side, so
  // a 6000px export does not land as a wall-sized rectangle.
  const addItems = useCallback(
    (items, at = { x: 0, y: 0 }) => {
      if (!space || !items.length) return
      let z = space.nodes.reduce((m, n) => Math.max(m, n.z), 0)
      const nodes = items.map((item, i) => {
        const ratio = item.width && item.height ? item.height / item.width : 0.66
        const w = 320
        return {
          nodeId: newNodeId(),
          type: 'item',
          itemId: item.id,
          x: Math.round(at.x + i * 28),
          y: Math.round(at.y + i * 28),
          w,
          h: Math.round(w * ratio),
          z: ++z,
          rotation: 0,
          opacity: 1,
        }
      })
      commit({ ...space, nodes: [...space.nodes, ...nodes] })
    },
    [space, commit]
  )

  const moveNodes = useCallback(
    (updates) => {
      if (!space) return
      const patch = new Map(updates.map((u) => [u.nodeId, u]))
      commit({
        ...space,
        nodes: space.nodes.map((n) => (patch.has(n.nodeId) ? { ...n, ...patch.get(n.nodeId) } : n)),
      })
    },
    [space, commit]
  )

  const removeNodes = useCallback(
    (nodeIds) => {
      if (!space) return
      const gone = new Set(nodeIds)
      commit({ ...space, nodes: space.nodes.filter((n) => !gone.has(n.nodeId)) })
    },
    [space, commit]
  )

  const bringToFront = useCallback(
    (nodeIds) => {
      if (!space) return
      let z = space.nodes.reduce((m, n) => Math.max(m, n.z), 0)
      const lift = new Set(nodeIds)
      commit({
        ...space,
        nodes: space.nodes.map((n) => (lift.has(n.nodeId) ? { ...n, z: ++z } : n)),
      })
    },
    [space, commit]
  )

  return {
    spaces, space, open, create, remove, rename,
    addItems, moveNodes, removeNodes, bringToFront, refreshSpaces, flush,
  }
}
