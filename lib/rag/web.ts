// lib/rag/web.ts
export type WebHit = { snippet: string; url: string };

export async function webFallback(query: string, count = 3): Promise<WebHit[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: count,
      include_answer: false,
      include_images: false,
    }),
  });

  if (!resp.ok) return [];
  const data = await resp.json();
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  return results
    .slice(0, count)
    .map((r) => ({ snippet: r.content || r.title || "", url: r.url }))
    .filter((r) => !!r.url);
}