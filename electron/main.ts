import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { checkOllamaStatus, openOllamaDownloadPage, pullModel } from "./ollama";

const PORT = 4317;
const SERVER_URL = `http://127.0.0.1:${PORT}/`;

let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

function standaloneServerPath(): string {
  // Packaged: electron-builder copies .next/standalone into resources/standalone
  // (see the "extraResources" entry in package.json's build config).
  // Dev (electron-dev script, run after `npm run build`): read straight out
  // of the repo's own .next/standalone.
  return app.isPackaged
    ? path.join(process.resourcesPath, "standalone", "server.js")
    : path.join(__dirname, "..", ".next", "standalone", "server.js");
}

function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Server didn't start within ${timeoutMs}ms`));
          } else {
            setTimeout(check, 250);
          }
        });
    };
    check();
  });
}

function startServer(): void {
  // Running the bundled Electron binary with ELECTRON_RUN_AS_NODE makes it
  // behave as a plain Node.js runtime for this one child process — the
  // standard way to run an arbitrary Node script (our Next.js standalone
  // server) from inside an Electron app without shipping a separate Node
  // binary. better-sqlite3's native binding is rebuilt against Electron's
  // own Node ABI for this at package time (see package.json's
  // "electron-rebuild" — @electron/rebuild — postinstall-equivalent step).
  serverProcess = spawn(process.execPath, [standaloneServerPath()], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      SPENDWISE_DATA_DIR: app.getPath("userData"),
    },
    stdio: "pipe",
  });

  serverProcess.stdout?.on("data", (d) => console.log(`[spendwise-server] ${d}`.trimEnd()));
  serverProcess.stderr?.on("data", (d) => console.error(`[spendwise-server] ${d}`.trimEnd()));
  serverProcess.on("exit", (code) => {
    console.log(`[spendwise-server] exited with code ${code}`);
    serverProcess = null;
  });
}

function stopServer(): void {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

async function createWindow(): Promise<void> {
  startServer();
  await waitForServer(SERVER_URL);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 860,
    minHeight: 600,
    title: "SpendWise",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(SERVER_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow().catch((err) => {
    console.error("Failed to start SpendWise:", err);
    app.quit();
  });

  ipcMain.handle("ollama:status", () => checkOllamaStatus());
  ipcMain.handle("ollama:open-download-page", () => openOllamaDownloadPage());
  ipcMain.handle("ollama:pull-model", async (event) => {
    await pullModel((progress) => {
      event.sender.send("ollama:pull-progress", progress);
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((err) => console.error("Failed to reopen window:", err));
    }
  });
});

app.on("window-all-closed", () => {
  stopServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopServer);
