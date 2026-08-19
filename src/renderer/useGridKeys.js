import { useEffect } from 'react'

// j/k navigation, plus the single-key actions from the roadmap. Bound at
// the window rather than on the grid so they work without the user first
// having clicked a card, and disabled whenever a text field has focus —
// otherwise typing "f" into the search box would favourite something.
export function useGridKeys({ enabled, items, focusedId, onFocus, onOpenSearch, onFavourite, onTag, onTrash }) {
  useEffect(() => {
    if (!enabled) return

    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const index = items.findIndex((i) => i.id === focusedId)
      const move = (delta) => {
        if (!items.length) return
        const next = index === -1 ? 0 : Math.min(items.length - 1, Math.max(0, index + delta))
        onFocus(items[next].id)
      }

      switch (e.key) {
        case 'j': e.preventDefault(); move(1); break
        case 'k': e.preventDefault(); move(-1); break
        case 'g': e.preventDefault(); if (items.length) onFocus(items[0].id); break
        case 'G': e.preventDefault(); if (items.length) onFocus(items[items.length - 1].id); break
        case '/': e.preventDefault(); onOpenSearch(); break
        case 'f': if (index > -1) { e.preventDefault(); onFavourite(items[index]) } break
        case 't': if (index > -1) { e.preventDefault(); onTag(items[index]) } break
        case 'Backspace':
        case 'Delete': if (index > -1) { e.preventDefault(); onTrash(items[index]) } break
        default: break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, items, focusedId, onFocus, onOpenSearch, onFavourite, onTag, onTrash])
}
