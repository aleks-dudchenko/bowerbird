import { useEffect } from 'react'

// Import results, trash confirmations and undo all surface here. Before
// this the skipped-file count went to console.warn and nobody saw it.
export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDismiss, toast.action ? 8000 : 4000)
    return () => clearTimeout(t)
  }, [toast, onDismiss])

  if (!toast) return null

  return (
    <div className="toast">
      <span>{toast.message}</span>
      {toast.action && (
        <button
          className="ghost"
          onClick={() => {
            toast.action.run()
            onDismiss()
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}
