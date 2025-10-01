// app/api/health/route.ts
import { NextRequest } from "next/server";
import { genRequestId } from "@/lib/server/reqid";
import { loadKB } from "@/lib/rag/kb";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const reqId = genRequestId();
  const t0 = Date.now();

  const withHeaders = (r: Response) => {
    r.headers.set("Cache-Control", "no-store");
    r.headers.set("X-Request-Id", reqId);
    r.headers.set("X-Runtime-MS", String(Date.now() - t0));
    return r;
  };

  const origin = new URL(req.url).origin;

  const hasKey = !!process.env.OPENAI_API_KEY;
  let kb = { count: 0, dim: 0 };
  let kbError: string | undefined;

  try {
    const { dim, items } = await loadKB(origin);
    kb = { count: items.length, dim };
  } catch (e: any) {
    kbError = String(e?.message ?? e);
  }

  return withHeaders(
    Response.json({
      ok: true,
      hasKey,
      kb,
      kbError,
      env: {
        // lightweight sanity (omit secrets)
        vercelUrl: process.env.VERCEL_URL ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
      },
    })
  );
}