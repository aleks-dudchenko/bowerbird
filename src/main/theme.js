import { BrowserWindow, nativeTheme } from 'electron'

// The window frame, the traffic lights and the flash of colour before the
// renderer paints all come from the OS, so the choice has to be set here
// and not only in CSS.
const BG = { dark: '#0e0e11', light: '#fbfbfc' }

export function applyTheme(source) {
  nativeTheme.themeSource = source === 'light' || source === 'dark' ? source : 'system'
  const dark = nativeTheme.shouldUseDarkColors
  for (const win of BrowserWindow.getAllWindows()) {
    win.setBackgroundColor(dark ? BG.dark : BG.light)
  }
  return { source: nativeTheme.themeSource, dark }
}

export const currentTheme = () => ({
  source: nativeTheme.themeSource,
  dark: nativeTheme.shouldUseDarkColors,
})

export const backgroundFor = () => (nativeTheme.shouldUseDarkColors ? BG.dark : BG.light)
