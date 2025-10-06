// app/api/rag/stream/route.ts
import { NextRequest } from "next/server";
import { genRequestId } from "@/lib/server/reqid";
import { embedText } from "@/lib/llm/embed";
import { searchKB } from "@/lib/rag/search";
import { loadKB } from "@/lib/rag/kb";
import { loadSnippetFromMeta } from "@/lib/rag/snippet";
import { webFallback } from "@/lib/rag/web";
import { rewriteEs } from "@/lib/rag/rewrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";
function isInSpanishImmigrationDomainStrict(original: string, rewritten?: string): boolean {
  const texts = [original || "", rewritten || ""].map((t) => t.toLowerCase());
  const negatives = [
    "h-1b", "h1b", "h1-b", "h 1b", "h‑1b",
    "uscis", "green card",
    "b1", "b2", "b1/b2", "f-1", "f1", "j-1", "j1",
    "usa", "united states", "estados unidos", "eeuu", "ee.uu.",
  ];
  if (texts.some((s) => negatives.some((k) => s.includes(k)))) return false;
  const spainMarkers = [
    "españa", "espana", "boe", "boe.es", "extranjería", "extranjeria", "nie", "tie",
    "ministerio", "sede electrónica", "sede electronica", "modelo ex", "arraigo", "cita previa",
    "nacionalidad", "refugiados", "refugiado", "asilo", "asilados",
  ];
  // Treat as in-domain if Spain markers present OR volatile immigration keywords appear
  const volatile = /tasas|formularios|convocatoria|convocatorias|actualizada|vigente|\bultima\b|\búltima\b|estudiante|estudiantes/i;
  return texts.some((s) => spainMarkers.some((k) => s.includes(k)) || volatile.test(s));
}

function logRouteMetrics(data: Record<string, unknown>) {
  try { console.log(JSON.stringify({ level: "info", event: "rag.route", ...data })); } catch {}
}


function sse(data: string) {
  return `data: ${data}\n\n`;
}
function ev(name: string, data?: any) {
  return `event: ${name}\n${data ? sse(JSON.stringify(data)).slice(5) : "\n"}`;
}

