// app/api/rag/answer/route.ts
import { NextRequest } from "next/server";
import { embedText } from "@/lib/llm/embed";
import { searchKB } from "@/lib/rag/search";
import { loadKB } from "@/lib/rag/kb";
import { loadSnippetFromMeta } from "@/lib/rag/snippet";
import { genRequestId } from "@/lib/server/reqid";
// NEW: web fallback
import { webFallbackSearch } from "@/lib/web/fallback";

export const runtime = "nodejs";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";

export async function POST(req: NextRequest) {
  const reqId = genRequestId();
  const t0 = Date.now();
  try {
    const { question, topK = 6, minScore = 0.25, kbOnly = true } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }
    if (typeof question !== "string" || question.trim().length === 0) {
      return Response.json({ ok: false, error: "Missing question" }, { status: 400 });
    }

    // Ensure KB + embedding dim
    const { dim } = await loadKB();

    // 1) Embed query
    const qVec = await embedText(question);
    if (!Array.isArray(qVec) || qVec.length !== dim) {
      return Response.json(
        { ok: false, error: `Embedding dim mismatch. KB=${dim}, q=${qVec?.length ?? 0}` },
        { status: 500 }
      );
    }

    // 2) Vector search
    const hits = await searchKB(qVec, { k: topK, minScore });

    // 3) Snippets (enrich hits)
const kbEnriched = await Promise.all(
    hits.map(async (h) => {
      const { snippet, relPath } = await loadSnippetFromMeta(h.meta as any);
      return {
        ...h,
        snippet: (snippet ?? "").slice(0, 700),
        relPath: relPath ?? null,
      };
    })
  );
  
  // Consider KB "usable" only if at least one snippet has content
  const kbUsable = kbEnriched.some((h) => (h.snippet ?? "").trim().length > 0);  

// ===== Path A: KB usable → use it =====
if (kbUsable) {
    const ctxBlocks = kbEnriched
      .map((h, i) => {
        const loc = `${h.meta?.file ?? ""} [${h.meta?.start ?? ""}-${h.meta?.end ?? ""}]`;
        return `#${i + 1} ${loc}\n${h.snippet ?? ""}`;
      })
      .join("\n\n---\n\n");
  
    const answer = await askOpenAI(question, ctxBlocks);
  
    return Response.json({
      ok: true,
      question,
      answer,
      citations: kbEnriched.map((h) => ({
        id: h.id,
        score: h.score,
        file: h.meta?.file ?? null,
        start: h.meta?.start ?? null,
        end: h.meta?.end ?? null,
        snippet: (h.snippet ?? "").slice(0, 300),
        relPath: h.relPath,     // ← include relPath for UI "Open text"
        url: null,              // KB has no external URL
      })),
      reqId,
      runtime_ms: Date.now() - t0,
    });
  }
  
  // ===== Path B: KB not usable; try WEB fallback if allowed =====
  if (!kbOnly) {
    const web = await webFallbackSearch(question, { maxResults: 4, searchDepth: "basic" });
  
    if (web.length > 0) {
      const ctxBlocks = web
        .map((w, i) => `#${i + 1} ${w.title ?? w.url}\n${(w.content ?? "").slice(0, 700)}`)
        .join("\n\n---\n\n");
  
      const answer = await askOpenAI(question, ctxBlocks);
  
      return Response.json({
        ok: true,
        question,
        answer,
        citations: web.map((w, i) => ({
          id: `web#${i}`,
          score: 0,
          file: null,
          start: null,
          end: null,
          snippet: (w.content ?? "").slice(0, 300),
          relPath: null,
          url: w.url, // ← UI will render "Open source"
        })),
        reqId,
        runtime_ms: Date.now() - t0,
      });
    }
  }
  
  // ===== Path C: nothing usable anywhere =====
  return Response.json({
    ok: true,
    question,
    answer: "No consta en el contexto.",
    citations: [],
    reqId,
    runtime_ms: Date.now() - t0,
  });
  
  } catch (err: any) {
    return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

async function askOpenAI(question: string, ctxBlocks: string): Promise<string> {
  const messages = [
    {
      role: "system",
      content:
        "You are a Spanish legal assistant. Answer ONLY using the provided context blocks. If the context lacks the answer, reply exactly: 'No consta en el contexto.' Then stop.",
    },
    {
      role: "user",
      content: `Pregunta: ${question}\n\nContexto (fragmentos):\n${ctxBlocks}`,
    },
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
    throw new Error(`LLM error ${resp.status}: ${errText}`);
  }

  const json = await resp.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "<no body>";
  }
}