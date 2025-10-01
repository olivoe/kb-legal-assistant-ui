// lib/rag/kb.ts

type KBItem = {
    id: string;
    file: string;
    start: number;
    end: number;
    embedding: number[];
  };
  
  type KB = { model: string; dims: number; items: KBItem[] };
  
  let memo: KB | null = null;
  
  function guessPublicUrl(origin?: string): string {
    if (origin) return origin;
    // Vercel sets VERCEL_URL like “kb-legal-assistant-ui.vercel.app”
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL!;
    return "http://localhost:3000";
  }
  
  /**
   * Load KB embeddings.
   * - Server (Node): read from filesystem to avoid Next.js data cache limits.
   * - Client / fallback: fetch with cache disabled (no-store, revalidate:0).
   */
  export async function loadKB(
    originFromRoute?: string
  ): Promise<{ dim: number; items: KBItem[] }> {
    if (memo) return { dim: memo.dims, items: memo.items };
  
    // 1) Server path: read from FS (preferred, avoids 2MB cache limit)
    if (typeof window === "undefined") {
      try {
        const { readFile } = await import("fs/promises");
        const { join } = await import("path");
        const abs = join(process.cwd(), "public", "embeddings.json");
        const raw = await readFile(abs, "utf8");
        const json = JSON.parse(raw) as KB;
        if (!json || !Array.isArray(json.items) || typeof json.dims !== "number") {
          throw new Error("Bad embeddings.json shape");
        }
        memo = json;
        return { dim: memo.dims, items: memo.items };
      } catch {
        // fall through to HTTP fetch
      }
    }
  
    // 2) Client/fallback: fetch from public URL with caching disabled
    const base = guessPublicUrl(originFromRoute);
    const url = `${base}/embeddings.json`;
    const res = await fetch(url, {
        cache: "no-store",
        next: { revalidate: 0 },
      });
    if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
    const json = (await res.json()) as KB;
    if (!json || !Array.isArray(json.items) || typeof json.dims !== "number") {
      throw new Error("Bad embeddings.json shape");
    }
    memo = json;
    return { dim: memo.dims, items: memo.items };
  }  