import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startServer } from "./server.mjs";

const require = createRequire(import.meta.url);
const { app, BrowserWindow } = require("electron");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5177);
let mainWindow;
let serverInstance;

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
});

app.whenReady().then(async () => {
  serverInstance = await startServer(PORT);

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    backgroundColor: "#0f151a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadURL(`http://localhost:${PORT}`);
});
