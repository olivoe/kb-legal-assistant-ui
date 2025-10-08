// app/api/kb/documents/route.ts
import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Read from kb_index.json which contains ALL documents
    const indexPath = path.join(process.cwd(), "public", "kb_index.json");
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const documents = JSON.parse(indexContent);
    
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
