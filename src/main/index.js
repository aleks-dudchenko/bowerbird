import { app, BrowserWindow, shell, protocol, net } from 'electron'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { registerIpc } from './ipc.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Рендерер живе на http:// у деві, тож file:// для нього закритий.
// Власна схема zb:// віддає файли з диска контрольовано — без
// вимкнення webSecurity і без доступу до всієї файлової системи з JS.
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
