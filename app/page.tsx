'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

const BUILD_TAG = process.env.NEXT_PUBLIC_BUILD_TAG ?? "dev-local";
if (typeof window !== "undefined") {
  console.log("[KB-UI BUILD]", BUILD_TAG, "pathname:", location.pathname);
}

type Role = 'user' | 'assistant';
type Msg = { id: string; role: Role; content: string };

export default function Home() {
  return (
    <main
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          borderBottom: '1px solid #eee',
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <div
          style={{
            maxWidth: 860,
            margin: '0 auto',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>KB Chat UI</h1>
            <div style={{ marginTop: 4, color: '#666', fontSize: 12 }}>
              API base: <code>{API_BASE || '(no NEXT_PUBLIC_API_BASE)'}</code> ·
              <span style={{ marginLeft: 6 }}>BUILD: <code>{BUILD_TAG}</code></span>
            </div>
          </div>
          <Ping />
        </div>
      </header>

      {/* Chat Shell */}
      <ChatShell apiBase={API_BASE} />
    </main>
  );
}

/** Bottom-input, top-thread chat shell wired to your existing /api/chat contract */
function ChatShell({ apiBase, stream = true }: { apiBase: string; stream?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on message updates
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSend) return;

    const q = input.trim();
    const userMsg: Msg = { id: nanoid(), role: 'user', content: q };
    const asstId = nanoid();

    setMessages((m) => [...m, userMsg, { id: asstId, role: 'assistant', content: '' }]);
    setInput('');
    setErr(null);
    setIsSending(true);

    try {
      if (stream) {
        await callStream(apiBase, q, (delta) => {
          setMessages((m) =>
            m.map((msg) => (msg.id === asstId ? { ...msg, content: msg.content + delta } : msg)),
          );
        });
      } else {
        const finalText = await callNonStream(apiBase, q);
        setMessages((m) => m.map((msg) => (msg.id === asstId ? { ...msg, content: finalText } : msg)));
      }
    } catch (e: any) {
      setErr(e?.message || 'Error al llamar a la API');
      setMessages((m) => m.map((msg) => (msg.id === asstId ? { ...msg, content: '⚠️ Error' } : msg)));
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {/* Thread */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          maxWidth: 860,
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.length === 0 && (
          <div style={{ margin: '48px auto 0', maxWidth: 540, textAlign: 'center', color: '#666' }}>
            <p style={{ margin: 0, fontSize: 14 }}>Ask me about Spanish immigration law, or anything else.</p>
            <p style={{ marginTop: 6, fontSize: 12 }}>Shift+Enter for newline • Cmd/Ctrl+Enter to send</p>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} content={m.content} />
        ))}
        {isSending && <TypingIndicator />}
        {err && (
          <div style={{ color: 'crimson', fontSize: 13, marginTop: 4 }}>
            <strong>Error:</strong> {err}
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          borderTop: '1px solid #eee',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '12px 16px', display: 'flex', gap: 8 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            placeholder="Escribe tu mensaje…"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 160,
              resize: 'vertical',
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid #ddd',
              fontSize: 15,
              lineHeight: '20px',
            }}
          />
          <button
            type="submit"
            disabled={!canSend}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: 0,
              background: canSend ? '#111' : '#999',
              color: '#fff',
              fontWeight: 600,
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}
          >
            Send
          </button>
        </div>
      </form>
    </>
  );
}

/** Robust SSE reader for multiple stream formats */
async function callStream(apiBase: string, question: string, onToken: (delta: string) => void) {
  const url = `${apiBase}/api/rag/stream?limit=5`;
  console.log("[STREAM FETCH URL]", url); // <-- TEMP probe
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, topK: 6, minScore: 0.25, kbOnly: true }),
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    throw new Error(text || `HTTP ${resp.status}`);
  }

  // ——— Debug useful headers (now correctly scoped) ———
  {
    const hdrs: Record<string, string> = {};
    resp.headers.forEach((v, k) => (hdrs[k.toLowerCase()] = v));
    console.debug('[HTTP headers]', {
      status: resp.status,
      contentType: hdrs['content-type'],
      xCache: hdrs['x-cache'],
      xCacheKey: hdrs['x-cache-key'],
      runtime: hdrs['x-runtime-ms'],
    });
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Split by SSE frame delimiter
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';

    for (const frame of frames) {
      const lines = frame.split('\n');

      // tolerate "event:" or "event: "
      const eventLine = lines.find((l) => l.startsWith('event:'));
      const eventName = eventLine ? eventLine.replace(/^event:\s*/, '').trim() : '';

      // join all data lines; tolerate "data:" or "data: "
      const dataPayload = lines
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.replace(/^data:\s*/, ''))
        .join('\n')
        .trim();

      if (!dataPayload || dataPayload === '[DONE]') continue;

      // DEBUG: show incoming frames (optional)
      console.debug('[SSE]', {
        event: eventName || '(none)',
        bytes: dataPayload.length,
        preview: dataPayload.slice(0, 80),
      });

      // Try JSON first
      let json: any = null;
      try {
        json = JSON.parse(dataPayload);
      } catch {
        // Not JSON → treat as plain text
        onToken(dataPayload);
        continue;
      }

      // 1) Custom event: response.output_text.delta
      if (eventName === 'response.output_text.delta' && typeof json?.delta === 'string') {
        onToken(json.delta);
        continue;
      }

      // 2) OpenAI-style incremental token
      const token = json?.choices?.[0]?.delta?.content;
      if (typeof token === 'string' && token.length > 0) {
        onToken(token);
        continue;
      }

      // 3) Generic { delta: "…" } without custom event name
      if (typeof json?.delta === 'string') {
        onToken(json.delta);
        continue;
      }

      // 4) Ignore control payloads (sources/completed/etc.)
    }
  }
}

/** Uses your existing non-stream JSON shape: { answer: string } */
async function callNonStream(apiBase: string, question: string): Promise<string> {
  const url = `${apiBase}/api/chat?limit=5`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error((json && JSON.stringify(json)) || `HTTP ${resp.status}`);
  return (json && json.answer) || '(sin respuesta JSON)';
}

function Bubble({ role, content }: { role: Role; content: string }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '86%',
          borderRadius: 16,
          padding: '10px 12px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
          border: isUser ? '0' : '1px solid #eee',
          background: isUser ? '#111' : '#fff',
          color: isUser ? '#fff' : '#111',
          whiteSpace: 'pre-wrap',
          fontSize: 15,
          lineHeight: '20px',
        }}
      >
        {content || '\u00a0'}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#777', fontSize: 12 }}>
      <span>assistant is typing…</span>
    </div>
  );
}

function Ping() {
  const [res, setRes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  async function pingApi() {
    try {
      setLoading(true);
      const r = await fetch(`${API_BASE}/api/chat`, { method: 'GET' });
      const t = await r.text();
      setRes(t);
    } catch (e: any) {
      setRes(e?.message || 'Ping falló');
    } finally {
      setLoading(false);
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={pingApi}
        disabled={loading}
        style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', fontSize: 12 }}
      >
        {loading ? 'Pinging…' : 'Ping /api/chat'}
      </button>
      {res && (
        <span
          style={{
            color: '#666',
            fontSize: 12,
            maxWidth: 260,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {res}
        </span>
      )}
    </div>
  );
}

function nanoid(size = 12) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';
  let id = '';
  const bytes =
    typeof crypto !== 'undefined'
      ? crypto.getRandomValues(new Uint8Array(size))
      : new Uint8Array(size).map(() => Math.floor(Math.random() * 256));
  for (let i = 0; i < size; i++) id += chars[bytes[i] % chars.length];
  return id;
}