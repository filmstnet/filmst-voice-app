const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('filmstVoice', {
  // Dialogs
  openFileDialog: () => ipcRenderer.invoke('dialog:open-files'),
  selectExportDir: () => ipcRenderer.invoke('dialog:select-export-dir'),

  // Engine Actions
  analyzeFile: (filePath) => ipcRenderer.invoke('engine:analyze', filePath),
  enhanceFile: (options) => ipcRenderer.invoke('engine:enhance', options),
  cancelProcessing: () => ipcRenderer.invoke('engine:cancel'),

  // Progress listener
  onProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('engine:progress', handler);
    return () => ipcRenderer.removeListener('engine:progress', handler);
  },

  // Shell & Native Drag
  showInFinder: (filePath) => ipcRenderer.invoke('shell:show-item', filePath),
  startDrag: (filePath) => ipcRenderer.invoke('drag:start', filePath),
  openReport: (filePath) => ipcRenderer.invoke('shell:open-report', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // File buffer
  readAudioBuffer: (filePath) => ipcRenderer.invoke('audio:read-buffer', filePath)
});
