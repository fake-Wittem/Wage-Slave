const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wageApp", {
  getInitialState: () => ipcRenderer.invoke("app:get-initial-state"),
  updateConfig: (patch) => ipcRenderer.invoke("app:update-config", patch),
  getUpdateState: () => ipcRenderer.invoke("app:get-update-state"),
  checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("app:install-update"),
  getWeather: (city) => ipcRenderer.invoke("weather:get", city),
  records: {
    autoSaveToday: () => ipcRenderer.invoke("records:auto-save-today"),
    listMonth: (periodKey) => ipcRenderer.invoke("records:list-month", periodKey),
    get: (date) => ipcRenderer.invoke("records:get", date),
    saveManual: (payload) => ipcRenderer.invoke("records:save-manual", payload),
    exportMonth: (periodKey, format) => ipcRenderer.invoke("records:export-month", periodKey, format)
  },
  goals: {
    getSummary: (periodKey) => ipcRenderer.invoke("goals:get-summary", periodKey),
    save: (payload) => ipcRenderer.invoke("goals:save", payload),
    reset: (periodKey) => ipcRenderer.invoke("goals:reset", periodKey)
  },
  collapseWindow: (edge) => ipcRenderer.invoke("window:collapse", edge),
  expandWindow: (options) => ipcRenderer.invoke("window:expand", options),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindowToTray: () => ipcRenderer.invoke("window:close-to-tray"),
  setPointerInside: (inside) => ipcRenderer.invoke("window:set-pointer-inside", inside),
  onConfigUpdated: (handler) => {
    ipcRenderer.on("config-updated", (_event, payload) => handler(payload));
  },
  onThemeUpdated: (handler) => {
    ipcRenderer.on("theme-updated", (_event, theme) => handler(theme));
  },
  onUpdateStatus: (handler) => {
    ipcRenderer.on("update-status", (_event, payload) => handler(payload));
  },
  onWindowCollapsed: (handler) => {
    ipcRenderer.on("window-collapsed", (_event, payload) => handler(payload));
  },
  onWindowExpanded: (handler) => {
    ipcRenderer.on("window-expanded", (_event, payload) => handler(payload));
  }
});
