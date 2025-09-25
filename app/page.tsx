"use client";

import { useState } from "react";

export default function Home() {
  const [ping, setPing] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function pingApi() {
    setPing("");
    setError("");
    try {
      const base =
        process.env.NEXT_PUBLIC_API_BASE ?? "https://api.olivogalarza.com";
      const res = await fetch(`${base}/api/chat`, { method: "GET" });
      const text = await res.text();
      setPing(text);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>KB Chat (UI)</h1>
      <p>Frontend is up. Click to ping the API health check.</p>

      <button
        onClick={pingApi}
        style={{ padding: "0.6rem 1rem", cursor: "pointer" }}
      >
        Ping API /api/chat (GET)
      </button>

      {ping && (
        <p style={{ marginTop: "1rem" }}>
          <strong>Ping result:</strong> {ping}
        </p>
      )}
      {error && (
        <p style={{ marginTop: "1rem", color: "crimson" }}>
          <strong>Error:</strong> {error}
        </p>
      )}
    </main>
  );
}