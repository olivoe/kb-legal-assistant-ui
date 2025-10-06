// app/api/kb/documents/route.ts
import { NextRequest } from "next/server";
import { loadKB } from "@/lib/rag/kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    const { items } = await loadKB(origin);
    
    // Extract unique document paths from KB items
    const documents = Array.from(new Set(items.map(item => item.file)));
    
    return new Response(JSON.stringify({ 
      ok: true, 
      documents: documents || [],
      count: documents?.length || 0,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 
        "content-type": "application/json",
        "cache-control": "no-store"
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ 
      ok: false, 
      error: String(err?.message ?? err),
      documents: [],
      count: 0
    }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
