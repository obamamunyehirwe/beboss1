'use strict';

const path = require('node:path');
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
const { PRODUCTION_APP_URL, resolveAppUrl, isTrustedAppUrl, isSafeExternalUrl } = require('./security.cjs');

const APP_URL = resolveAppUrl(process.env, app.isPackaged);
const APP_ORIGIN = new URL(APP_URL).origin;
const SESSION_PARTITION = 'persist:beboss-desktop';
const APP_NAME = 'BeBoss';
let mainWindow = null;
let notificationPermissionGranted = false;

function trustedSender(event) {
  try { return isTrustedAppUrl(event.senderFrame?.url || '', APP_ORIGIN); } catch { return false; }
}

function openExternal(candidate) {
  if (isSafeExternalUrl(candidate)) void shell.openExternal(candidate);
}

function offlineDocument() {
  const safeUrl = APP_URL.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>BeBoss connection unavailable</title><style>',
    'html,body{height:100%;margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:#0b1220;color:#f8fafc}',
    'body{display:grid;place-items:center;padding:24px;box-sizing:border-box}',
    'main{max-width:520px;text-align:center;background:#121d30;border:1px solid #263751;border-radius:24px;padding:40px}',
    'h1{margin:0 0 12px;font-size:28px}p{color:#b8c5d8;line-height:1.65}',
    'a{display:inline-flex;margin-top:12px;padding:13px 22px;border-radius:12px;background:#f97316;color:#fff;text-decoration:none;font-weight:700}',
    '</style></head><body><main><h1>BeBoss is offline</h1>',
    '<p>BeBoss could not reach your workspace. Check your internet connection, then reconnect to continue using your secure cloud workspace.</p>',
    '<a href="', safeUrl, '">Reconnect to BeBoss</a></main></body></html>',
  ].join('');
}

function showOfflinePage(contents) {
  void contents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(offlineDocument()));
}

function printPage(contents) {
  if (!contents || contents.isDestroyed()) return;
  contents.print({ silent: false, printBackground: true }, (success, failureReason) => {
    if (!success && mainWindow && !mainWindow.isDestroyed()) {
      void dialog.showMessageBox(mainWindow, {
        type: 'warning', title: 'Print unavailable',
        message: 'BeBoss could not send this page to the selected printer.',
        detail: failureReason || 'Check the printer connection and try again.',
        buttons: ['OK'],
      });
    }
  });
}

function createApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: 'About BeBoss' },
        { type: 'separator' }, { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'Workspace home', accelerator: 'CommandOrControl+Shift+H', click: () => mainWindow?.loadURL(APP_URL) },
        { label: 'Print current page', accelerator: 'CommandOrControl+P', click: () => printPage(mainWindow?.webContents) },
        { type: 'separator' }, { role: 'close' }, { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        ...(process.env.BEBOSS_ENABLE_DEVTOOLS === '1' && !app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'BeBoss user guide', click: () => openExternal(PRODUCTION_APP_URL + '/guide') },
        { label: 'BeBoss support', click: () => openExternal(PRODUCTION_APP_URL + '/contact') },
        { label: 'Download desktop updates', click: () => openExternal('https://github.com/obamamunyehirwe/beboss1/releases') },
      ],
    },
  ]));
}

function configureSession(appSession) {
  appSession.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
    let requestingOrigin = '';
    try { requestingOrigin = new URL(details.requestingUrl || webContents.getURL()).origin; }
    catch { callback(false); return; }

    if (requestingOrigin !== APP_ORIGIN || permission !== 'notifications') {
      callback(false);
      return;
    }
    if (notificationPermissionGranted) { callback(true); return; }

    const answer = await dialog.showMessageBox(mainWindow, {
      type: 'question', title: 'Allow BeBoss notifications?',
      message: 'Allow BeBoss to show business and account notifications on this computer?',
      buttons: ['Allow', 'Block'], defaultId: 0, cancelId: 1, noLink: true,
    });
    notificationPermissionGranted = answer.response === 0;
    callback(notificationPermissionGranted);
  });

  appSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => (
    permission === 'notifications' && requestingOrigin === APP_ORIGIN && notificationPermissionGranted
  ));

  appSession.on('will-download', async (_event, item) => {
    if (!mainWindow || mainWindow.isDestroyed()) { item.cancel(); return; }
    const suggestedName = path.basename(item.getFilename() || 'beboss-download');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save BeBoss file',
      defaultPath: path.join(app.getPath('downloads'), suggestedName),
      buttonLabel: 'Save file',
    });
    if (result.canceled || !result.filePath) { item.cancel(); return; }
    item.setSavePath(result.filePath);
  });
}

function attachNavigationPolicy(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isTrustedAppUrl(url, APP_ORIGIN)) {
      setImmediate(() => { if (!contents.isDestroyed()) void contents.loadURL(url); });
    } else {
      openExternal(url);
    }
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (isTrustedAppUrl(url, APP_ORIGIN)) return;
    event.preventDefault();
    openExternal(url);
  });

  contents.on('will-redirect', (event, url) => {
    if (isTrustedAppUrl(url, APP_ORIGIN)) return;
    event.preventDefault();
    openExternal(url);
  });

  contents.on('will-attach-webview', (event) => event.preventDefault());

  contents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      const cleanTitle = String(title || '').replace(/[\\r\\n]+/g, ' ').slice(0, 100);
      mainWindow.setTitle(cleanTitle ? APP_NAME + ' — ' + cleanTitle : APP_NAME);
    }
  });

  contents.on('context-menu', (_event, params) => {
    const menuItems = [];
    if (params.isEditable) {
      menuItems.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' });
    } else if (params.selectionText) {
      menuItems.push({ role: 'copy' }, { type: 'separator' });
    }
    menuItems.push({ role: 'selectAll' });
    Menu.buildFromTemplate(menuItems).popup({ window: mainWindow || undefined });
  });

  contents.on('did-fail-load', (_event, errorCode, _description, _validatedUrl, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && !contents.isDestroyed()) showOfflinePage(contents);
  });
}

function createWindow() {
  const appSession = session.fromPartition(SESSION_PARTITION);
  configureSession(appSession);

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'brand', 'beboss-app-icon.png')
    : path.join(__dirname, '..', 'web', 'public', 'beboss-app-icon.png');

  mainWindow = new BrowserWindow({
    title: APP_NAME, width: 1500, height: 980, minWidth: 1060, minHeight: 720,
    show: false, backgroundColor: '#0b1220', autoHideMenuBar: false, icon: iconPath,
    webPreferences: {
      partition: SESSION_PARTITION,
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  void mainWindow.loadURL(APP_URL);
  createApplicationMenu();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('web-contents-created', (_event, contents) => attachNavigationPolicy(contents));

  app.whenReady().then(() => {
    ipcMain.handle('beboss:desktop-version', (event) => {
      if (!trustedSender(event)) throw new Error('Untrusted BeBoss renderer.');
      return app.getVersion();
    });

    ipcMain.handle('beboss:print-current-page', (event) => {
      if (!trustedSender(event)) throw new Error('Untrusted BeBoss renderer.');
      return new Promise((resolve) => {
        event.sender.print({ silent: false, printBackground: true }, (success, failureReason) => {
          resolve({ success, failureReason: success ? undefined : String(failureReason || 'Print failed') });
        });
      });
    });

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('second-instance', () => {
    if (!mainWindow) { createWindow(); return; }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    ipcMain.removeHandler('beboss:desktop-version');
    ipcMain.removeHandler('beboss:print-current-page');
  });
}
