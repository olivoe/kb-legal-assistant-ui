// lib/web/fallback.ts
// Minimal Tavily integration for web fallback RAG.
// Expects env TAVILY_API_KEY.

export type WebSource = {
  url: string;
  title?: string;
  content: string;   // extracted/summarized text
};

const TAVILY_URL = "https://api.tavily.com/search";

export async function webFallbackSearch(
  question: string,
  opts?: { maxResults?: number; searchDepth?: "basic" | "advanced" }
): Promise<WebSource[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    // Be quiet in prod: return empty so upstream can decide to answer without web.
    return [];
  }

  const body = {
    api_key: key,
    query: question,
    // return parsed results with content (no need for raw links)
    include_answer: false,
    include_images: false,
    include_domains: [],
    max_results: Math.min(Math.max(opts?.maxResults ?? 4, 1), 8),
    search_depth: opts?.searchDepth ?? "basic",
    // Ask Tavily to extract/summarize page content
    include_raw_content: false,
  };

  const resp = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    // Non-fatal: just return empty, upstream will handle.
    return [];
  }

  const json = await resp.json().catch(() => null);
  const results: any[] = json?.results ?? [];

  // Normalize to WebSource
  const out: WebSource[] = results
    .map((r) => ({
      url: r.url as string,
      title: r.title as string | undefined,
      content:
        (r.content as string | undefined)?.slice(0, 1200) ||
        (r.snippet as string | undefined)?.slice(0, 1200) ||
        "",
    }))
    .filter((r) => r.url && r.content);

  return out;
}