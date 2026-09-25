const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // data
  getData: (name) => ipcRenderer.invoke('data:get', name),
  saveData: (name, data) => ipcRenderer.invoke('data:save', name, data),
  setSongEditorActive: (active) => ipcRenderer.invoke('songs:set-editor-active', active),
  setThemeMode: (isLight) => ipcRenderer.invoke('settings:set-theme-mode', isLight),
  onThemeChanged: (callback) => ipcRenderer.on('settings:theme-changed', (evt, isLight) => callback(isLight)),
  onFileAction: (callback) => ipcRenderer.on('menu:file-action', (evt, action) => callback(action)),
  onEditAction: (callback) => ipcRenderer.on('menu:edit-action', (evt, action) => callback(action)),
  onViewAction: (callback) => ipcRenderer.on('menu:view-action', (evt, action) => callback(action)),
  setViewMode: (mode) => ipcRenderer.invoke('view:set-mode', mode),
  onProfileAction: (callback) => ipcRenderer.on('menu:profile-action', (evt, action) => callback(action)),
  onLogoChanged: (callback) => ipcRenderer.on('settings:logo-changed', (evt, logoPath) => callback(logoPath)),
  clearLogo: () => ipcRenderer.invoke('settings:clear-logo'),
  setLogo: (logoPath) => ipcRenderer.invoke('settings:set-logo', logoPath),

  // displays / live window
  listDisplays: () => ipcRenderer.invoke('displays:list'),
  openLive: (payload) => ipcRenderer.invoke('live:open', payload),
  closeLive: () => ipcRenderer.invoke('live:close'),
  isLiveOpen: () => ipcRenderer.invoke('live:is-open'),
  restoreSavedLive: () => ipcRenderer.invoke('live:restore-saved'),
  setLiveDisplay: (id) => ipcRenderer.invoke('live:set-display', id),
  setLiveWindowed: () => ipcRenderer.invoke('live:windowed'),
  updateLive: (payload) => ipcRenderer.send('live:update', payload),
  onSlideUpdate: (callback) => ipcRenderer.on('slide:update', (evt, payload) => callback(payload)),
  onLiveStateChanged: (callback) => ipcRenderer.on('live:state-changed', (evt, state) => callback(state)),
  getLiveState: () => ipcRenderer.invoke('live:get-state'),

  // dialogs
  pickMedia: () => ipcRenderer.invoke('dialog:open-media'),
  pickLogo: () => ipcRenderer.invoke('dialog:pick-logo'),
  importJSON: (title) => ipcRenderer.invoke('dialog:import-json', title),
  exportJSON: (opts) => ipcRenderer.invoke('dialog:export-json', opts),

  // helpers
  toFileUrl: (p) => {
    const norm = String(p).replace(/\\/g, '/');
    const withLeadingSlash = norm.startsWith('/') ? norm : `/${norm}`;
    return 'file://' + encodeURI(withLeadingSlash);
  },
});
