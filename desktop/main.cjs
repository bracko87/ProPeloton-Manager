'use strict';

const path = require('node:path');
const { app, BrowserWindow, shell } = require('electron');
const { isGameUrl, isExternalUrl } = require('./security.cjs');

const GAME_URL = 'https://propelotonmanager.com/';

function openExternalSafely(url) {
  if (isExternalUrl(url)) {
    void shell.openExternal(url).catch(() => {});
  }
}

function createWindow() {
  const window = new BrowserWindow({
    title: 'ProPeloton Manager',
    width: 1360,
    height: 860,
    minWidth: 920,
    minHeight: 620,
    autoHideMenuBar: true,
    backgroundColor: '#081224',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  window.once('ready-to-show', () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });

  function guardNavigation(event, targetUrl) {
    if (isGameUrl(targetUrl)) return;
    event.preventDefault();
    openExternalSafely(targetUrl);
  }
  window.webContents.on('will-navigate', guardNavigation);
  window.webContents.on('will-redirect', guardNavigation);

  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  window.loadURL(GAME_URL).catch(() => {
    if (!window.isDestroyed()) {
      void window.loadFile(path.join(__dirname, 'offline.html'));
    }
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.nextqueststudio.propelotonmanager');
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
