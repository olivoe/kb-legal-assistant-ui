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
   * IMPORTANT: meta.start and meta.end are WORD INDICES, not character positions!
   * We need to convert word indices to character positions before slicing.
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
    // Don't cache at the function layer; the CDN will handle static caching.
    cache: "no-store",
    next: { revalidate: 0 },
  });
      if (!res.ok) {
        // Sidecar might not exist for some sources; don't fail hard.
        return { snippet: "", relPath };
      }
  
      const fullText = await res.text();
  
      // Convert word indices to text snippet
      // meta.start and meta.end are WORD indices from the KB build script, not character positions
      const words = fullText.split(/\s+/);
      const startWordIdx = Math.max(0, meta.start ?? 0);
      const endWordIdx = Math.max(startWordIdx, meta.end ?? startWordIdx + 100);
      
      // Extend by 200 words to capture complete sentences, lists, and law references
      const extendedEndWordIdx = Math.min(words.length, endWordIdx + 200);
      
      // Extract words and join them back
      const selectedWords = words.slice(startWordIdx, extendedEndWordIdx);
      const raw = selectedWords.join(' ');

      // Compact whitespace and trim to ~3000 chars for better context (legal documents with lists need more context)
      const cleaned = raw.replace(/\s+/g, " ").trim().slice(0, 3000);
  
      return { snippet: cleaned, relPath };
    } catch {
      return { snippet: "", relPath };
    }
  }  