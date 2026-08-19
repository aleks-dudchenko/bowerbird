import { contextBridge } from 'electron'

// Єдиний міст між рендерером і системою. Усе, що торкається диска чи БД,
// проходить сюди через ipcRenderer.invoke — рендерер не має прямого
// доступу до node. Поки що порожньо: наповнюється в M1.
contextBridge.exposeInMainWorld('zbirka', {
  version: process.versions.electron,
})
