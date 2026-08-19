import { contextBridge, ipcRenderer, webUtils } from 'electron'

// The only bridge between renderer and system. The renderer has no
// direct node access — everything touching disk goes through here.
contextBridge.exposeInMainWorld('zbirka', {
  // webUtils is the only way to resolve a dropped file to a real path
  // in current Electron — File.path was removed for security reasons.
  pathForFile: (file) => webUtils.getPathForFile(file),

  getSettings: (keys) => ipcRenderer.invoke('settings:get', keys),
  patchSettings: (patch) => ipcRenderer.invoke('settings:patch', patch),

  currentLibrary: () => ipcRenderer.invoke('library:current'),
  chooseLibrary: () => ipcRenderer.invoke('library:choose'),
  loadLibrary: (root) => ipcRenderer.invoke('library:load', root),
  revealLibrary: (root) => ipcRenderer.invoke('library:reveal', root),

  addItems: (root, paths, opts) => ipcRenderer.invoke('items:add', root, paths, opts),
  addFilesDialog: (root) => ipcRenderer.invoke('items:addFilesDialog', root),
  updateItem: (item, patch) => ipcRenderer.invoke('items:update', item, patch),
  trashItems: (items) => ipcRenderer.invoke('items:trash', items),
  restoreItems: (items) => ipcRenderer.invoke('items:restore', items),
  purgeItems: (items) => ipcRenderer.invoke('items:purge', items),
  revealInFinder: (item) => ipcRenderer.invoke('items:revealInFinder', item),

  listSpaces: (root) => ipcRenderer.invoke('spaces:list', root),
  readSpace: (root, id) => ipcRenderer.invoke('spaces:read', root, id),
  writeSpace: (root, space) => ipcRenderer.invoke('spaces:write', root, space),
  createSpace: (root, name) => ipcRenderer.invoke('spaces:create', root, name),
  removeSpace: (root, id) => ipcRenderer.invoke('spaces:remove', root, id),

  onEvent: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('app:event', handler)
    return () => ipcRenderer.off('app:event', handler)
  },
})
