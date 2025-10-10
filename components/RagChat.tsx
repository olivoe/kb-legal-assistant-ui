"use client";

import { useState, useRef, useEffect } from "react";
import { readRagStream } from "@/lib/client/readSSE";

type Citation = {
  id: string;
  score: number;
  file: string | null;
  start: number | null;
  end: number | null;
  snippet?: string;
  relPath?: string | null;
  url?: string | null; // for web fallback sources
};

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function RagChat() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<Citation[]>([]);
  const [topK, setTopK] = useState(12);
  const [minScore, setMinScore] = useState(0.28);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [kbOnly, setKbOnly] = useState(true);
  const ctrlRef = useRef<AbortController | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const answerAccumulator = useRef<string>("");
  const [reqInfo, setReqInfo] = useState<{ id?: string; ms?: number }>({});
  const [routeBadge, setRouteBadge] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const api = (p: string) => `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;

  // RoE disclaimer (one-time per session)
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const disclaimerKey = "roe_disclaimer_shown_ui";

  // Load saved controls once
  useEffect(() => {
    try {
      const savedTopK = localStorage.getItem("rag.topK");
      const savedMinScore = localStorage.getItem("rag.minScore");
      const savedKbOnly = localStorage.getItem("rag.kbOnly");
      if (savedTopK) {
        const n = Math.max(1, Math.min(12, parseInt(savedTopK, 10) || 8));
        setTopK(n);
      }
      if (savedMinScore) {
        const n = Math.max(0, Math.min(1, parseFloat(savedMinScore) || 0.30));
        setMinScore(n);
      }
      if (savedKbOnly) setKbOnly(savedKbOnly === "true");
    } catch {}
  }, []);

  const toggleOpen = (id: string) =>
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));

  async function answerNonStream() {
    if (!q.trim()) return;
    const currentQuestion = q;
    setLoading(true);
    setAnswer("");
    setSources([]);
    setReqInfo({});

    try {
      const res = await fetch(api("/api/rag/answer"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ 
          question: currentQuestion, 
          topK, 
          minScore, 
          kbOnly,
          conversationHistory 
        }),
      });
      const json = await res.json();

      // One-time disclaimer hook (non-stream)
      if (json?.disclaimerInjected && !sessionStorage.getItem(disclaimerKey)) {
        setShowDisclaimer(true);
        sessionStorage.setItem(disclaimerKey, "1");
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const answerText = json.answer || "";
      setAnswer(answerText);
      
      // Update conversation history
      setConversationHistory(prev => [
        ...prev,
        { role: "user", content: currentQuestion },
        { role: "assistant", content: answerText }
      ]);
      
      if (Array.isArray(json.citations)) {
        setSources(
          json.citations.map((c: any) => ({
            id: c.id,
            score: c.score,
            file: c.file ?? null,
            start: c.start ?? null,
            end: c.end ?? null,
            snippet: c.snippet ?? "",
            relPath: c.relPath ?? null,
            url: c.url ?? null,
          }))
        );
      }
    } catch (e: any) {
      setAnswer(`[error: ${e?.message || "LLM error"}]`);
    } finally {
      setLoading(false);
      setQ(""); // Clear input after sending
    }
  }

  async function ask() {
    if (!q.trim()) return;
    const currentQuestion = q;
    setLoading(true);
    setAnswer("");
    setSources([]);
    setReqInfo({});
    answerAccumulator.current = ""; // Reset accumulator

    // create/replace controller
    ctrlRef.current?.abort();
    ctrlRef.current = new AbortController();

    try {
      await readRagStream(
        api("/api/rag/stream"),
        { question: currentQuestion, topK, minScore, kbOnly, conversationHistory },
        {
          onInit: () => {
            console.log("[RagChat] Stream initialized");
          },
          onMeta: (m: any) => {
            console.log("[RagChat] Meta received:", m);
            setReqInfo({ id: m?.reqId });

            // One-time disclaimer hook (stream) — will activate once server emits it in meta
            if (m?.disclaimerInjected && !sessionStorage.getItem(disclaimerKey)) {
              setShowDisclaimer(true);
              sessionStorage.setItem(disclaimerKey, "1");
            }
          },
          onSources: (payload: any) => {
            console.log("[RagChat] Sources received:", payload);
            if (Array.isArray(payload.citations)) {
              setSources(
                payload.citations.map((c: any) => ({
                  id: c.id,
                  score: c.score,
                  file: c.file ?? null,
                  start: c.start ?? null,
                  end: c.end ?? null,
                  snippet: c.snippet ?? "",
                  relPath: c.relPath ?? null,
                  url: c.url ?? null,
                }))
              );
            }
          },
          onDelta: (d: string) => {
            console.log("[RagChat] Delta received:", d.slice(0, 50));
            answerAccumulator.current += d;
            setAnswer((prev) => prev + d);
            areaRef.current?.scrollTo({
              top: areaRef.current.scrollHeight,
              behavior: "smooth",
            });
          },
          onMetrics: (m: any) => {
            console.log("[RagChat] Metrics received:", m);
            setReqInfo((r) => ({ ...r, ms: m?.runtime_ms }));
            if (typeof m?.route === "string") {
              setRouteBadge(m.route);
            }
          },
          onError: (err: string) => {
            console.error("[RagChat] Error:", err);
            const errorMsg = `\n\n[error: ${err}]`;
            answerAccumulator.current += errorMsg;
            setAnswer((prev) =>
              prev ? prev + errorMsg : `[error: ${err}]`
            );
          },
          onDone: () => {
            console.log("[RagChat] Stream done. Final answer length:", answerAccumulator.current.length);
            // Update conversation history when stream completes
            const finalAnswer = answerAccumulator.current;
            if (finalAnswer.trim()) {
              setConversationHistory(prev => [
                ...prev,
                { role: "user", content: currentQuestion },
                { role: "assistant", content: finalAnswer }
              ]);
            }
            setLoading(false);
            setQ(""); // Clear input after sending
          },
        },
        { signal: ctrlRef.current.signal }
      );
    } catch (e: any) {
      console.error("[RagChat] Stream error:", e);
      if (e?.name !== "AbortError") {
        const errorMsg = `[error: ${e.message}]`;
        setAnswer(errorMsg);
        setLoading(false);
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">KB Legal Assistant — RAG Stream</h1>
        {conversationHistory.length > 0 && (
          <button
            onClick={() => {
              setConversationHistory([]);
              setAnswer("");
            }}
            className="text-sm px-3 py-1 rounded-lg border hover:bg-gray-50"
            title="Limpiar historial de conversación"
          >
            Nueva conversación ({conversationHistory.length / 2} mensajes)
          </button>
        )}
      </div>
      
      {routeBadge && (
        <div className="text-xs inline-flex items-center gap-2 rounded-full border px-2 py-1">
          <span className="opacity-60">Ruta</span>
          <strong>{routeBadge}</strong>
          {(routeBadge === "WEB_FALLBACK" || routeBadge === "GUIDANCE") ? (
            <span className="ml-2 rounded-full bg-blue-50 px-2 py-[2px] text-blue-700 border border-blue-200">Consulta web</span>
          ) : null}
        </div>
      )}

      {showDisclaimer && (
        <div className="rounded-2xl p-3 text-sm border shadow-sm">
          Esta IA puede cometer errores; use la información de forma referencial y contáctenos ante cualquier duda.
        </div>
      )}

// In RagChat.tsx, anywhere near the header:
<p className="text-xs opacity-60">API: {api("/api/rag/answer")}</p>

      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Haz tu pregunta…"
          className="flex-1 rounded-xl border px-3 py-2"
        />
        <button
          onClick={ask}
          disabled={loading}
          className="rounded-xl border px-4 py-2 disabled:opacity-50"
        >
          {loading ? "..." : "Ask"}
        </button>
        <button
          onClick={answerNonStream}
          disabled={loading}
          className="rounded-xl border px-4 py-2 disabled:opacity-50"
          title="Call /api/rag/answer (non-stream)"
        >
          {loading ? "…" : "Answer (non-stream)"}
        </button>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span>topK</span>
          <input
            type="number"
            min={1}
            max={12}
            value={topK}
            onChange={(e) => {
              const v = parseInt(e.target.value || "8", 10);
              const clamped = isNaN(v) ? 8 : Math.max(1, Math.min(12, v));
              setTopK(clamped);
              try {
                localStorage.setItem("rag.topK", String(clamped));
              } catch {}
            }}
            className="w-16 rounded-md border px-2 py-1"
          />
        </label>

        <label className="flex items-center gap-2">
          <span>minScore</span>
          <input
            type="number"
            step="0.01"
            min={0}
            max={1}
            value={minScore}
            onChange={(e) => {
              const v = parseFloat(e.target.value || "0.30");
              const clamped = isNaN(v) ? 0.30 : Math.max(0, Math.min(1, v));
              setMinScore(clamped);
              try {
                localStorage.setItem("rag.minScore", String(clamped));
              } catch {}
            }}
            className="w-24 rounded-md border px-2 py-1"
          />
        </label>

        {/* KB-only toggle */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={kbOnly}
            onChange={(e) => {
              const v = e.target.checked;
              setKbOnly(v);
              try {
                localStorage.setItem("rag.kbOnly", String(v));
              } catch {}
            }}
          />
          <span>KB-only</span>
        </label>

        {/* Stop streaming */}
        <button
          onClick={() => {
            ctrlRef.current?.abort();
            setLoading(false);
          }}
          disabled={!loading}
          className="rounded-xl border px-4 py-2 disabled:opacity-50"
          title="Cancel the current stream"
        >
          Stop
        </button>

        {/* Request info (small, optional) */}
        {(reqInfo.id || reqInfo.ms) && (
          <span className="ml-auto text-xs text-gray-500">
            {reqInfo.id ? `req:${reqInfo.id}` : null}
            {reqInfo.id && reqInfo.ms ? " · " : null}
            {typeof reqInfo.ms === "number" ? `${reqInfo.ms} ms` : null}
          </span>
        )}
      </div>

      {sources.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Citations</div>
          <div className="flex flex-col gap-2">
            {sources.map((s, i) => {
              const key = `${s.id}|${s.start}|${s.end}|${i}`;
              const open = !!openIds[key];
              const fileBase = s.file ? s.file.split("/").slice(-1)[0] : "unknown";

              return (
                <div key={key} className="rounded-xl border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleOpen(key)}
                      className="rounded-full border px-3 py-1 text-xs hover:bg-gray-50"
                      title={`${s.file ?? ""}\n[${s.start ?? ""}-${s.end ?? ""}]`}
                    >
                      <span className="font-semibold">#{i + 1}</span> {fileBase}{" "}
                      <span className="opacity-70">
                        ({(s.score ?? 0).toFixed(3)}, {s.start}-{s.end})
                      </span>
                    </button>

                    {/* Right-side actions */}
                    <div className="flex items-center gap-3">
                      {s.relPath && (
                        <a
                          href={`/${s.relPath}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline opacity-80 hover:opacity-100"
                          title="Open sidecar text"
                        >
                          Open text
                        </a>
                      )}
                      {s.url && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline opacity-80 hover:opacity-100"
                          title={s.url}
                        >
                          Open source
                        </a>
                      )}
                    </div>
                  </div>

                  {open && (
                    <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs leading-5">
                      {s.snippet || <span className="opacity-60">(no snippet)</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div
        ref={areaRef}
        className="min-h-[160px] max-h-[360px] overflow-auto rounded-xl border p-3 text-[15px] leading-6"
      >
        {answer || (loading ? "…" : "Respuesta aparecerá aquí.")}
      </div>
    </div>
  );
}