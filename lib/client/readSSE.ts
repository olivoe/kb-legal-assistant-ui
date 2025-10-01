// lib/client/readSSE.ts
// Simple SSE reader for our /api/rag/stream endpoint.

export type SSEHandlers = {
    onInit?: () => void;
    onMeta?: (payload: any) => void;      // NEW
    onSources?: (payload: any) => void;
    onDelta?: (textDelta: string) => void;
    onMetrics?: (payload: any) => void;   // NEW
    onError?: (err: string) => void;
    onDone?: () => void;
  };

export async function readRagStream(
    endpoint: string,
    body: { question: string; topK?: number; minScore?: number; kbOnly?: boolean },
    handlers: SSEHandlers,
    opts?: { signal?: AbortSignal } // ← NEW
  ) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: opts?.signal, // ← NEW
    });
  if (!res.ok || !res.body) {
    handlers.onError?.(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const flush = (line: string) => {
    // Each SSE line should look like: "event: X" or "data: {...}"
    if (line.startsWith("event:")) {
      // we currently only emit "init" as a named event in server prelude
      const evt = line.slice(6).trim();
      if (evt === "init") handlers.onInit?.();
      return;
    }
    if (!line.startsWith("data:")) return;

    const data = line.slice(5).trim();
    if (!data) return;

    try {
      const json = JSON.parse(data);
      if (json.error) {
        handlers.onError?.(String(json.error));
        return;
      }
      if (json.done) {
        handlers.onDone?.();
        return;
      }
      // meta and sources arrive before deltas
      if (json.event === "sources") {
        handlers.onSources?.(json);
        return;
      }
      if (typeof json.delta === "string") {
        handlers.onDelta?.(json.delta);
        return;
      }
      if (json.event === "meta") {
        handlers.onMeta?.(json);
        return;
      }
      if (json.event === "metrics") {
        handlers.onMetrics?.(json);
        return;
      }

      // ignore any other shapes quietly
    } catch {
      // ignore keep-alives or non-JSON data chunks
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Split on double newline (SSE record boundary)
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const record = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      // Each record may have multiple lines; process individually
      const lines = record.split(/\r?\n/);
      for (const ln of lines) flush(ln.trim());
    }
  }
}