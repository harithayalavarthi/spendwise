import { shell } from "electron";

const OLLAMA_HOST = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5:7b";

export interface OllamaStatus {
  running: boolean;
  modelPulled: boolean;
}

export async function checkOllamaStatus(model = DEFAULT_MODEL): Promise<OllamaStatus> {
  try {
    const versionRes = await fetch(`${OLLAMA_HOST}/api/version`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!versionRes.ok) return { running: false, modelPulled: false };

    const tagsRes = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!tagsRes.ok) return { running: true, modelPulled: false };
    const tags = (await tagsRes.json()) as { models?: Array<{ name: string }> };
    const modelPulled = (tags.models ?? []).some((m) => m.name === model || m.name.startsWith(`${model.split(":")[0]}:`));
    return { running: true, modelPulled };
  } catch {
    return { running: false, modelPulled: false };
  }
}

// Ollama's own installer is a real GUI installer (needs user consent on both
// platforms, admin rights on Windows) — silently downloading and executing
// one ourselves would be both fragile and exactly the kind of thing that
// looks like malware. Send the user to the official download instead; the
// app polls checkOllamaStatus() to notice once it's installed and running.
export function openOllamaDownloadPage(): void {
  shell.openExternal("https://ollama.com/download");
}

export interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
  done: boolean;
  error?: string;
}

export async function pullModel(
  onProgress: (progress: PullProgress) => void,
  model = DEFAULT_MODEL
): Promise<void> {
  const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: true }),
  });

  if (!res.ok || !res.body) {
    onProgress({ status: "failed to start pull", done: true, error: `HTTP ${res.status}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as { status: string; completed?: number; total?: number; error?: string };
        onProgress({
          status: parsed.status,
          completed: parsed.completed,
          total: parsed.total,
          done: parsed.status === "success",
          error: parsed.error,
        });
      } catch {
        // ignore a malformed line rather than aborting the whole pull
      }
    }
  }

  onProgress({ status: "success", done: true });
}
