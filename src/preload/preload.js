const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wageApp", {
  getInitialState: () => ipcRenderer.invoke("app:get-initial-state"),
  updateConfig: (patch) => ipcRenderer.invoke("app:update-config", patch),
  collapseWindow: (edge) => ipcRenderer.invoke("window:collapse", edge),
  expandWindow: () => ipcRenderer.invoke("window:expand"),
  setPointerInside: (inside) => ipcRenderer.invoke("window:set-pointer-inside", inside),
  onConfigUpdated: (handler) => {
    ipcRenderer.on("config-updated", (_event, payload) => handler(payload));
  },
  onThemeUpdated: (handler) => {
    ipcRenderer.on("theme-updated", (_event, theme) => handler(theme));
  },
  onWindowCollapsed: (handler) => {
    ipcRenderer.on("window-collapsed", (_event, payload) => handler(payload));
  },
  onWindowExpanded: (handler) => {
    ipcRenderer.on("window-expanded", (_event, payload) => handler(payload));
  }
});
