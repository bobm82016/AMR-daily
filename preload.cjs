const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("amrDesktop", {
  chooseLogDirectory: () => ipcRenderer.invoke("choose-log-directory"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  getVersionInfo: () => ipcRenderer.invoke("get-version-info"),
  onUpdateStatus: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  },
  onVersionInfo: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, info) => callback(info);
    ipcRenderer.on("version-info", listener);
    return () => ipcRenderer.removeListener("version-info", listener);
  }
});
