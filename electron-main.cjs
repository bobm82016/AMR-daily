const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
let updaterModule;

if (!electron.app) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: "ignore",
    env
  }).unref();
  process.exit(0);
}

const { app, BrowserWindow, Menu, dialog, ipcMain } = electron;

const PORT = Number(process.env.PORT || 5177);
let serverInstance;
let mainWindow;
let updaterReady = false;

const baseLocalAppData = process.env.LOCALAPPDATA || process.env.APPDATA || __dirname;
const userDataPath = path.join(baseLocalAppData, "AMRStats");
try {
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath("userData", userDataPath);
} catch {
  // fallback to default if we cannot set custom user data
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
});

ipcMain.handle("choose-log-directory", async () => {
  try {
    const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();
    if (owner) owner.focus();
    const options = {
      title: "選擇 Log TXT 儲存資料夾",
      defaultPath: app.getPath("desktop"),
      properties: ["openDirectory", "createDirectory", "dontAddToRecent"]
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths.length) return "";
    return result.filePaths[0];
  } catch (err) {
    throw new Error(err?.message || "選擇 Log 資料夾失敗");
  }
});

ipcMain.handle("check-for-updates", async () => {
  if (!updaterReady || !updaterModule?.autoUpdater) {
    return { ok: false, message: "尚未設定 OTA 更新網址。" };
  }
  try {
    await updaterModule.autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err?.message || "檢查更新失敗" };
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  const { startServer } = await import("./server.mjs");
  serverInstance = await startServer(PORT);

  mainWindow = new BrowserWindow({
    title: "AMR統計",
    width: 1100,
    height: 780,
    backgroundColor: "#0f151a",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadURL(`http://localhost:${PORT}`);
  setupAutoUpdater();
});

function setupAutoUpdater() {
  const feedConfig = getUpdateFeedConfig();
  if (!feedConfig) {
    sendUpdateStatus("OTA 未啟用：尚未設定 GitHub 更新來源。");
    return;
  }
  if (!app.isPackaged && !isTruthy(process.env.AMR_UPDATE_DEV)) {
    sendUpdateStatus("OTA 未啟用：開發模式不自動更新。");
    return;
  }

  try {
    updaterModule = require("electron-updater");
    const { autoUpdater } = updaterModule;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.setFeedURL(feedConfig);
    autoUpdater.logger = {
      info: (message) => sendUpdateStatus(String(message || "")),
      warn: (message) => sendUpdateStatus(String(message || "")),
      error: (message) => sendUpdateStatus(String(message || ""))
    };

    autoUpdater.on("checking-for-update", () => sendUpdateStatus("正在檢查軟體更新..."));
    autoUpdater.on("update-available", (info) => sendUpdateStatus(`發現新版 ${info.version || ""}，開始下載...`));
    autoUpdater.on("update-not-available", () => sendUpdateStatus("目前已是最新版本。"));
    autoUpdater.on("download-progress", (progress) => {
      const percent = Number(progress.percent || 0).toFixed(1);
      sendUpdateStatus(`新版下載中 ${percent}%`);
    });
    autoUpdater.on("error", (err) => sendUpdateStatus(`OTA 更新失敗：${err?.message || err}`));
    autoUpdater.on("update-downloaded", async (info) => {
      sendUpdateStatus(`新版 ${info.version || ""} 已下載完成。`);
      const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();
      const result = await dialog.showMessageBox(owner || undefined, {
        type: "info",
        buttons: ["立即重啟更新", "稍後"],
        defaultId: 0,
        cancelId: 1,
        title: "AMR統計 更新",
        message: "新版已下載完成，是否立即重啟並更新？"
      });
      if (result.response === 0) autoUpdater.quitAndInstall(false, true);
    });

    updaterReady = true;
    autoUpdater.checkForUpdates().catch((err) => sendUpdateStatus(`檢查更新失敗：${err?.message || err}`));
    setInterval(() => {
      autoUpdater.checkForUpdates().catch((err) => sendUpdateStatus(`檢查更新失敗：${err?.message || err}`));
    }, 6 * 60 * 60 * 1000);
  } catch (err) {
    sendUpdateStatus(`OTA 初始化失敗：${err?.message || err}`);
  }
}

function getUpdateFeedConfig() {
  const envOwner = process.env.GITHUB_OWNER || process.env.AMR_UPDATE_GITHUB_OWNER || "";
  const envRepo = process.env.GITHUB_REPO || process.env.AMR_UPDATE_GITHUB_REPO || "";
  if (envOwner.trim() && envRepo.trim()) {
    return {
      provider: "github",
      owner: envOwner.trim(),
      repo: envRepo.trim(),
      private: isTruthy(process.env.GITHUB_PRIVATE || process.env.AMR_UPDATE_GITHUB_PRIVATE),
      token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || undefined
    };
  }

  const candidates = [
    path.join(userDataPath, "update-config.json"),
    path.join(path.dirname(app.getPath("exe")), "update-config.json"),
    path.join(__dirname, "update-config.json")
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const provider = String(data.provider || "github").trim().toLowerCase();
      if (provider === "github") {
        const owner = String(data.owner || "").trim();
        const repo = String(data.repo || "").trim();
        if (owner && repo) {
          return {
            provider: "github",
            owner,
            repo,
            private: Boolean(data.private),
            token: String(data.token || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim() || undefined
          };
        }
      }
    } catch {
      // ignore invalid optional config
    }
  }
  return null;
}

function sendUpdateStatus(message) {
  if (!message) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", String(message));
  }
}

function isTruthy(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "on";
}
