import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Єдиний міст рендерер↔система. Рендерер не має прямого доступу до node:
// усе, що торкається диска, проходить через ці виклики.
contextBridge.exposeInMainWorld('zbirka', {
  // webUtils — єдиний спосіб дістати реальний шлях кинутого файлу
  // в сучасному Electron: File.path прибрали з міркувань безпеки.
  pathForFile: (file) => webUtils.getPathForFile(file),

  currentLibrary: () => ipcRenderer.invoke('library:current'),
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  loadLibrary: (root) => ipcRenderer.invoke('library:load', root),
  revealLibrary: (root) => ipcRenderer.invoke('library:reveal', root),

  addItems: (root, paths) => ipcRenderer.invoke('items:add', root, paths),
  updateItem: (item, patch) => ipcRenderer.invoke('items:update', item, patch),
  removeItem: (item) => ipcRenderer.invoke('items:remove', item),
  revealInFinder: (item) => ipcRenderer.invoke('items:revealInFinder', item),

  onProgress: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('items:progress', handler)
    return () => ipcRenderer.off('items:progress', handler)
  },
})
