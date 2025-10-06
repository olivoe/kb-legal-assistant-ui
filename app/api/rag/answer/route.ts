// app/api/rag/answer/route.ts
import { NextRequest } from "next/server";
import { genRequestId } from "@/lib/server/reqid";
import { embedText } from "@/lib/llm/embed";
import { searchKB } from "@/lib/rag/search";
import { loadKB } from "@/lib/rag/kb";
import { loadSnippetFromMeta } from "@/lib/rag/snippet";
import { webFallback } from "@/lib/rag/web";

export const runtime = "nodejs";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "<no body>";
  }
}

// Lightweight domain classifier for "Inmigración a España"
function isInSpanishImmigrationDomain(q: string): boolean {
  const s = (q || "").toLowerCase();
  const keywords = [
    // Spanish
    "inmigr", // inmigración, inmigrante
    "arraigo",
    "residenc",
    "nacionalidad",
    "visado",
    "extranjer",
    "boe",
    "ministerio",
    "permiso de trabajo",
    "nie ",
    "reagrupación",
    "empadron",
    "autorización",
    "renovación",
    "cita previa",
    "tie ",
    "consulado",
    "oficina de extranjería",
    "sede electrónica",
    "modelo ex",
    "tasas",
    "formulario",
    "convocatoria",
    // English equivalents
    "immigrat", // immigration, immigrant
    "residence",
    "nationality",
    "visa",
    "foreign",
    "work permit",
    "consulate",
    "foreigners office",
    "electronic headquarters",
    "fee ",
    "form ",
    "call for applications",
  ];
  return keywords.some(k => s.includes(k));
}

function logRouteMetrics(data: Record<string, unknown>) {
  try { console.log(JSON.stringify({ level: "info", event: "rag.route", ...data })); } catch {}
}

type EnrichedKBHit = {
  id: string;
  score: number;
  meta: any;
  snippet: string;
  relPath: string | null;
  url: string | null; // KB items: null
};

type EnrichedWebHit = {
  id: string; // e.g. web#0
  score: number; // keep 0 for web to avoid confusion
  meta: null;
  snippet: string;
  relPath: null;
  url: string; // non-null
};

