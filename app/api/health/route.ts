// app/api/health/route.ts
import { NextRequest } from "next/server";
import { genRequestId } from "@/lib/server/reqid";
import { loadKB } from "@/lib/rag/kb";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const reqId = genRequestId();
  const t0 = Date.now();

  let kb = { count: 0, dim: 0 };
  let kbErr: string | null = null;

  try {
    const origin = req.nextUrl.origin;
    const { items, dim } = await loadKB(origin);
    kb = { count: items.length, dim };
  } catch (e: any) {
    kbErr = String(e?.message ?? e);
  }

  const body = {
    ok: true,
    env: {
      OPENAI_CHAT_MODEL: process.env.OPENAI_CHAT_MODEL ?? null,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? null,
      hasTavilyKey: Boolean(process.env.TAVILY_API_KEY),
    },
    kb,
    kbError: kbErr,
  };

  const ms = Date.now() - t0;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": reqId,
      "x-runtime-ms": String(ms),
      "cache-control": "no-store",
    },
  });
}