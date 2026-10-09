const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mori', {
  load: () => ipcRenderer.invoke('board:load'),
  saveBoards: boards => ipcRenderer.invoke('board:save', boards),
  settings: patch => ipcRenderer.invoke('settings:save', patch),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  openDataFolder: () => ipcRenderer.invoke('data:folder'),
  window: action => ipcRenderer.invoke('window:action', action),
  onPresentation: callback => {
    const listener = (_event, mode) => callback(mode);
    ipcRenderer.on('window:presentation', listener);
    return () => ipcRenderer.removeListener('window:presentation', listener);
  },
  onSettings: callback => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
  }
});
