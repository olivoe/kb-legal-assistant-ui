// app/page.tsx
'use client';

import { useState } from 'react';

export default function Home() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [raw, setRaw] = useState<any>(null);
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://api.olivogalarza.com';

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setAnswer(null);
    setRaw(null);
    try {
      const r = await fetch(`${API_BASE}/api/chat?limit=5`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: q.trim() }] }),
      });
      const data = await r.json();
      setRaw(data);
      // our API returns `answer` if it used the non-stream branch; fall back to a basic message
      setAnswer(
        typeof data?.answer === 'string' && data.answer.trim()
          ? data.answer.trim()
          : 'No consta en el contexto.'
      );
    } catch (err) {
      setAnswer('Error consultando el servicio.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: 16, fontFamily: 'system-ui, Arial' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Asistente Jurídico (KB)</h1>
      <p style={{ color: '#555', marginBottom: 16 }}>
        Pregunta algo. El UI llamará a <code>{API_BASE}/api/chat</code>.
      </p>

      <form onSubmit={ask} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ej: ¿Qué dice el artículo 123...?"
          style={{ flex: 1, padding: '10px 12px', border: '1px solid #ccc', borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid #111',
            background: '#111',
            color: '#fff',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Consultando…' : 'Preguntar'}
        </button>
      </form>

      {answer && (
        <div style={{ padding: 12, border: '1px solid #e5e5e5', borderRadius: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Respuesta</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{answer}</div>
        </div>
      )}

      {raw && (
        <details>
          <summary style={{ cursor: 'pointer' }}>Depurar (payload crudo)</summary>
          <pre style={{ overflowX: 'auto', background: '#fafafa', padding: 12, borderRadius: 8 }}>
            {JSON.stringify(raw, null, 2)}
          </pre>
        </details>
      )}
    </main>
  );
}