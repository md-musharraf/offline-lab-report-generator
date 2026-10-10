const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  // DB Methods via IPC
  dbQuery: (args) => ipcRenderer.invoke('db-query', args),
  onDbChanged: (callback) => {
    const listener = (event, model) => callback(model);
    ipcRenderer.on('db-changed', listener);
    return () => ipcRenderer.removeListener('db-changed', listener);
  },
  // Backup files
  backupExport: () => ipcRenderer.invoke('backup-export'),
  backupRestore: (file) => ipcRenderer.invoke('backup-restore', file),
  backupOpenFolder: () => ipcRenderer.invoke('backup-open-folder'),
  // License Methods via IPC
  licenseCheck: () => ipcRenderer.invoke('license-check'),
  licenseActivate: (key) => ipcRenderer.invoke('license-activate', key),
  licenseRequestTrial: () => ipcRenderer.invoke('license-request-trial'),
  // Auto-update: a downloaded update waits for "Restart now" or for the app to close
  updateStatus: () => ipcRenderer.invoke('update-status'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdateReady: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('update-ready', listener);
    return () => ipcRenderer.removeListener('update-ready', listener);
  },
  // Machine Interfacing Methods
  machineGetConfig: () => ipcRenderer.invoke('machine-get-config'),
  machineSaveConfig: (config) => ipcRenderer.invoke('machine-save-config', config),
  machineGetStatus: () => ipcRenderer.invoke('machine-get-status'),
  machineStart: () => ipcRenderer.invoke('machine-start'),
  machineStop: () => ipcRenderer.invoke('machine-stop'),
  machineGetLogs: () => ipcRenderer.invoke('machine-get-logs'),
  machineClearLogs: () => ipcRenderer.invoke('machine-clear-logs'),
  machineSimulate: (type) => ipcRenderer.invoke('machine-simulate', type),
  machineListPorts: () => ipcRenderer.invoke('machine-list-ports'),
  machineGetOrphans: () => ipcRenderer.invoke('machine-get-orphans'),
  machineDeleteOrphan: (id) => ipcRenderer.invoke('machine-delete-orphan', id),
  machineReconcileOrphan: (orphanId, orderBarcode) => ipcRenderer.invoke('machine-reconcile-orphan', { orphanId, orderBarcode }),
  
  onMachineStatus: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('machine-status', listener);
    return () => ipcRenderer.removeListener('machine-status', listener);
  },
  onMachineLog: (callback) => {
    const listener = (event, log) => callback(log);
    ipcRenderer.on('machine-log', listener);
    return () => ipcRenderer.removeListener('machine-log', listener);
  },
  onMachineResultParsed: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('result-parsed', listener);
    return () => ipcRenderer.removeListener('result-parsed', listener);
  },
  onOrphansUpdated: (callback) => {
    const listener = (event, list) => callback(list);
    ipcRenderer.on('orphans-updated', listener);
    return () => ipcRenderer.removeListener('orphans-updated', listener);
  },
  onQcSaved: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('qc-saved', listener);
    return () => ipcRenderer.removeListener('qc-saved', listener);
  }
});

