'use client';

import { useState, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

export default function Home() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setAnswer('');
    const q = question.trim();
    if (!q) return;

    try {
      setLoading(true);
      // stream tokens from the API
      const resp = await fetch(`${API_BASE}/api/chat?stream=1&limit=5`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: q }] }),
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '');
        throw new Error(text || `HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by blank lines
        const frames = buffer.split('\n\n');
        // keep last partial frame in buffer
        buffer = frames.pop() || '';

        for (const f of frames) {
          // ignore comments / event: lines, we only care about "data: ..."
          const line = f.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(jsonStr);
            const token = chunk?.choices?.[0]?.delta?.content ?? '';
            if (token) setAnswer(prev => prev + token);
          } catch {
            // non-JSON payload (e.g. our error event). Show raw
            if (jsonStr) setAnswer(prev => prev + jsonStr);
          }
        }
      }
    } catch (e: any) {
      setErr(e?.message || 'Error al llamar a la API');
    } finally {
      setLoading(false);
      if (taRef.current) taRef.current.focus();
    }
  }

  async function pingApi() {
    setErr(null);
    setAnswer('');
    try {
      const r = await fetch(`${API_BASE}/api/chat`, { method: 'GET' });
      const t = await r.text();
      setAnswer(t);
    } catch (e: any) {
      setErr(e?.message || 'Ping falló');
    }
  }

  return (
    <main style={{ maxWidth: 780, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif' }}>
      <h1 style={{ margin: 0 }}>KB Chat UI</h1>
      <p style={{ marginTop: 8, color: '#555' }}>
        API base: <code>{API_BASE || '(no NEXT_PUBLIC_API_BASE)'}</code>
      </p>

      <form onSubmit={ask} style={{ marginTop: 16 }}>
        <label htmlFor="q" style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
          Pregunta
        </label>
        <textarea
          id="q"
          ref={taRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          rows={3}
          placeholder="¿Qué dice el artículo 123 del Código Procesal en España?"
          style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ddd', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" disabled={loading} style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: '#111', color: '#fff' }}>
            {loading ? 'Consultando…' : 'Preguntar'}
          </button>
          <button type="button" onClick={pingApi} disabled={loading} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}>
            Ping API /api/chat (GET)
          </button>
        </div>
      </form>

      {err && (
        <p style={{ color: 'crimson', marginTop: 16 }}>
          <strong>Error:</strong> {err}
        </p>
      )}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Respuesta</h2>
        <div style={{ whiteSpace: 'pre-wrap', padding: 12, border: '1px solid #eee', borderRadius: 8, minHeight: 80 }}>
          {answer || <span style={{ color: '#888' }}>—</span>}
        </div>
      </section>
    </main>
  );
}