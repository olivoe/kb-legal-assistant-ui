// lib/rag/snippet.ts
type Meta = {
    file?: string | null;
    start?: number | null;
    end?: number | null;
  };
  
  /** Build the public path under /kb-text that mirrors the KB file (PDF → .txt). */
  function toRelPath(meta: Meta): string | null {
    const f = meta.file?.trim();
    if (!f) return null;
    // Mirror the directory layout under /public/kb-text/kb-legal-documents
    // e.g. "articulos/25-08-19 Ley de Nietos ES.pdf" → "kb-text/kb-legal-documents/articulos/25-08-19 Ley de Nietos ES.txt"
    const txtName = f.replace(/\.pdf$/i, ".txt");
    return `kb-text/kb-legal-documents/${txtName}`;
  }
  
  /** Guess a base URL we can fetch from (works in Vercel or local). */
  function guessBase(originFromRoute?: string): string {
    if (originFromRoute) return originFromRoute;
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  }
  
  /**
   * Try to load a readable snippet for a hit by fetching the sidecar text file
   * and slicing its content using the [start,end) offsets.
   *
   * Returns: { snippet, relPath }
   */
  export async function loadSnippetFromMeta(
    meta: Meta,
    originFromRoute?: string
  ): Promise<{ snippet: string; relPath?: string | null }> {
    const relPath = toRelPath(meta);
    if (!relPath) {
      return { snippet: "", relPath: null };
    }
  
    const base = guessBase(originFromRoute);
    const url = `${base}/${encodeURI(relPath)}`;
  
    try {
      // AFTER
const res = await fetch(url, {
    // Don’t cache at the function layer; the CDN will handle static caching.
    cache: "no-store",
    next: { revalidate: 0 },
  });
      if (!res.ok) {
        // Sidecar might not exist for some sources; don’t fail hard.
        return { snippet: "", relPath };
      }
  
      const fullText = await res.text();
  
      // Guard and slice - extend beyond chunk boundary to capture complete sentences, lists, and law references
      const start = Math.max(0, meta.start ?? 0);
      const end = Math.max(start, meta.end ?? start + 500);
      // Extend by 1500 chars to capture complete lists and structured content (legal docs often have long numbered lists)
      const extendedEnd = end + 1500;
      // Clamp end to file length to avoid exceptions
      const safeEnd = Math.min(fullText.length, extendedEnd);
      const raw = fullText.slice(start, safeEnd);

      // Compact whitespace and trim to ~3000 chars for better context (legal documents with lists need more context)
      const cleaned = raw.replace(/\s+/g, " ").trim().slice(0, 3000);
  
      return { snippet: cleaned, relPath };
    } catch {
      return { snippet: "", relPath };
    }
  }  