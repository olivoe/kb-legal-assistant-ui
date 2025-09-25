'use client';

import { useState } from 'react';

export default function Page() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '';
  const [ping, setPing] = useState<string>('');
  const [error, setError] = useState<string>('');

  const pingApi = async () => {
    setError('');
    setPing('…');
    try {
      const r = await fetch(`${apiBase}/api/chat`, { method: 'GET' });
      const txt = await r.text();
      setPing(`${r.status} ${txt}`);
    } catch (e: any) {
      setError(String(e?.message || e));
      setPing('');
    }
  };

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', fontFamily: 'system-ui' }}>
      <h1>KB Chat (UI)</h1>

      <p>
        <strong>API base (NEXT_PUBLIC_API_BASE):</strong>{' '}
        {apiBase ? <code>{apiBase}</code> : <em>(missing)</em>}
      </p>

      <button onClick={pingApi} style={{ padding: '0.6rem 1rem' }}>
        Ping API /api/chat (GET)
      </button>

      {ping && (
        <p style={{ marginTop: '1rem' }}>
          <strong>Ping result:</strong> {ping}
        </p>
      )}
      {error && (
        <p style={{ marginTop: '1rem', color: 'crimson' }}>
          <strong>Error:</strong> {error}
        </p>
      )}
    </main>
  );
}
