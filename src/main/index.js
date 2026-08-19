import { app, BrowserWindow, shell, protocol, net } from 'electron'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { registerIpc } from './ipc.js'
import { readSettings, writeSettings, setAllowedRoot, isInsideLibrary } from './library.js'
import { startServer, stopServer } from './server.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// The renderer runs on http:// in dev, so file:// is blocked for it.
// A custom zb:// scheme serves disk files in a controlled way — without
// disabling webSecurity and without exposing the filesystem to JS.
protocol.registerSchemesAsPrivileged([
  { scheme: 'zb', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

// The save server binds a fixed port, so a second copy of the app would
// fight the first for it. Hand the launch to the running window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
}

let win = null

// Window bounds are remembered because a spatial UI that resets its
// geometry on every launch is immediately irritating.
function persistBounds() {
  if (!win || win.isDestroyed() || win.isMinimized()) return
  writeSettings({ windowBounds: win.getNormalBounds() })
}

function createWindow(bounds) {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    ...(bounds || {}),
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0e0e11',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => win.show())
  win.on('resized', persistBounds)
  win.on('moved', persistBounds)

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const settings = await readSettings()
  if (settings.libraryRoot) setAllowedRoot(settings.libraryRoot)

  protocol.handle('zb', async (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))

    // Without this check the renderer could ask for any absolute path on
    // the machine. Nothing outside the library is ever legitimate here.
    if (!isInsideLibrary(path)) {
      return new Response('forbidden', { status: 403 })
    }

    const res = await net.fetch(pathToFileURL(path).toString())
    // Files are content-addressed by id and never rewritten in place, so
    // panning a canvas should not re-hit this handler for every frame.
    const headers = new Headers(res.headers)
    headers.set('Cache-Control', 'private, max-age=31536000, immutable')
    return new Response(res.body, { status: res.status, headers })
  })

  registerIpc()
  createWindow(settings.windowBounds)

  // Saves arriving from the browser have to reach the open window, or the
  // grid silently lags behind what the user just clicked.
  startServer((item) => {
    if (win && !win.isDestroyed()) win.webContents.send('app:event', { type: 'item:saved', item })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(settings.windowBounds)
  })
})

app.on('before-quit', () => {
  persistBounds()
  stopServer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
