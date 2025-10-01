// lib/llm/embed.ts
// Minimal server-side helper to get a query embedding from OpenAI.
// Usage (server only): const vec = await embedText("your question");

const OPENAI_URL = "https://api.openai.com/v1/embeddings";
const MODEL = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
// Tip: use text-embedding-3-large for best quality; -small is cheaper.

export async function embedText(input: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input }),
  });

  if (!resp.ok) {
    const msg = await safeText(resp);
    throw new Error(`Embedding failed: ${resp.status} ${resp.statusText} — ${msg}`);
  }

  const json = (await resp.json()) as any;
  const vec = json?.data?.[0]?.embedding as number[] | undefined;
  if (!Array.isArray(vec)) {
    throw new Error("Invalid embedding response shape");
  }
  return vec;
}

async function safeText(r: Response) {
  try { return await r.text(); } catch { return "<no body>"; }
}