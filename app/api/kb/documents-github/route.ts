// app/api/kb/documents-github/route.ts
import { NextRequest } from "next/server";
import { loadKB } from "@/lib/rag/kb";
import { getAllDocumentsFromGitHub, isGitHubConfigured, getRepositoryInfo } from "@/lib/github/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    
    // Try to get documents from GitHub first
    let documents: string[] = [];
    let source = 'local';
    let repositoryInfo = null;

    if (isGitHubConfigured()) {
      try {
        console.log('Attempting to fetch documents from GitHub...');
        const githubDocuments = await getAllDocumentsFromGitHub();
        if (githubDocuments.length > 0) {
          documents = githubDocuments;
          source = 'github';
          repositoryInfo = await getRepositoryInfo();
          console.log(`Successfully fetched ${documents.length} documents from GitHub`);
        } else {
          console.log('No documents found in GitHub repository, falling back to local KB');
        }
      } catch (error) {
        console.error('GitHub fetch failed, falling back to local KB:', error);
      }
    }

    // Fallback to local KB if GitHub failed or not configured
    if (documents.length === 0) {
      try {
        const { items } = await loadKB(origin);
        documents = Array.from(new Set(items.map(item => item.file)));
        source = 'local';
        console.log(`Using ${documents.length} documents from local KB`);
      } catch (error) {
        console.error('Local KB fetch failed:', error);
        documents = [];
      }
    }
    
    return new Response(JSON.stringify({ 
      ok: true, 
      documents: documents || [],
      count: documents?.length || 0,
      source: source,
      repository: repositoryInfo,
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
      count: 0,
      source: 'error'
    }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
