import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { readSettings, writeSettings, ensureLibrary, loadIndex } from './library.js'
import { ingestFile, updateSidecar, removeItem, isSupported } from './ingest.js'

export function registerIpc() {
  // Current library root, or null if none has been chosen yet.
  ipcMain.handle('library:current', async () => (await readSettings()).libraryRoot ?? null)

  ipcMain.handle('library:choose', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choose a library folder',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Choose',
    })
    if (canceled || !filePaths[0]) return null
    await ensureLibrary(filePaths[0])
    await writeSettings({ libraryRoot: filePaths[0] })
    return filePaths[0]
  })

  ipcMain.handle('library:load', async (_e, root) => loadIndex(root))

  ipcMain.handle('library:reveal', async (_e, root) => shell.openPath(root))

  // Import reports progress so the renderer can show a counter
  // instead of freezing until the whole batch is done.
  ipcMain.handle('items:add', async (e, root, paths) => {
    const usable = paths.filter(isSupported)
    const added = []
    for (const [i, p] of usable.entries()) {
      try {
        const item = await ingestFile(root, p)
        if (!item.skipped) added.push(item)
      } catch {
        /* one bad file must not abort the whole import */
      }
      e.sender.send('items:progress', { done: i + 1, total: usable.length })
    }
    return { added, skipped: paths.length - usable.length }
  })

  ipcMain.handle('items:update', async (_e, item, patch) => updateSidecar(item, patch))

  ipcMain.handle('items:remove', async (_e, item) => {
    await removeItem(item)
    return true
  })

  ipcMain.handle('items:revealInFinder', async (_e, item) => shell.showItemInFolder(item.path))
}
