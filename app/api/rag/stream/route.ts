// app/api/rag/stream/route.ts
import { NextRequest } from "next/server";
import { sseResponse } from "@/lib/server/sse";
import { embedText } from "@/lib/llm/embed";
import { searchKB } from "@/lib/rag/search";
import { loadKB } from "@/lib/rag/kb";
import { loadSnippetFromMeta } from "@/lib/rag/snippet";
import { webFallbackSearch } from "@/lib/web/fallback"; // ← NEW

export const runtime = "nodejs";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";

export async function POST(req: NextRequest) {
  const { question, topK = 6, minScore = 0.25, kbOnly = true } = await req.json();

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }
  if (typeof question !== "string" || question.trim().length === 0) {
    return Response.json({ ok: false, error: "Missing question" }, { status: 400 });
  }

  return sseResponse(async (write) => {
    try {
      // 0) meta
      write(JSON.stringify({ event: "meta", topK, minScore, kbOnly }));

      // 1) Prepare context: embed + local vector search
      const { dim } = await loadKB();
      const qVec = await embedText(question);
      if (!Array.isArray(qVec) || qVec.length !== dim) {
        write(JSON.stringify({ error: `Embedding dim mismatch. KB=${dim}, q=${qVec?.length ?? 0}` }));
        write(JSON.stringify({ done: true }));
        return;
      }

      const hits = await searchKB(qVec, { k: topK, minScore });

      const enriched = await Promise.all(
        hits.map(async (h) => {
          const { snippet, relPath } = await loadSnippetFromMeta(h.meta as any);
          return {
            ...h,
            snippet: (snippet ?? "").slice(0, 700),
            relPath: relPath ?? null,
          };
        })
      );

      // If we have KB context, send KB citations and use them as context.
      if (enriched.length > 0) {
        write(
          JSON.stringify({
            event: "sources",
            citations: enriched.map((h) => ({
              id: h.id,
              score: h.score,
              file: h.meta?.file ?? null,
              start: h.meta?.start ?? null,
              end: h.meta?.end ?? null,
              relPath: h.relPath,
              url: null, // KB has no external URL
              snippet: (h.snippet ?? "").slice(0, 220),
            })),
          })
        );

        // 2) Build compact context blocks from KB
        const ctxBlocks = enriched
          .map((h, i) => {
            const loc = `${h.meta?.file ?? ""} [${h.meta?.start ?? ""}-${h.meta?.end ?? ""}]`;
            return `#${i + 1} ${loc}\n${h.snippet ?? ""}`;
          })
          .join("\n\n---\n\n");

        await streamFromOpenAI(write, question, ctxBlocks);
        return;
      }

      // 1.5) KB empty — try WEB FALLBACK if allowed
      if (!kbOnly) {
        const web = await webFallbackSearch(question, { maxResults: 4, searchDepth: "basic" });

        if (web.length > 0) {
          // Send web citations (with URLs!)
          write(
            JSON.stringify({
              event: "sources",
              citations: web.map((w, i) => ({
                id: `web#${i}`,
                score: 0, // not a vector score
                file: null,
                start: null,
                end: null,
                relPath: null,
                url: w.url,
                snippet: (w.content ?? "").slice(0, 220),
              })),
            })
          );

          // Build context from web content
          const ctxBlocks = web
            .map((w, i) => `#${i + 1} ${w.title ?? w.url}\n${(w.content ?? "").slice(0, 700)}`)
            .join("\n\n---\n\n");

          await streamFromOpenAI(write, question, ctxBlocks);
          return;
        }
      }

      // 1.6) Nothing usable → fixed answer
      write(JSON.stringify({ delta: "No consta en el contexto." }));
      write(JSON.stringify({ done: true }));
    } catch (err: any) {
      write(JSON.stringify({ error: String(err?.message ?? err) }));
      write(JSON.stringify({ done: true }));
    }
  });
}

// Helper to call OpenAI and forward SSE deltas
async function streamFromOpenAI(write: (s: string) => void, question: string, ctxBlocks: string) {
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
    body: JSON.stringify({ model: CHAT_MODEL, messages, temperature: 0.2, stream: true }),
  });

  if (!resp.ok || !resp.body) {
    const errText = await safeText(resp);
    write(JSON.stringify({ error: `LLM error ${resp.status}: ${errText}` }));
    write(JSON.stringify({ done: true }));
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);

      if (!chunk.startsWith("data:")) continue;
      const payload = chunk.slice(5).trim();

      if (payload === "[DONE]") {
        write(JSON.stringify({ done: true }));
        return;
      }

      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          write(JSON.stringify({ delta }));
        }
      } catch {
        // ignore keep-alives / non-JSON
      }
    }
  }

  // safety close
  write(JSON.stringify({ done: true }));
}

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "<no body>";
  }
}