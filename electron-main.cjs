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
let latestVersion = "";

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
    const result = await updaterModule.autoUpdater.checkForUpdates();
    updateLatestVersion(result?.updateInfo?.version);
    return { ok: true, versionInfo: getVersionInfo() };
  } catch (err) {
    return { ok: false, message: formatUpdateError(err) };
  }
});

ipcMain.handle("get-version-info", () => getVersionInfo());

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
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.setFeedURL(feedConfig);
    autoUpdater.logger = {
      info: (message) => sendUpdateStatus(String(message || "")),
      warn: (message) => sendUpdateStatus(String(message || "")),
      error: (message) => sendUpdateStatus(formatUpdateError(message))
    };

    autoUpdater.on("checking-for-update", () => sendUpdateStatus("正在檢查軟體更新..."));
    autoUpdater.on("update-available", async (info) => {
      updateLatestVersion(info?.version);
      sendUpdateStatus(`發現新版 ${info.version || ""}。`);
      const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();
      const result = await dialog.showMessageBox(owner || undefined, {
        type: "question",
        buttons: ["下載更新", "稍後"],
        defaultId: 0,
        cancelId: 1,
        title: "AMR統計 更新",
        message: `發現新版 ${info.version || ""}。是否要現在下載？`,
        detail: `目前版本：${app.getVersion()}`
      });
      if (result.response === 0) {
        sendUpdateStatus(`開始下載新版 ${info.version || ""}...`);
        autoUpdater.downloadUpdate().catch((err) => sendUpdateStatus(formatUpdateError(err)));
      } else {
        sendUpdateStatus(`已略過新版 ${info.version || ""}，可稍後再檢查更新。`);
      }
    });
    autoUpdater.on("update-not-available", (info) => {
      updateLatestVersion(info?.version || app.getVersion());
      sendUpdateStatus("目前已是最新版本。");
    });
    autoUpdater.on("download-progress", (progress) => {
      const percent = Number(progress.percent || 0).toFixed(1);
      sendUpdateStatus(`新版下載中 ${percent}%`);
    });
    autoUpdater.on("error", (err) => sendUpdateStatus(formatUpdateError(err)));
    autoUpdater.on("update-downloaded", async (info) => {
      updateLatestVersion(info?.version);
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
    autoUpdater.checkForUpdates().catch((err) => sendUpdateStatus(formatUpdateError(err)));
    setInterval(() => {
      autoUpdater.checkForUpdates().catch((err) => sendUpdateStatus(formatUpdateError(err)));
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
  return {
    provider: "github",
    owner: "bobm82016",
    repo: "AMR-daily",
    private: false,
    token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || undefined
  };
}

function sendUpdateStatus(message) {
  if (!message) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", String(message));
  }
}

function getVersionInfo() {
  return {
    currentVersion: app.getVersion(),
    latestVersion: latestVersion || ""
  };
}

function updateLatestVersion(version) {
  const normalized = String(version || "").trim();
  if (!normalized) return;
  latestVersion = normalized;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("version-info", getVersionInfo());
  }
}

function formatUpdateError(error) {
  const raw = String(error?.message || error || "").trim();
  const feed = getUpdateFeedConfig();
  const repoLabel = feed?.provider === "github" ? `${feed.owner}/${feed.repo}` : "目前設定的更新來源";
  const urlMatch = raw.match(/https:\/\/github\.com\/[^\s"'\\]+/i);
  const detailUrl = urlMatch ? ` (${urlMatch[0]})` : "";

  if (/\b404\b/.test(raw)) {
    return `檢查更新失敗：找不到 GitHub 更新來源 ${repoLabel}，或此 repository 是 private 但沒有提供 GH_TOKEN/GITHUB_TOKEN。${detailUrl}`;
  }
  if (/\b401\b|\b403\b|unauthorized|forbidden/i.test(raw)) {
    return `檢查更新失敗：GitHub 更新來源 ${repoLabel} 沒有讀取權限，請確認 token 或 repository 權限設定。`;
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network|socket/i.test(raw)) {
    return "檢查更新失敗：無法連線到 GitHub，請確認網路連線後再試。";
  }
  return raw ? `檢查更新失敗：${raw.split(/\r?\n/)[0]}` : "檢查更新失敗：未知錯誤。";
}

function isTruthy(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "on";
}
