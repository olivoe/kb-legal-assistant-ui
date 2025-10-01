// app/api/chat/route.ts
import { NextRequest } from "next/server";
import { genRequestId } from "@/lib/server/reqid";

export const runtime = "nodejs";

// Simple ping for your header button
export async function GET() {
  const reqId = genRequestId();
  const t0 = Date.now();
  const resp = new Response("ok", { headers: { "cache-control": "no-store" } });
  resp.headers.set("X-Request-Id", reqId);
  resp.headers.set("X-Runtime-MS", String(Date.now() - t0));
  return resp;
}

export async function POST(req: NextRequest) {
  const reqId = genRequestId();
  const t0 = Date.now();

  const url = new URL(req.url);
  const stream = url.searchParams.get("stream") === "1";
  const origin = url.origin;

  // Expect OpenAI-style body: { messages: [{role, content}, ...] }
  const body = await req.json().catch(() => ({} as any));
  const msgs = Array.isArray(body?.messages) ? body.messages : [];
  const last = msgs.slice().reverse().find((m: any) => m?.role === "user");
  const question = (last?.content ?? "").toString();

  // Optional knobs (fallback to query params if provided)
  const topK = Number(body?.topK ?? url.searchParams.get("topK") ?? 6);
  const minScore = Number(body?.minScore ?? url.searchParams.get("minScore") ?? 0.25);
  const kbOnly = (body?.kbOnly ?? url.searchParams.get("kbOnly") ?? "true").toString() === "true";

  if (!question.trim()) {
    const out = Response.json(
      { ok: false, error: "Missing user question in messages[]" },
      { status: 400 }
    );
    out.headers.set("X-Request-Id", reqId);
    out.headers.set("X-Runtime-MS", String(Date.now() - t0));
    return out;
  }

  if (stream) {
    // Proxy to /api/rag/stream and pass through SSE
    const upstream = await fetch(`${origin}/api/rag/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, topK, minScore, kbOnly }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      const out = new Response(text || `Upstream error ${upstream.status}`, { status: 500 });
      out.headers.set("X-Request-Id", reqId);
      out.headers.set("X-Runtime-MS", String(Date.now() - t0));
      return out;
    }

    const out = new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Request-Id": reqId,
        "X-Runtime-MS": String(Date.now() - t0),
      },
    });
    return out;
  } else {
    // Non-stream → proxy to /api/rag/answer
    const upstream = await fetch(`${origin}/api/rag/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, topK, minScore, kbOnly }),
    });

    const json = await upstream.json().catch(() => null);
    if (!upstream.ok || !json) {
      const out = Response.json(
        { ok: false, error: `Upstream error ${upstream.status}` },
        { status: 500 }
      );
      out.headers.set("X-Request-Id", reqId);
      out.headers.set("X-Runtime-MS", String(Date.now() - t0));
      return out;
    }

    const out = Response.json({ ok: true, answer: json.answer ?? "" });
    out.headers.set("X-Request-Id", reqId);
    out.headers.set("X-Runtime-MS", String(Date.now() - t0));
    return out;
  }
}