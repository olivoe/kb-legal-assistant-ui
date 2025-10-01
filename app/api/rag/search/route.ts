// app/api/rag/search/route.ts
import { NextRequest } from "next/server";
import { embedText } from "@/lib/llm/embed";
import { searchKB } from "@/lib/rag/search";
import { loadKB } from "@/lib/rag/kb";
import { loadSnippetFromMeta } from "@/lib/rag/snippet";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { question, topK = 6, minScore = 0.25 } = await req.json();
    if (typeof question !== "string" || question.trim().length === 0) {
      return Response.json({ ok: false, error: "Missing question" }, { status: 400 });
    }

    // Ensure KB + embedding dim
    const origin = new URL(req.url).origin;
    const { dim } = await loadKB(origin);

    // Embed query
    const qVec = await embedText(question);
    if (!Array.isArray(qVec) || qVec.length !== dim) {
      return Response.json(
        { ok: false, error: `Embedding dim mismatch. KB=${dim}, q=${qVec?.length ?? 0}` },
        { status: 500 }
      );
    }

    // Vector search
    const hits = await searchKB(qVec, { k: topK, minScore });

    // Enrich with snippet (HTTP-first)
    const enriched = await Promise.all(
      hits.map(async (h) => {
        const { snippet, relPath } = await loadSnippetFromMeta(h.meta as any, origin);
        return {
          id: h.id,
          score: h.score,
          meta: h.meta,
          snippet,     // ← keep snippet only
          relPath: relPath ?? null,
        };
      })
    );

    return Response.json({
      ok: true,
      question,
      topK,
      minScore,
      embedding_dim: dim,
      hits: enriched,
    });
  } catch (err: any) {
    return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}