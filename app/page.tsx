// app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "https://api.olivogalarza.com";

export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hola 👋 ¿Qué quieres consultar del contexto?" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const canSend = useMemo(() => input.trim().length > 0 && !busy, [input, busy]);

  async function ask(query: string) {
    setError(null);
    setBusy(true);

    // Append user msg
    setMessages((m) => [...m, { role: "user", content: query }]);

    // Prepare streaming assistant placeholder
    let acc = "";
    const pushDelta = (delta: string) => {
      acc += delta;
      setMessages((m) => {
        const last = m[m.length - 1];
        if (last?.role === "assistant") {
          const copy = m.slice(0, -1);
          return [...copy, { role: "assistant", content: last.content + delta }];
        }
        return [...m, { role: "assistant", content: delta }];
      });
    };

    try {
      // Try SSE first
      const streamUrl = `${API_BASE}/api/chat?stream=1&limit=5`;
      const resp = await fetch(streamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            // send prior messages as context (optional)
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: query },
          ],
        }),
      });

      if (resp.ok && resp.headers.get("content-type")?.includes("text/event-stream") && resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // parse simple SSE lines
          const lines = buffer.split("\n");
          // keep the last partial line in buffer
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const jsonStr = line.slice(5).trim();
            if (jsonStr === "[DONE]") {
              buffer = "";
              break;
            }
            try {
              const chunk = JSON.parse(jsonStr);
              const piece: string | undefined =
                chunk?.choices?.[0]?.delta?.content ?? "";
              if (piece) pushDelta(piece);
            } catch {
              // ignore malformed lines
            }
          }
        }

        if (!acc) {
          // no streamed text received → fallback message
          pushDelta("No consta en el contexto.");
        }
      } else {
        // Fallback: non-stream call (returns JSON with `answer` or topk)
        const resp2 = await fetch(`${API_BASE}/api/chat?limit=5`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              ...messages.map((m) => ({ role: m.role, content: m.content })),
              { role: "user", content: query },
            ],
          }),
        });
        if (!resp2.ok) throw new Error(`API ${resp2.status}`);

        const data = await resp2.json();
        const text: string =
          (typeof data?.answer === "string" && data.answer.trim()) ||
          "No consta en el contexto.";
        pushDelta(text);
      }
    } catch (e: any) {
      setError(e?.message || "Error de red");
      pushDelta("No consta en el contexto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div style={{ fontWeight: 600 }}>Asistente (KB)</div>
        <div style={{ opacity: 0.7, fontSize: 12 }}>
          API: {API_BASE.replace(/^https?:\/\//, "")}
        </div>
      </header>

      <div ref={scrollRef} style={styles.chat}>
        {messages.map((m, i) => (
          <div key={i} style={{ ...styles.bubble, ...(m.role === "user" ? styles.user : styles.assistant) }}>
            <div style={styles.role}>{m.role === "user" ? "Tú" : "Asistente"}</div>
            <div>{m.content}</div>
          </div>
        ))}
      </div>

      <form
        style={styles.footer}
        onSubmit={(e) => {
          e.preventDefault();
          const q = input.trim();
          if (!q) return;
          setInput("");
          ask(q);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta…"
          style={styles.input}
          disabled={busy}
        />
        <button type="submit" style={styles.button} disabled={!canSend}>
          {busy ? "Enviando…" : "Enviar"}
        </button>
      </form>

      {error && <div style={styles.error}>⚠️ {error}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "grid", gridTemplateRows: "auto 1fr auto", height: "100dvh" },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chat: {
    padding: 16,
    overflowY: "auto",
    background: "#fafafa",
  },
  bubble: {
    maxWidth: 820,
    padding: "10px 12px",
    borderRadius: 12,
    margin: "8px 0",
    whiteSpace: "pre-wrap",
    lineHeight: 1.35,
  },
  user: {
    background: "white",
    border: "1px solid #e5e7eb",
    alignSelf: "flex-end",
  },
  assistant: {
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
  },
  role: { fontSize: 12, opacity: 0.6, marginBottom: 6 },
  footer: {
    display: "flex",
    gap: 8,
    padding: 12,
    borderTop: "1px solid #e5e7eb",
    background: "white",
  },
  input: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    outline: "none",
    fontSize: 14,
  },
  button: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #111827",
    background: "#111827",
    color: "white",
    cursor: "pointer",
    fontSize: 14,
  },
  error: {
    position: "fixed",
    right: 12,
    bottom: 72,
    background: "#fee2e2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    padding: "8px 10px",
    borderRadius: 8,
    fontSize: 13,
  },
};