export async function POST(req: NextRequest) {
  const reqId = genRequestId();
  const t0 = Date.now();

  try {
    const { question, topK = 6, minScore = 0.25, kbOnly = true } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "content-type": "application/json", "x-request-id": reqId },
      });
    }
    if (typeof question !== "string" || question.trim().length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Missing question" }), {
        status: 400,
        headers: { "content-type": "application/json", "x-request-id": reqId },
      });
    }

    // 1) Load KB + embed query
    const origin = req.nextUrl.origin;
    const { dim } = await loadKB(origin);

    const qVec = await embedText(question);
    if (!Array.isArray(qVec) || qVec.length !== dim) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Embedding dim mismatch. KB=${dim}, q=${qVec?.length ?? 0}`,
        }),
        { status: 500, headers: { "content-type": "application/json", "x-request-id": reqId } }
      );
    }

    // 2) KB search + domain routing
    const inDomain = isInSpanishImmigrationDomain(question);
    const hits = await searchKB(qVec, { k: topK, minScore });
    const topScore = hits[0]?.score ?? 0;

    // 3) Enrich KB hits with snippets/relPath
    const kbEnriched: EnrichedKBHit[] = await Promise.all(
      hits.map(async (h) => {
        const metaInfo = await loadSnippetFromMeta(h.meta as any);
        const { snippet, relPath } = metaInfo;
        // tolerate older return types that lacked `url`
        const url = (metaInfo as any)?.url ?? null;
        return {
          id: h.id,
          score: h.score,
          meta: h.meta,
          snippet: snippet ?? "",
          relPath: relPath ?? null,
          url: url ?? null, // KB items normally null
        };
      })
    );

    // 4) Optional web fallback (only when kbOnly=false and confidence is weak OR volatile topic)
    //    Heuristic: no KB hits OR topScore below max(minScore, 0.65)
    const isVolatile = /tasas|formularios|convocatoria|convocatorias|actualizada|vigente|última|ultima/i.test(question);
    let webEnriched: EnrichedWebHit[] = [];
    if (!kbOnly && (kbEnriched.length === 0 || topScore < Math.max(minScore, 0.65) || isVolatile)) {
      const web = await webFallback(question, 3); // returns [{snippet,url}]
      webEnriched = (web || [])
        .filter((w) => !!w.url)
        .map((w, i) => ({
          id: `web#${i}`,
          score: 0,
          meta: null,
          snippet: w.snippet || "",
          relPath: null,
          url: w.url!,
        }));
    }

    // 5) Combine evidence
    const allEnriched = [...kbEnriched, ...webEnriched];

    if (!inDomain && kbEnriched.length === 0) {
      const ms = Date.now() - t0;
      logRouteMetrics({ reqId, inDomain, route: "specialization", topScore, topK, minScore, ms });
      return new Response(
        JSON.stringify({
          ok: true,
          question,
          answer: "Esta IA está especializada en temas de Inmigración a España.",
          citations: [],
          reqId,
          runtime_ms: ms,
        }),
        { status: 200, headers: { "content-type": "application/json", "x-request-id": reqId, "x-runtime-ms": String(ms) } }
      );
    }

    if (allEnriched.length === 0) {
      const ms = Date.now() - t0;
      logRouteMetrics({ reqId, inDomain, route: "unsure", topScore, topK, minScore, ms });
      return new Response(
        JSON.stringify({
          ok: true,
          question,
          answer: "No consta en el contexto.",
          citations: [],
          reqId,
          runtime_ms: ms,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": reqId,
            "x-runtime-ms": String(ms),
          },
        }
      );
    }

    // 6) Build context blocks (show source location or URL)
    const ctxBlocks = allEnriched
      .map((h, i) => {
        const loc =
          h.url ??
          `${h.meta?.file ?? ""}${h.meta?.start != null && h.meta?.end != null ? ` [${h.meta.start}-${h.meta.end}]` : ""}`;
        const snip = (h.snippet ?? "").slice(0, 700);
        return `#${i + 1} ${loc}\n${snip}`;
      })
      .join("\n\n---\n\n");

    // 7) Ask the LLM (guardrails: only use provided context)
    const messages = [
      {
        role: "system",
        content:
          "You are a Spanish legal assistant. Answer ONLY using the provided context blocks. If the context lacks the answer, reply exactly: 'No consta en el contexto.' Then stop.",
      },
      { role: "user", content: `Pregunta: ${question}\n\nContexto (fragmentos):\n${ctxBlocks}` },
    ];

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: CHAT_MODEL, messages, temperature: 0.2 }),
    });

    if (!resp.ok) {
      const errText = await safeText(resp);
      return new Response(JSON.stringify({ ok: false, error: `LLM error ${resp.status}: ${errText}` }), {
        status: 500,
        headers: { "content-type": "application/json", "x-request-id": reqId },
      });
    }

    const json = await resp.json();
    const answer = json?.choices?.[0]?.message?.content ?? "";

    // 8) Shape citations (KB + web)
    const citations = allEnriched.map((h) => ({
      id: h.id,
      score: h.score,
      file: h.meta?.file ?? null,
      start: h.meta?.start ?? null,
      end: h.meta?.end ?? null,
      snippet: (h.snippet ?? "").slice(0, 300),
      relPath: h.relPath ?? null,
      url: h.url ?? null, // web hits will have a non-null URL
    }));

    const ms = Date.now() - t0;
    logRouteMetrics({ reqId, inDomain, route: webEnriched.length > 0 ? "kb+web" : "kb", topScore, topK, minScore, ms });
    return new Response(
      JSON.stringify({
        ok: true,
        question,
        answer,
        citations,
        reqId,
        runtime_ms: ms,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": reqId,
          "x-runtime-ms": String(ms),
        },
      }
    );
  } catch (err: any) {
    const ms = Date.now() - t0;
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500,
      headers: { "content-type": "application/json", "x-request-id": reqId, "x-runtime-ms": String(ms) },
    });
  }
}