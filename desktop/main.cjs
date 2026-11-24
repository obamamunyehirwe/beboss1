'use strict';

const path = require('node:path');
const { app, BrowserWindow, Menu, Tray, nativeImage, dialog, ipcMain, session, shell, screen, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const { PRODUCTION_APP_URL, resolveAppUrl, resolveWorkspaceUrl, isTrustedAppUrl, isSafeExternalUrl } = require('./security.cjs');

const APP_URL = resolveAppUrl(process.env, app.isPackaged);
const APP_ORIGIN = new URL(APP_URL).origin;
const SESSION_PARTITION = 'persist:beboss-desktop';
const APP_NAME = 'BeBoss';
let mainWindow = null;
let tray = null;
const workspaceWindows = new Set();
let notificationPermissionGranted = false;
let updateState = 'idle';
let availableUpdateVersion = null;
let appMenu = null;
let updateCheckInterval = null;
let manualUpdateCheck = false;
const configuredSessions = new WeakSet();

const WORKSPACE_PAGES = [
  { label: 'Admin overview', path: '/admin' },
  { label: 'Payments & refunds', path: '/admin/payments' },
  { label: 'Shops & branches', path: '/admin/shops' },
  { label: 'Business analytics', path: '/admin/analytics' },
  { label: 'Device management', path: '/admin/devices' },
  { label: 'Cloud sync monitor', path: '/admin/sync' },
  { label: 'Audit log', path: '/admin/audit' },
  { label: 'Admin settings', path: '/admin/settings' },
];

function updateActionLabel() {
  if (updateState === 'ready') return 'Restart to install update';
  if (updateState === 'downloading') return 'Downloading update…';
  if (updateState === 'checking') return 'Checking for updates…';
  return 'Check for updates';
}

function updateStatusSnapshot() {
  return Object.freeze({ state: updateState, version: availableUpdateVersion });
}

function showDesktopNotification(title, body) {
  if (!Notification.isSupported()) return;
  try { new Notification({ title, body, silent: false }).show(); }
  catch (error) { console.warn('BeBoss notification unavailable:', error?.message || error); }
}

function refreshNativeMenus() {
  const updateItem = appMenu?.getMenuItemById('beboss-update-action');
  if (updateItem) updateItem.label = updateActionLabel();
  if (tray) refreshTrayMenu();
}

function runUpdateAction() {
  if (updateState === 'ready') {
    autoUpdater.quitAndInstall();
    return;
  }
  void checkForUpdates(false);
}

async function checkForUpdates(silent = false) {
  if (!app.isPackaged) return { state: 'disabled' };
  if (updateState === 'checking' || updateState === 'downloading' || updateState === 'ready') {
    return updateStatusSnapshot();
  }
  manualUpdateCheck = !silent;
  updateState = 'checking';
  refreshNativeMenus();
  try {
    await autoUpdater.checkForUpdates();
    return updateStatusSnapshot();
  } catch (error) {
    updateState = 'error';
    console.warn('BeBoss update check failed:', error?.message || error);
    if (manualUpdateCheck) showDesktopNotification('BeBoss update check failed', 'Check your internet connection and try again.');
    manualUpdateCheck = false;
    refreshNativeMenus();
    return updateStatusSnapshot();
  }
}

function configureAutoUpdates() {
  if (!app.isPackaged || process.env.BEBOSS_DISABLE_AUTO_UPDATES === '1') return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    updateState = 'checking';
    refreshNativeMenus();
  });
  autoUpdater.on('update-available', (info) => {
    availableUpdateVersion = String(info?.version || '') || null;
    updateState = 'downloading';
    showDesktopNotification('BeBoss update available', 'Version ' + (availableUpdateVersion || 'new') + ' is downloading in the background.');
    refreshNativeMenus();
  });
  autoUpdater.on('download-progress', (progress) => {
    updateState = 'downloading';
    const percent = Number.isFinite(progress?.percent) ? Math.round(progress.percent) : null;
    if (percent !== null) console.info('BeBoss update download: ' + percent.toFixed(1) + '%');
    refreshNativeMenus();
  });
  autoUpdater.on('update-not-available', () => {
    updateState = 'current';
    if (manualUpdateCheck) showDesktopNotification('BeBoss is up to date', 'You are running the latest available version.');
    manualUpdateCheck = false;
    refreshNativeMenus();
  });
  autoUpdater.on('update-downloaded', (info) => {
    availableUpdateVersion = String(info?.version || availableUpdateVersion || '') || null;
    updateState = 'ready';
    manualUpdateCheck = false;
    showDesktopNotification('BeBoss update ready', 'Restart BeBoss to install ' + (availableUpdateVersion || 'the update') + '.');
    refreshNativeMenus();
  });
  autoUpdater.on('error', (error) => {
    updateState = 'error';
    console.warn('BeBoss auto-update error:', error?.message || error);
    if (manualUpdateCheck) showDesktopNotification('BeBoss update failed', 'The update could not be completed. You can try again later.');
    manualUpdateCheck = false;
    refreshNativeMenus();
  });

  const initialCheck = setTimeout(() => { void checkForUpdates(true); }, 20_000);
  initialCheck.unref?.();
  updateCheckInterval = setInterval(() => { void checkForUpdates(true); }, 6 * 60 * 60 * 1000);
  updateCheckInterval.unref?.();
}

function workspaceUrl(route = '/') {
  return resolveWorkspaceUrl(route, APP_ORIGIN);
}

function openWorkspaceWindow(route = '/') {
  const target = workspaceUrl(route);
  const window = createWindow(target, false);
  workspaceWindows.add(window);
  window.once('closed', () => workspaceWindows.delete(window));
  return window;
}

function restoreMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

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
  appMenu = Menu.buildFromTemplate([
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
        { label: 'Workspace home', accelerator: 'CommandOrControl+Shift+H', click: () => { if (mainWindow && !mainWindow.isDestroyed()) void mainWindow.loadURL(APP_URL); else restoreMainWindow(); } },
        { label: 'Open workspace in new window', accelerator: 'CommandOrControl+Shift+N', click: () => openWorkspaceWindow('/') },
        { type: 'separator' },
        { label: 'Quick access', submenu: WORKSPACE_PAGES.map((page) => ({ label: page.label, click: () => openWorkspaceWindow(page.path) })) },
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
        { id: 'beboss-update-action', label: updateActionLabel(), click: runUpdateAction },
        { label: 'Release notes', click: () => openExternal('https://github.com/obamamunyehirwe/beboss1/releases') },
      ],
    },
  ]);
  Menu.setApplicationMenu(appMenu);
}

function configureSession(appSession) {
  if (configuredSessions.has(appSession)) return;
  configuredSessions.add(appSession);

  appSession.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
    let requestingOrigin = '';
    try { requestingOrigin = new URL(details.requestingUrl || webContents.getURL()).origin; }
    catch { callback(false); return; }

    if (requestingOrigin !== APP_ORIGIN || permission !== 'notifications') {
      callback(false);
      return;
    }
    if (notificationPermissionGranted) { callback(true); return; }

    const ownerWindow = BrowserWindow.fromWebContents(webContents) || mainWindow;
    const answer = await dialog.showMessageBox(ownerWindow, {
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

  appSession.on('will-download', async (event, item, webContents) => {
    const ownerWindow = BrowserWindow.fromWebContents(webContents) || mainWindow;
    if (!ownerWindow || ownerWindow.isDestroyed()) { item.cancel(); return; }
    const suggestedName = path.basename(item.getFilename() || 'beboss-download');
    const result = await dialog.showSaveDialog(ownerWindow, {
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
    const ownerWindow = BrowserWindow.fromWebContents(contents);
    if (ownerWindow && !ownerWindow.isDestroyed()) {
      const cleanTitle = String(title || '').replace(/[\\r\\n]+/g, ' ').slice(0, 100);
      ownerWindow.setTitle(cleanTitle ? APP_NAME + ' — ' + cleanTitle : APP_NAME);
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
    Menu.buildFromTemplate(menuItems).popup({ window: BrowserWindow.fromWebContents(contents) || undefined });
  });

  contents.on('did-fail-load', (_event, errorCode, _description, _validatedUrl, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && !contents.isDestroyed()) showOfflinePage(contents);
  });
}

function createWindow(initialUrl = APP_URL, primary = true) {
  const appSession = session.fromPartition(SESSION_PARTITION);
  configureSession(appSession);

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'brand', 'beboss-app-icon.png')
    : path.join(__dirname, '..', 'web', 'public', 'beboss-app-icon.png');

  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.max(320, Math.min(1600, Math.round(workAreaSize.width * 0.92)));
  const height = Math.max(420, Math.min(1080, Math.round(workAreaSize.height * 0.90)));
  const window = new BrowserWindow({
    title: APP_NAME, width, height, minWidth: Math.min(760, width), minHeight: Math.min(620, height),
    show: false, backgroundColor: '#0b1220', autoHideMenuBar: false, icon: iconPath,
    webPreferences: {
      partition: SESSION_PARTITION,
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, spellcheck: true,
    },
  });

  if (primary) mainWindow = window;
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show(); });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
    workspaceWindows.delete(window);
  });
  void window.loadURL(initialUrl);
  if (primary) createApplicationMenu();
  return window;
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show BeBoss', click: restoreMainWindow },
    { type: 'separator' },
    { label: updateActionLabel(), click: runUpdateAction, enabled: updateState !== 'checking' && updateState !== 'downloading' },
    { label: 'Current version: ' + app.getVersion(), enabled: false },
    { type: 'separator' },
    ...WORKSPACE_PAGES.slice(0, 5).map((page) => ({ label: page.label, click: () => openWorkspaceWindow(page.path) })),
    { type: 'separator' },
    { label: 'Quit BeBoss', click: () => app.quit() },
  ]));
}

function createTray() {
  if (tray) return;
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'brand', 'beboss-app-icon.png')
    : path.join(__dirname, '..', 'web', 'public', 'beboss-app-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) return;
  tray = new Tray(icon.resize({ width: 20, height: 20 }));
  tray.setToolTip('BeBoss — Business workspace');
  refreshTrayMenu();
  tray.on('double-click', restoreMainWindow);
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

    ipcMain.handle('beboss:update-status', (event) => {
      if (!trustedSender(event)) throw new Error('Untrusted BeBoss renderer.');
      return updateStatusSnapshot();
    });

    ipcMain.handle('beboss:check-for-updates', (event) => {
      if (!trustedSender(event)) throw new Error('Untrusted BeBoss renderer.');
      return checkForUpdates(false);
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
    createTray();
    configureAutoUpdates();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('second-instance', () => {
    restoreMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    if (updateCheckInterval) { clearInterval(updateCheckInterval); updateCheckInterval = null; }
    ipcMain.removeHandler('beboss:desktop-version');
    ipcMain.removeHandler('beboss:update-status');
    ipcMain.removeHandler('beboss:check-for-updates');
    ipcMain.removeHandler('beboss:print-current-page');
    if (tray) { tray.destroy(); tray = null; }
  });
}
