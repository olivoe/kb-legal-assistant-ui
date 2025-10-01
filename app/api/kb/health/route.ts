// app/api/kb/health/route.ts
import { NextRequest } from "next/server";

export const runtime = "edge";

async function fetchKB(req: NextRequest) {
  const { origin } = new URL(req.url);
  const kbUrl = `${origin}/embeddings.json`;
  const res = await fetch(kbUrl, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to fetch embeddings.json: ${res.status}`);
  return res.json() as Promise<
    Array<{ id: string; text: string; meta?: any; embedding: number[] }>
  >;
}

export async function GET(req: NextRequest) {
  try {
    const data = await fetchKB(req);

    if (!Array.isArray(data) || data.length === 0) {
      return Response.json({ ok: false, error: "KB empty or not an array" }, { status: 500 });
    }

    const dim = Array.isArray(data[0].embedding) ? data[0].embedding.length : 0;
    let mismatches = 0;
    const scanN = Math.min(data.length, 200);
    for (let i = 0; i < scanN; i++) {
      const e = data[i]?.embedding;
      if (!Array.isArray(e) || e.length !== dim) mismatches++;
    }

    return Response.json({
      ok: true,
      count: data.length,
      embedding_dim: dim,
      sample_id: data[0].id,
      sample_file: data[0]?.meta?.file ?? null,
      mismatches_scanned_first_200: mismatches
    });
  } catch (err: any) {
    return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}