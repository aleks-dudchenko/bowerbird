import { Menu, app, shell } from 'electron'

// Electron installs a default menu when none is set, and that default is
// where Cmd+C / Cmd+V come from. Replacing it without keeping the edit
// roles silently breaks paste in every text field in the app — so the
// editMenu role stays, whatever else changes here.
export function buildMenu({ onSettings, onAddFiles, onNewSpace, onChooseLibrary }) {
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: onSettings },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'Add Files…', accelerator: 'Cmd+O', click: onAddFiles },
        { label: 'New Space', accelerator: 'Cmd+N', click: onNewSpace },
        { type: 'separator' },
        { label: 'Change Library Folder…', click: onChooseLibrary },
      ],
    },
    // Non-negotiable: this is what makes copy and paste work.
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Project on GitHub',
          click: () => shell.openExternal('https://github.com/aleks-dudchenko/bowerbird'),
        },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
}
