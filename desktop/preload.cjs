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
}));
