// app/api/rag/search/route.ts
import { NextRequest } from "next/server";
import { embedText } from "@/lib/llm/embed";
import { searchKB } from "@/lib/rag/search";
import { loadKB } from "@/lib/rag/kb";
import { loadSnippetFromMeta } from "@/lib/rag/snippet";
import { genRequestId } from "@/lib/server/reqid";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const reqId = genRequestId();
  const t0 = Date.now();

  try {
    const { question, topK = 6, minScore = 0.25 } = await req.json();

    if (typeof question !== "string" || question.trim().length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Missing question" }), {
        status: 400, headers: { "content-type": "application/json", "x-request-id": reqId }
      });
    }

    const origin = req.nextUrl.origin;
    const { dim } = await loadKB(origin);
    const qVec = await embedText(question);
    if (!Array.isArray(qVec) || qVec.length !== dim) {
      return new Response(JSON.stringify({ ok: false, error: `Embedding dim mismatch. KB=${dim}, q=${qVec?.length ?? 0}` }), {
        status: 500, headers: { "content-type": "application/json", "x-request-id": reqId }
      });
    }

    const hits = await searchKB(qVec, { k: topK, minScore });

    const enriched = await Promise.all(
        hits.map(async (h) => {
          const metaInfo = await loadSnippetFromMeta(h.meta as any);
          const { snippet, relPath } = metaInfo;
          const url = (metaInfo as any)?.url ?? null;
          return {
            id: h.id,
            score: h.score,
            meta: h.meta,
            snippet: (snippet ?? "").slice(0, 300),
            relPath: relPath ?? null,
            url,
          };
        })
      );      

    const ms = Date.now() - t0;
    return new Response(JSON.stringify({ ok: true, hits: enriched, reqId, runtime_ms: ms }), {
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": reqId, "x-runtime-ms": String(ms) },
    });
  } catch (err: any) {
    const ms = Date.now() - t0;
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500,
      headers: { "content-type": "application/json", "x-request-id": reqId, "x-runtime-ms": String(ms) },
    });
  }
}