export async function POST(req: NextRequest) {
  const reqId = genRequestId();
  const t0 = Date.now();

  try {
    const { question, topK = 6, minScore = 0.25, kbOnly = true } = await req.json();
    const rewrittenQ = rewriteEs(question);

    if (!process.env.OPENAI_API_KEY) {
      return new Response(sse(JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY" })), {
        status: 500,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }
    if (!question || typeof question !== "string" || !question.trim()) {
      return new Response(sse(JSON.stringify({ ok: false, error: "Missing question" })), {
        status: 400,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ---------- (A) Compute KB hits up-front so we can expose metrics via headers ----------
    const origin = req.nextUrl.origin;
    const { dim } = await loadKB(origin);
    const qVec = await embedText(rewrittenQ);    
    let hits: Array<{
      id: string;
      score: number;
      meta: any;
    }> = [];

    if (Array.isArray(qVec) && qVec.length === dim) {
      hits = await searchKB(qVec, { k: topK, minScore });
    }

    const topScores = (hits ?? []).map(h => h?.score ?? 0).slice(0, 5);
    const topScore = topScores[0] ?? 0;
    const inDomain = isInSpanishImmigrationDomainStrict(question, rewrittenQ);
    const isVolatile = /tasas|formularios|convocatoria|convocatorias|actualizada|vigente|\bultima\b|\búltima\b|estudiante|estudiantes/i.test(rewrittenQ);
    let route = "KB_ONLY" as "KB_ONLY" | "KB_EMPTY" | "WEB_FALLBACK" | "GUIDANCE" | "SPECIALIZATION";
    if (hits.length > 0) route = "KB_ONLY";
    else if (kbOnly) route = "KB_EMPTY";
    else route = isVolatile ? "GUIDANCE" : "WEB_FALLBACK";

    // optional source log line
    try {
      console.log(JSON.stringify({
        level: "info",
        event: "rag.metrics.source",
        top_scores: topScores,
        top_score: topScore,
        MIN_SCORE: minScore,
        TOP_K: topK,
        route,
        ts: new Date().toISOString(),
      }));
    } catch {}
    // --------------------------------------------------------------------------------------

    // Hard gate: if out-of-domain, immediately stream specialization message and return
    if (!inDomain) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      (async () => {
        await writer.write(sse(JSON.stringify({ delta: "Esta IA se especializa solo en temas de Inmigración a España." })));
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms })));
        await writer.write(sse(JSON.stringify({ done: true })));
        await writer.close();
      })();

      const sseHeaders: Record<string, string> = {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Expose-Headers":
          "x-probe, x-rag-top-score, x-rag-topk, x-rag-min-score, x-route, x-domain",
        "x-probe": "rag-sse-headers-2",
        "x-rag-top-score": String(topScore),
        "x-rag-topk": String(topK),
        "x-rag-min-score": String(minScore),
        "x-route": "SPECIALIZATION",
        "x-domain": "out",
      };
      return new Response(readable, { status: 200, headers: sseHeaders });
    }

    // Create our TransformStream AFTER computing hits so headers are ready
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    (async () => {
      // 1) init + meta
      await writer.write(ev("init", { ok: true }));
      await writer.write(sse(JSON.stringify({
        event: "meta",
        reqId,
        topK,
        minScore,
        kbOnly,
        q_original: question,
        q_rewritten: rewrittenQ
      })));      

      // 2) If embedding mismatch, short-circuit with error + done
      if (!Array.isArray(qVec) || qVec.length !== dim) {
        await writer.write(
          sse(JSON.stringify({ event: "error", reqId, error: `Embedding dim mismatch. KB=${dim}, q=${qVec?.length ?? 0}` })),
        );
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms })));
        await writer.write(sse(JSON.stringify({ done: true })));
        await writer.close();
        return;
      }

      // 3) Enrich KB hits with snippet/relPath (or web fallback)
      let enriched: Array<{
        id: string;
        score: number;
        meta: any;
        snippet?: string;
        relPath?: string | null;
        url?: string | null;
      }> = [];
      let actualRoute = route; // Track actual route used

      if (hits.length > 0) {
        enriched = await Promise.all(
          hits.map(async (h) => {
            const metaInfo = await loadSnippetFromMeta(h.meta as any);
            const { snippet, relPath } = metaInfo;
            const url = (metaInfo as any)?.url ?? null;
            return { ...h, snippet, relPath, url };
          }),
        );
      } else if (!kbOnly) {
        const needFallback = hits.length === 0 || topScore < Math.max(minScore, 0.65) || isVolatile;
        let web: Array<{ snippet: string; url: string }> = [];
        if (needFallback) {
          const primary = isVolatile
            ? `${rewrittenQ} España tasas estudiante site:boe.es OR site:exteriores.gob.es OR site:sepe.es OR site:inclusion.gob.es`
            : `${rewrittenQ} España`;
          web = await webFallback(primary, 4);
          if (!web || web.length === 0) {
            const secondary = `${rewrittenQ} España tasas estudiantes site:universia.es OR site:europa.eu OR site:boe.es`;
            web = await webFallback(secondary, 4);
          }
        }
        enriched = (web || []).map((w, idx) => ({
          id: `web#${idx}`,
          score: 0,
          meta: { file: null, start: null, end: null },
          snippet: w.snippet ?? "",
          relPath: null,
          url: w.url ?? null,
        }));
        // Update route to reflect web usage
        if (enriched.length > 0) {
          actualRoute = isVolatile ? "GUIDANCE" : "WEB_FALLBACK";
        }
      }

      // 4) Emit sources early
      const citations = enriched.map((h) => ({
        id: h.id,
        score: h.score,
        file: h.meta?.file ?? null,
        start: h.meta?.start ?? null,
        end: h.meta?.end ?? null,
        snippet: (h.snippet ?? "").slice(0, 300),
        relPath: h.relPath ?? null,
        url: h.url ?? null,
      }));
      await writer.write(sse(JSON.stringify({ event: "sources", citations })));

      // 5) Out-of-domain hard gate: specialization message when no evidence
      if (!inDomain && enriched.length === 0) {
        await writer.write(sse(JSON.stringify({ delta: "Esta IA se especializa solo en temas de Inmigración a España." })));
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms })));
        await writer.write(sse(JSON.stringify({ done: true })));
        await writer.close();
        return;
      }

      // 6) If still empty → guidance response
      if (enriched.length === 0) {
        const guidance = "En el contexto de la Inmigración a España, ‘tasas estudiantes actualizadas’ puede referirse a: [A] tasas de visado de estudiante, [B] tasas de expedición/renovación de TIE para estudiantes, [C] tasas administrativas en sedes oficiales. Indica el contexto específico (tipo de trámite, organismo o año) para afinar la respuesta.";
        await writer.write(sse(JSON.stringify({ delta: guidance })));
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms, route: "GUIDANCE" })));
        await writer.write(sse(JSON.stringify({ done: true })));
        await writer.close();
        return;
      }

      // 7) Build context and stream LLM
      const ctxBlocks = enriched
        .map((h, i) => {
          const loc = `${h.meta?.file ?? ""} [${h.meta?.start ?? ""}-${h.meta?.end ?? ""}]`;
          const snip = (h.snippet ?? "").slice(0, 700);
          return `#${i + 1} ${loc}\n${snip}`;
        })
        .join("\n\n---\n\n");

      const messages = [
        {
          role: "system",
          content:
            "You are a Spanish legal assistant specializing in Spanish Immigration Law. Answer ONLY using the provided context blocks. Provide helpful, accurate information based on the context. If the context doesn't contain specific information, provide general guidance about Spanish immigration procedures.",
        },
        { role: "user", content: `Pregunta: ${question}\n\nContexto (fragmentos):\n${ctxBlocks}` },
      ];

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages,
          temperature: 0.2,
          stream: true,
        }),
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => "");
        await writer.write(sse(JSON.stringify({ event: "error", reqId, error: text || `LLM error ${resp.status}` })));
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms })));
        await writer.write(sse(JSON.stringify({ done: true })));
        await writer.close();
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        for (const line of buffer.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload);
            const delta: string | undefined = obj?.choices?.[0]?.delta?.content;
            if (delta) await writer.write(sse(JSON.stringify({ delta })));
          } catch {}
        }
        const lastNl = buffer.lastIndexOf("\n");
        buffer = lastNl >= 0 ? buffer.slice(lastNl + 1) : buffer;
      }

      const ms = Date.now() - t0;
      await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms, route: actualRoute })));
      await writer.write(sse(JSON.stringify({ done: true })));
      await writer.close();
    })().catch(async (e) => {
      try {
        await writer.write(sse(JSON.stringify({ event: "error", reqId, error: String(e?.message ?? e) })));
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms })));
        await writer.write(sse(JSON.stringify({ done: true })));
      } finally {
        await writer.close();
      }
    });

    // ---------- (B) Response headers incl. RAG metrics ----------
    const sseHeaders: Record<string, string> = {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Expose-Headers":
        "x-probe, x-rag-top-score, x-rag-topk, x-rag-min-score, x-route, x-domain",
      "x-probe": "rag-sse-headers-2",
      "x-rag-top-score": String(topScore),
      "x-rag-topk": String(topK),
      "x-rag-min-score": String(minScore),
      "x-route": route,
      "x-domain": inDomain ? "in" : "out",
    };

    return new Response(readable, { status: 200, headers: sseHeaders });
  } catch (err: any) {
    return new Response(sse(JSON.stringify({ ok: false, error: String(err?.message ?? err) })), {
      status: 500,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  }
}