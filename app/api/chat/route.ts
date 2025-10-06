// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { genRequestId } from "@/lib/server/reqid";
import { embedText } from "@/lib/llm/embed";
import { searchKB } from "@/lib/rag/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ======================= (A) Add this helper near the top =======================
function withDebugHeaders(res: NextResponse, headers: Record<string, string>) {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

function logMetrics(metrics: Record<string, unknown>) {
  // Single JSON line for easy grep / dashboarding
  console.log(JSON.stringify({ level: "info", event: "rag.metrics", ...metrics }));
}
// ==============================================================================

// Simple ping for your header button
export async function GET() {
  const reqId = genRequestId();
  const t0 = Date.now();
  const headers: Record<string, string> = {
    "cache-control": "no-store",
    "X-Request-Id": reqId,
    "X-Runtime-MS": String(Date.now() - t0),
    "Access-Control-Expose-Headers": "x-probe, x-rag-top-score, x-rag-topk, x-rag-min-score, x-route",
    "x-probe": "ui-sse-patch-1",
  };
  const res = new NextResponse("ok", { status: 200 });
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function POST(req: NextRequest) {
  const reqId = genRequestId();
  const t0 = Date.now();

  // 🔁 Use Next.js' parsed URL (reliable on Vercel)
  const url = req.nextUrl;
  const streamParam = url.searchParams.get("stream");
  const stream = streamParam === "1" || streamParam === "true";

  // 🛑 TEMP: disable /api/chat streaming to force the UI to /api/rag/stream
  if (stream) {
    return new Response("chat proxy disabled; use /api/rag/stream", {
      status: 410,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "x-probe": "chat-stream-disabled/nextUrl",
        "x-stream-param": String(streamParam),
        "X-Request-Id": reqId,
        "X-Runtime-MS": String(Date.now() - t0),
      },
    });
  }

  // For now, non-streaming POST to /api/chat remains disabled during migration
  return new Response("chat proxy disabled; use /api/rag/answer or /api/rag/stream", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "x-probe": "chat-post-hard-disabled",
      "X-Request-Id": reqId,
      "X-Runtime-MS": String(Date.now() - t0),
    },
  });
}