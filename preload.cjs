const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("amrDesktop", {
  chooseLogDirectory: () => ipcRenderer.invoke("choose-log-directory"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  onUpdateStatus: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  }
});
