import { contextBridge, ipcRenderer, webUtils } from 'electron'

// The only bridge between renderer and system. The renderer has no
// direct node access — everything touching disk goes through here.
contextBridge.exposeInMainWorld('zbirka', {
  // webUtils is the only way to resolve a dropped file to a real path
  // in current Electron — File.path was removed for security reasons.
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
