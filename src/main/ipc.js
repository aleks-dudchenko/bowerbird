import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import {
  readSettings, writeSettings, ensureLibrary, loadIndex, setAllowedRoot,
} from './library.js'
import {
  ingestFile, trashItem, restoreItem, purgeItem, updateSidecar, kindOf,
} from './ingest.js'
import { listSpaces, readSpace, writeSpace, createSpace, removeSpace } from './spaces.js'
import { getToken, rotateToken, serverStatus } from './server.js'

// One event envelope instead of a channel per notification. Import
// progress was the only consumer; indexing, OCR and extension saves are
// all queued behind it.
function emit(sender, type, payload = {}) {
  if (!sender.isDestroyed()) sender.send('app:event', { type, ...payload })
}

export function registerIpc() {
  // ---- settings -----------------------------------------------------

  ipcMain.handle('settings:get', async (_e, keys) => {
    const all = await readSettings()
    if (!keys) return all
    return Object.fromEntries(keys.filter((k) => k in all).map((k) => [k, all[k]]))
  })

  ipcMain.handle('settings:patch', async (_e, patch) => writeSettings(patch))

  // ---- library ------------------------------------------------------

  ipcMain.handle('library:current', async () => (await readSettings()).libraryRoot ?? null)

  ipcMain.handle('library:choose', async (e) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(e.sender),
      {
        title: 'Choose a library folder',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Choose',
      }
    )
    if (canceled || !filePaths[0]) return null
    await ensureLibrary(filePaths[0])
    await writeSettings({ libraryRoot: filePaths[0] })
    setAllowedRoot(filePaths[0])
    return filePaths[0]
  })

  ipcMain.handle('library:load', async (_e, root) => {
    setAllowedRoot(root)
    return loadIndex(root)
  })

  ipcMain.handle('library:reveal', async (_e, root) => shell.openPath(root))

  // ---- items --------------------------------------------------------

  // Returns why each rejected file was rejected, so the UI can say so
  // instead of dropping the information into the console.
  ipcMain.handle('items:add', async (e, root, paths, opts = {}) => {
    const { bySha } = await loadIndex(root)
    const seen = new Map(bySha)

    const added = []
    const skipped = []
    const duplicates = []
    const usable = []

    for (const p of paths) {
      if (kindOf(p)) usable.push(p)
      else skipped.push({ path: p, reason: 'unsupported format' })
    }

    for (const [i, p] of usable.entries()) {
      try {
        const item = await ingestFile(root, p, opts)
        if (seen.has(item.sha256)) {
          duplicates.push({ path: p, existingId: seen.get(item.sha256) })
          await purgeItem(item) // undo the copy we just made
        } else {
          seen.set(item.sha256, item.id)
          added.push(item)
        }
      } catch (err) {
        skipped.push({ path: p, reason: err.message || 'import failed' })
      }
      emit(e.sender, 'import:progress', { done: i + 1, total: usable.length })
    }

    return { added, skipped, duplicates }
  })

  ipcMain.handle('items:addFilesDialog', async (e, root) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(e.sender),
      {
        title: 'Add files to the library',
        properties: ['openFile', 'multiSelections'],
        buttonLabel: 'Add',
      }
    )
    if (canceled || !filePaths.length) return null
    return filePaths
  })

  ipcMain.handle('items:update', async (_e, item, patch) => updateSidecar(item, patch))
  ipcMain.handle('items:trash', async (_e, items) => {
    for (const i of items) await trashItem(i)
    return true
  })
  ipcMain.handle('items:restore', async (_e, items) => {
    for (const i of items) await restoreItem(i)
    return true
  })
  ipcMain.handle('items:purge', async (_e, items) => {
    for (const i of items) await purgeItem(i)
    return { removed: items.length }
  })
  ipcMain.handle('items:revealInFinder', async (_e, item) => shell.showItemInFolder(item.path))

  // ---- spaces -------------------------------------------------------

  ipcMain.handle('spaces:list', async (_e, root) => listSpaces(root))
  ipcMain.handle('spaces:read', async (_e, root, id) => readSpace(root, id))
  ipcMain.handle('spaces:write', async (_e, root, space) => writeSpace(root, space))
  ipcMain.handle('spaces:create', async (_e, root, name) => createSpace(root, name))
  ipcMain.handle('spaces:remove', async (_e, root, id) => removeSpace(root, id))

  // ---- connection server ---------------------------------------------

  ipcMain.handle('server:status', async () => ({ ...serverStatus(), token: await getToken() }))
  ipcMain.handle('server:rotateToken', async () => ({ token: await rotateToken() }))
}
