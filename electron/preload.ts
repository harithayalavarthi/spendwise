import { contextBridge, ipcRenderer } from "electron";
import type { OllamaStatus, PullProgress } from "./ollama";

// The Next.js app feature-detects `window.spendwiseElectron` to decide
// whether to show Electron-only UI (the Ollama setup banner) — this object
// is undefined when the app runs as a normal website/dev server, so none of
// that code path is ever reached outside the packaged app.
contextBridge.exposeInMainWorld("spendwiseElectron", {
  isElectron: true,
  ollamaStatus: (): Promise<OllamaStatus> => ipcRenderer.invoke("ollama:status"),
  openOllamaDownloadPage: (): Promise<void> => ipcRenderer.invoke("ollama:open-download-page"),
  pullModel: (): Promise<void> => ipcRenderer.invoke("ollama:pull-model"),
  onPullProgress: (callback: (progress: PullProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: PullProgress) => callback(progress);
    ipcRenderer.on("ollama:pull-progress", listener);
    return () => ipcRenderer.removeListener("ollama:pull-progress", listener);
  },
});
