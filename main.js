const { app, BrowserWindow, Menu, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let controlWindow = null;
let liveWindow = null;
let controlWindowWasFullscreen = false;
let controlWindowWasMaximized = false;
let pendingLivePayload = { mode: 'black' };
let optionsMenuItem = null;
let viewMenuItems = {};

// ---------------------------------------------------------------------------
// Data persistence — everything lives as plain JSON files in the OS user-data
// folder, so the app has zero external dependencies (no database, no server,
// no license check, no account).
// ---------------------------------------------------------------------------

function userDataPath() {
  return app.getPath('userData');
}

function dataFile(name) {
  return path.join(userDataPath(), name);
}

function defaultTheme() {
  return {
    id: 'default',
    name: 'Default',
    background: { type: 'color', value: '#000000' },
    font: { family: 'Georgia, serif', size: 64, color: '#ffffff', weight: '700' },
    align: 'middle', // top | middle | bottom
    shadow: true,
  };
}

const SEED_FILES = {
  'library.json': path.join(__dirname, 'data', 'sample-library.json'),
  'scripture.json': path.join(__dirname, 'data', 'sample-scripture.json'),
  'media.json': null,
  'themes.json': null,
  'schedules.json': null,
  'settings.json': null,
};

function ensureUserData() {
  const dir = userDataPath();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  for (const [name, seedPath] of Object.entries(SEED_FILES)) {
    const dest = dataFile(name);
    if (fs.existsSync(dest)) continue;

    if (seedPath && fs.existsSync(seedPath)) {
      fs.copyFileSync(seedPath, dest);
      continue;
    }

    let initial = [];
    if (name === 'themes.json') initial = [defaultTheme()];
    if (name === 'settings.json') initial = { defaultThemeId: 'default', lastDisplayId: null, liveOpen: false, liveOnExit: false, logoPath: null };
    fs.writeFileSync(dest, JSON.stringify(initial, null, 2));
  }
}

function readJSON(name) {
  try {
    return JSON.parse(fs.readFileSync(dataFile(name), 'utf-8'));
  } catch (e) {
    return name === 'settings.json' ? {} : [];
  }
}

function shouldOpenLive(settings) {
  return Boolean(settings?.liveOpen ?? settings?.liveOnExit);
}

function writeJSON(name, data) {
  fs.writeFileSync(dataFile(name), JSON.stringify(data, null, 2));
  return true;
}

function buildApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          submenu: [
            { label: 'New Schedule', click: () => controlWindow?.webContents.send('menu:file-action', 'new-schedule') },
            { label: 'New Song', click: () => controlWindow?.webContents.send('menu:file-action', 'new-song') },
            { label: 'New Presentation', click: () => controlWindow?.webContents.send('menu:file-action', 'new-presentation') },
          ],
        },
        { label: 'Open Schedule', click: () => controlWindow?.webContents.send('menu:file-action', 'open-schedule') },
        { label: 'Save Schedule', click: () => controlWindow?.webContents.send('menu:file-action', 'save-schedule') },
        { label: 'Reopen', click: () => controlWindow?.reload() },
        { label: 'Toggle Developer', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Exit', click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => controlWindow?.webContents.send('menu:edit-action', 'undo'),
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => controlWindow?.webContents.send('menu:edit-action', 'redo'),
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Preview and Live', type: 'radio', click: () => controlWindow?.webContents.send('menu:view-action', 'preview-live') },
        { label: 'Preview and Live Combined', type: 'radio', click: () => controlWindow?.webContents.send('menu:view-action', 'combined') },
        { label: 'Live with Resource Preview', type: 'radio', checked: true, click: () => controlWindow?.webContents.send('menu:view-action', 'live-resource') },
      ],
    },
    {
      label: 'Profiles',
      submenu: [
        { label: 'Default', type: 'radio', checked: true, click: () => controlWindow?.webContents.send('menu:profile-action', 'default') },
        { type: 'separator' },
        { label: 'Profiles Manager', click: () => controlWindow?.webContents.send('menu:profile-action', 'manager') },
        { label: 'Add/Remove Demo Data', click: () => controlWindow?.webContents.send('menu:profile-action', 'demo-data') },
        {
          label: 'Utilities',
          submenu: [
            { label: 'Reset Songs to Default Theme', click: () => controlWindow?.webContents.send('menu:profile-action', 'reset-song-themes') },
            { label: 'Rebuild Search Keys', click: () => controlWindow?.webContents.send('menu:profile-action', 'rebuild-search-keys') },
          ],
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Options',
      click: () => controlWindow?.webContents.send('menu:file-action', 'open-options'),
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  optionsMenuItem = menu.items.find((item) => item.label === 'Options') || null;
  const viewMenu = menu.items.find((item) => item.label === 'View');
  viewMenuItems = Object.fromEntries(viewMenu.submenu.items.map((item) => [item.label, item]));
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function validControlWindowBounds(bounds) {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;
  const width = Math.max(1024, Math.round(bounds.width));
  const height = Math.max(640, Math.round(bounds.height));
  const visibleOnDisplay = screen.getAllDisplays().some((display) => {
    const overlapWidth = Math.max(0, Math.min(bounds.x + width, display.bounds.x + display.bounds.width)
      - Math.max(bounds.x, display.bounds.x));
    const overlapHeight = Math.max(0, Math.min(bounds.y + height, display.bounds.y + display.bounds.height)
      - Math.max(bounds.y, display.bounds.y));
    return overlapWidth >= 80 && overlapHeight >= 80;
  });
  return visibleOnDisplay ? { x: Math.round(bounds.x), y: Math.round(bounds.y), width, height } : null;
}

function saveControlWindowState(preserveFullscreen = false) {
  if (!controlWindow || controlWindow.isDestroyed()) return;
  const settings = readJSON('settings.json');
  settings.windowBounds = controlWindow.getNormalBounds();
  settings.windowFullscreen = preserveFullscreen
    ? settings.windowFullscreen || controlWindow.isFullScreen() || controlWindowWasFullscreen
    : controlWindow.isFullScreen();
  settings.windowMaximized = preserveFullscreen
    ? settings.windowMaximized || controlWindow.isMaximized() || controlWindowWasMaximized
    : controlWindow.isMaximized();
  writeJSON('settings.json', settings);
}

function createControlWindow() {
  const settings = readJSON('settings.json');
  const savedBounds = validControlWindowBounds(settings.windowBounds);
  controlWindow = new BrowserWindow({
    ...(savedBounds || { width: 1360, height: 860 }),
    minWidth: 1024,
    minHeight: 640,
    title: 'SimplyPraise',
    icon: path.join(__dirname, 'assets', 'simplyworship_logo.png'),
    backgroundColor: '#1b1d23',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  controlWindowWasFullscreen = Boolean(settings.windowFullscreen);
  controlWindowWasMaximized = Boolean(settings.windowMaximized);
  if (controlWindowWasFullscreen) controlWindow.setFullScreen(true);
  else if (controlWindowWasMaximized) controlWindow.maximize();
  controlWindow.on('move', saveControlWindowState);
  controlWindow.on('resize', saveControlWindowState);
  controlWindow.on('enter-full-screen', () => {
    controlWindowWasFullscreen = true;
    saveControlWindowState();
  });
  controlWindow.on('leave-full-screen', () => {
    controlWindowWasFullscreen = false;
    saveControlWindowState();
  });
  controlWindow.on('maximize', () => {
    controlWindowWasMaximized = true;
    saveControlWindowState();
  });
  controlWindow.on('unmaximize', () => {
    controlWindowWasMaximized = false;
    saveControlWindowState();
  });
  controlWindow.on('close', () => saveControlWindowState(true));
  controlWindow.webContents.on('did-finish-load', () => {
    const currentSettings = readJSON('settings.json');
    controlWindow?.webContents.send('live:state-changed', {
      open: Boolean(liveWindow && !liveWindow.isDestroyed()),
      restoring: shouldOpenLive(currentSettings),
      displayId: currentSettings?.lastDisplayId ?? null,
    });
  });
  controlWindow.loadFile(path.join(__dirname, 'src', 'control', 'index.html'));

  controlWindow.on('closed', () => {
    controlWindow = null;
    if (liveWindow && !liveWindow.isDestroyed()) liveWindow.close();
    liveWindow = null;
  });
}

function createLiveWindow() {
  if (liveWindow && !liveWindow.isDestroyed()) return liveWindow;

  liveWindow = new BrowserWindow({
    width: 960,
    height: 540,
    title: 'SimplyPraise — Live Output',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  liveWindow.setMenuBarVisibility(false);
  liveWindow.webContents.on('did-finish-load', () => {
    if (liveWindow && !liveWindow.isDestroyed()) {
      liveWindow.webContents.send('slide:update', pendingLivePayload);
    }
  });
  liveWindow.loadFile(path.join(__dirname, 'src', 'live', 'index.html'));
  liveWindow.on('closed', () => {
    liveWindow = null;
  });
  return liveWindow;
}

function restoreSavedLiveWindow() {
  const settings = readJSON('settings.json');
  if (!settings || !shouldOpenLive(settings)) return false;

  const displays = screen.getAllDisplays();
  const savedId = Number(settings.lastDisplayId);
  const target = displays.find((d) => d.id === savedId)
    || displays.find((d) => !d.isPrimary)
    || screen.getPrimaryDisplay();

  const win = createLiveWindow();
  pendingLivePayload = { mode: 'black' };
  win.setBounds(target.bounds);
  win.setFullScreen(true);
  win.show();
  return true;
}

app.whenReady().then(() => {
  ensureUserData();
  createControlWindow();
  buildApplicationMenu();
  // Restore the output window in the main process. The control window receives
  // a state event after its document loads, so the Live button cannot become
  // stale while the already-open output is restored.
  restoreSavedLiveWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow();
      restoreSavedLiveWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC — data
// ---------------------------------------------------------------------------

ipcMain.handle('data:get', (evt, name) => readJSON(name));
ipcMain.handle('data:save', (evt, name, data) => writeJSON(name, data));
ipcMain.handle('songs:set-editor-active', (evt, active) => {
  if (optionsMenuItem) optionsMenuItem.enabled = !active;
  return true;
});
ipcMain.handle('view:set-mode', (evt, mode) => {
  const labels = {
    'preview-live': 'Preview and Live',
    combined: 'Preview and Live Combined',
    'live-resource': 'Live with Resource Preview',
  };
  Object.values(viewMenuItems).forEach((item) => { item.checked = false; });
  if (labels[mode] && viewMenuItems[labels[mode]]) viewMenuItems[labels[mode]].checked = true;
  return true;
});
ipcMain.handle('settings:clear-logo', () => {
  const settings = readJSON('settings.json');
  settings.logoPath = null;
  writeJSON('settings.json', settings);
  if (controlWindow && !controlWindow.isDestroyed()) controlWindow.webContents.send('settings:logo-changed', null);
  return true;
});
ipcMain.handle('settings:set-logo', (evt, logoPath) => {
  const settings = readJSON('settings.json');
  settings.logoPath = logoPath || null;
  writeJSON('settings.json', settings);
  if (controlWindow && !controlWindow.isDestroyed()) controlWindow.webContents.send('settings:logo-changed', settings.logoPath);
  return true;
});
ipcMain.handle('settings:set-theme-mode', (evt, isLight) => {
  const settings = readJSON('settings.json');
  settings.themeMode = isLight ? 'light' : 'dark';
  writeJSON('settings.json', settings);
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('settings:theme-changed', isLight);
  }
  return true;
});

// ---------------------------------------------------------------------------
// IPC — displays / live window
// ---------------------------------------------------------------------------

ipcMain.handle('displays:list', () => {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    isPrimary: d.id === primary.id,
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
    label: d.label || '',
    internal: Boolean(d.internal),
    bounds: d.bounds,
  }));
});

ipcMain.handle('live:open', (evt, payload) => {
  pendingLivePayload = payload || { mode: 'black' };
  createLiveWindow();
  return true;
});

ipcMain.handle('live:close', () => {
  if (liveWindow && !liveWindow.isDestroyed()) liveWindow.close();
  liveWindow = null;
  return true;
});

ipcMain.handle('live:is-open', () => !!(liveWindow && !liveWindow.isDestroyed()));
ipcMain.handle('live:get-state', () => {
  const settings = readJSON('settings.json');
  return {
    open: Boolean(liveWindow && !liveWindow.isDestroyed()),
    liveOpen: shouldOpenLive(settings),
    lastDisplayId: settings?.lastDisplayId ?? null,
  };
});
ipcMain.handle('live:restore-saved', () => restoreSavedLiveWindow());

ipcMain.handle('live:set-display', (evt, displayId) => {
  createLiveWindow();
  const displays = screen.getAllDisplays();
  const target = displays.find((d) => d.id === displayId) || screen.getPrimaryDisplay();
  const settings = readJSON('settings.json');
  settings.lastDisplayId = target.id;
  writeJSON('settings.json', settings);
  liveWindow.setBounds(target.bounds);
  liveWindow.setFullScreen(true);
  liveWindow.show();
  return true;
});

ipcMain.handle('live:windowed', () => {
  if (liveWindow && !liveWindow.isDestroyed()) {
    liveWindow.setFullScreen(false);
    liveWindow.setBounds({ x: 100, y: 100, width: 960, height: 540 });
  }
  return true;
});

ipcMain.on('live:update', (evt, payload) => {
  pendingLivePayload = payload || { mode: 'black' };
  if (liveWindow && !liveWindow.isDestroyed()) {
    liveWindow.webContents.send('slide:update', pendingLivePayload);
  }
});

// ---------------------------------------------------------------------------
// IPC — file dialogs (media picking, import/export)
// ---------------------------------------------------------------------------

ipcMain.handle('dialog:open-media', async () => {
  const result = await dialog.showOpenDialog(controlWindow, {
    title: 'Add media',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
      { name: 'Videos', extensions: ['mp4', 'webm', 'ogv', 'mov'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:pick-logo', async () => {
  const result = await dialog.showOpenDialog(controlWindow, {
    title: 'Choose logo image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:import-json', async (evt, title) => {
  const result = await dialog.showOpenDialog(controlWindow, {
    title: title || 'Import',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled) return null;
  try {
    return JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
  } catch (e) {
    return null;
  }
});

ipcMain.handle('dialog:export-json', async (evt, opts) => {
  const { title, defaultName, data } = opts;
  const result = await dialog.showSaveDialog(controlWindow, {
    title: title || 'Export',
    defaultPath: defaultName || 'export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled) return false;
  fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
  return true;
});
