// lib/web/search.ts
const TAVILY_URL = "https://api.tavily.com/search";

export type WebResult = {
  url: string;
  title?: string;
  content?: string; // snippet
};

export async function webSearch(query: string, limit = 5): Promise<WebResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  const resp = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: Math.max(1, Math.min(limit, 10)),
      include_images: false,
      include_answer: false,
      search_depth: "basic",
    }),
  });

  if (!resp.ok) return [];
  const json = await resp.json().catch(() => ({} as any));
  const results = Array.isArray(json?.results) ? json.results : [];

  return results
    .map((r: any) => ({
      url: String(r?.url ?? ""),
      title: r?.title ? String(r.title) : undefined,
      content: r?.content ? String(r.content) : undefined,
    }))
    .filter((r: WebResult) => r.url);
}