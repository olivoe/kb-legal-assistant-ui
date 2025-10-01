// lib/rag/snippet.ts
type Meta = { file?: string; start?: number; end?: number; relPath?: string; abs?: string };

export async function loadSnippetFromMeta(meta: Meta, originFromRoute?: string): Promise<{
  snippet: string;
  relPath?: string | null;
}> {
  const relPath = meta?.relPath ?? null;

  // Prefer HTTP fetch from /kb-text/... in prod
  if (relPath) {
    const base =
      originFromRoute ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
    try {
      const res = await fetch(`${base}/${relPath}`, { cache: "force-cache" });
      if (res.ok) {
        const full = await res.text();
        const start = typeof meta.start === "number" ? meta.start : 0;
        const end = typeof meta.end === "number" ? meta.end : Math.min(full.length, start + 1200);
        return { snippet: full.slice(start, end), relPath };
      }
    } catch {
      // fall through to FS
    }
  }

  // Fallback: FS (only in Node, for dev)
  if (typeof window === "undefined" && meta?.abs) {
    const fs = await import("fs/promises");
    try {
      const full = await fs.readFile(meta.abs, "utf8");
      const start = typeof meta.start === "number" ? meta.start : 0;
      const end = typeof meta.end === "number" ? meta.end : Math.min(full.length, start + 1200);
      return { snippet: full.slice(start, end), relPath };
    } catch {
      // ignore
    }
  }

  return { snippet: "", relPath };
}