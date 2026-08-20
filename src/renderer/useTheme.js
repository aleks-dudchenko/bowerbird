import { useCallback, useEffect, useState } from 'react'

const api = window.bowerbird

// CSS handles "follow the system" on its own through prefers-color-scheme.
// The data-theme attribute exists for the override, and it has to win in
// both directions — forcing light on a dark system, and the reverse.
export function useTheme() {
  const [source, setSource] = useState('system')

  const paint = useCallback((next) => {
    const root = document.documentElement
    if (next === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', next)
  }, [])

  useEffect(() => {
    api.getTheme().then(({ source: saved }) => {
      setSource(saved)
      paint(saved)
    })
    // The system can change while the app is open; following it means
    // reacting, not only reading once at launch.
    return api.onEvent((e) => {
      if (e.type === 'theme:changed') paint(document.documentElement.dataset.theme || 'system')
    })
  }, [paint])

  const choose = useCallback(
    async (next) => {
      setSource(next)
      paint(next)
      await api.setTheme(next)
    },
    [paint]
  )

  return { source, choose }
}
