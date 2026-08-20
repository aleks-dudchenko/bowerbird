import { useCallback, useRef, useState } from 'react'

const api = window.bowerbird

// dragleave fires for every nested element, so a boolean flickers as the
// cursor crosses children. Counting enter/leave pairs is the fix.
export function useDropTarget(onDrop) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  const handlers = {
    onDragEnter: useCallback((e) => {
      e.preventDefault()
      depth.current += 1
      setDragging(true)
    }, []),
    onDragOver: useCallback((e) => e.preventDefault(), []),
    onDragLeave: useCallback(() => {
      depth.current -= 1
      if (depth.current <= 0) setDragging(false)
    }, []),
    onDrop: useCallback(
      (e) => {
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        const paths = [...e.dataTransfer.files]
          .map((f) => api.pathForFile(f))
          .filter(Boolean)
        if (paths.length) onDrop(paths, e)
      },
      [onDrop]
    ),
  }

  return { dragging, handlers }
}
