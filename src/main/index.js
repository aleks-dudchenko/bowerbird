import { app, BrowserWindow, shell, protocol, net } from 'electron'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { registerIpc } from './ipc.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// The renderer runs on http:// in dev, so file:// is blocked for it.
// A custom zb:// scheme serves disk files in a controlled way — without
// disabling webSecurity and without exposing the filesystem to JS.
protocol.registerSchemesAsPrivileged([
  { scheme: 'zb', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
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

app.whenReady().then(() => {
  protocol.handle('zb', (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
    return net.fetch(pathToFileURL(path).toString())
  })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
