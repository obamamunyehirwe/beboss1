'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose only narrow, validated desktop capabilities. Never expose ipcRenderer,
// Node.js globals, filesystem access, or arbitrary shell commands to the website.
contextBridge.exposeInMainWorld('beBossDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('beboss:desktop-version'),
  getUpdateStatus: () => ipcRenderer.invoke('beboss:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('beboss:check-for-updates'),
  printCurrentPage: () => ipcRenderer.invoke('beboss:print-current-page'),
  isSecureStorageAvailable: () => ipcRenderer.invoke('beboss:secure-storage-available'),
  readWorkspaceCache: () => ipcRenderer.invoke('beboss:workspace-cache-read'),
  writeWorkspaceCache: (value) => ipcRenderer.invoke('beboss:workspace-cache-write', value),
  clearWorkspaceCache: () => ipcRenderer.invoke('beboss:workspace-cache-clear'),
  secureAuthStorage: Object.freeze({
    getItem: (key) => ipcRenderer.invoke('beboss:secure-auth-get', key),
    setItem: (key, value) => ipcRenderer.invoke('beboss:secure-auth-set', key, value),
    removeItem: (key) => ipcRenderer.invoke('beboss:secure-auth-remove', key),
  }),
}));
