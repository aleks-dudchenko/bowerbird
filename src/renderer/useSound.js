import { useCallback, useEffect, useState } from 'react'
import { play, setEnabled, setVolume } from 'cuelume'

const api = window.bowerbird

// Sound is attached by class, not by prop. The alternative is threading
// a play() call through forty handlers and forgetting it in three of
// them, and then the app sounds broken rather than quiet.
//
// Hover is deliberately silent. A pointer crossing a toolbar is not an
// action, and a library app is something you sweep the cursor across for
// minutes at a time — chirping through that would be unbearable.
const CUES = [
  ['.modes button', 'toggle'],
  ['.primary', 'pulse'],
  ['.danger', 'droplet'],
  ['.swatch, .tag, .rail button', 'tick'],
  ['.icon-btn, .ghost, .path, .trash-tab', 'scan'],
  ['.card, .tray-item, .space-card, .node', 'tick'],
]

const cueFor = (el) => CUES.find(([selector]) => el.closest?.(selector))?.[1] ?? null

export function useSound() {
  const [on, setOn] = useState(true)
  const [volume, setLevel] = useState(0.4)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api.getSettings(['sound', 'soundVolume']).then((s) => {
      setOn(s.sound !== false)
      if (typeof s.soundVolume === 'number') setLevel(s.soundVolume)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    setEnabled(on)
    setVolume(volume)
  }, [on, volume])

  useEffect(() => {
    if (!on || !ready) return
    // Capture, so a handler that stops propagation does not also
    // silence the click that reached it.
    const listen = (e) => {
      const cue = cueFor(e.target)
      if (cue) play(cue)
    }
    document.addEventListener('click', listen, true)
    return () => document.removeEventListener('click', listen, true)
  }, [on, ready])

  const choose = useCallback((next) => {
    setOn(next)
    api.patchSettings({ sound: next })
    // Play after enabling, so the choice confirms itself.
    if (next) setTimeout(() => play('ready'), 0)
  }, [])

  const level = useCallback((next) => {
    setLevel(next)
    api.patchSettings({ soundVolume: next })
  }, [])

  // For the moments no click can stand in for: an import finishing, a
  // save arriving from the browser, something going wrong.
  const cue = useCallback((name) => { if (on) play(name) }, [on])

  return { on, choose, volume, level, cue }
}
