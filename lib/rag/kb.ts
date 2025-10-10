// lib/rag/kb.ts
type KBItem = {
    id: string; file: string; start: number; end: number; embedding: number[];
  };
  type KB = { model: string; dims: number; items: KBItem[] };
  
  let memo: KB | null = null;
  
  function guessPublicUrl(origin?: string): string {
    if (origin) return origin; // prefer the request origin when provided
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  }
  
  export async function loadKB(originFromRoute?: string): Promise<{ dim: number; items: KBItem[] }> {
    if (memo) return { dim: memo.dims, items: memo.items };
  
    const base = guessPublicUrl(originFromRoute);
    // Use production KB with 1536 dimensions and full 4,178 items
    const url = `${base}/kb-text/embeddings.json`;
  
    // Always no-store on server to avoid 401s and stale caches
    try {
      const res = await fetch(url, {
        cache: "no-store",
        // @ts-ignore Next.js hint
        next: { revalidate: 0 },
      });
      if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
      const json = (await res.json()) as KB;
      if (!json || !Array.isArray(json.items) || typeof json.dims !== "number") {
        throw new Error("Bad embeddings.json shape");
      }
      memo = json;
      return { dim: memo.dims, items: memo.items };
    } catch (e) {
      if (typeof window !== "undefined") throw e;
      // Dev FS fallback
      try {
        const { readFile } = await import("fs/promises");
        const { join } = await import("path");
        const p = join(process.cwd(), "public", "kb-text", "embeddings.json");
        const raw = await readFile(p, "utf8");
        const json = JSON.parse(raw) as KB;
        memo = json;
        return { dim: memo.dims, items: memo.items };
      } catch (fsErr: any) {
        throw new Error(
          `Failed to load kb-text/embeddings.json via HTTP (${(e as any)?.message}) and FS (${fsErr?.message}).`
        );
      }
    }
  }  