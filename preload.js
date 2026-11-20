'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  ready: () => ipcRenderer.invoke('browser:ready'),
  setLayout: (layout) => ipcRenderer.send('browser:set-layout', layout),
  createTab: (options = {}) => ipcRenderer.invoke('browser:create-tab', options),
  activateTab: (id) => ipcRenderer.send('browser:activate-tab', id),
  closeTab: (id) => ipcRenderer.send('browser:close-tab', id),
  navigate: (payload) => ipcRenderer.send('browser:navigate', payload),
  back: () => ipcRenderer.send('browser:back'),
  forward: () => ipcRenderer.send('browser:forward'),
  reload: () => ipcRenderer.send('browser:reload'),
  home: () => ipcRenderer.send('browser:home'),
  addBookmark: () => ipcRenderer.invoke('browser:add-bookmark'),
  removeBookmark: (url) => ipcRenderer.send('browser:remove-bookmark', url),
  removeHistory: (url) => ipcRenderer.send('browser:remove-history', url),
  updateSettings: (settings) => ipcRenderer.invoke('browser:update-settings', settings),
  clearData: () => ipcRenderer.invoke('browser:clear-data'),
  openDownload: (filePath) => ipcRenderer.send('browser:open-download', filePath),
  showDownload: (filePath) => ipcRenderer.send('browser:show-download', filePath),
  clearDownloads: () => ipcRenderer.send('browser:clear-downloads'),
  openExternal: (url) => ipcRenderer.send('browser:open-external', url),
  getPageInfo: () => ipcRenderer.invoke('browser:page-info'),
  onState: (callback) => ipcRenderer.on('browser:state', (_event, value) => callback(value)),
  onError: (callback) => ipcRenderer.on('browser:error', (_event, value) => callback(value)),
  onDownloadUpdated: (callback) => ipcRenderer.on('browser:download-updated', (_event, value) => callback(value)),
  onFocusAddress: (callback) => ipcRenderer.on('browser:focus-address', () => callback()),
  onOpenPanel: (callback) => ipcRenderer.on('browser:open-panel', (_event, value) => callback(value))
};

contextBridge.exposeInMainWorld('pexlora', api);
