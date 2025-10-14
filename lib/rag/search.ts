// lib/rag/search.ts
import { loadKB } from "./kb";

export type Hit = {
  id: string;
  score: number;
  meta: {
    file: string;
    start: number;
    end: number;
  };
};

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function norm(a: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}
function cosine(a: number[], b: number[]) {
  const d = dot(a, b);
  const na = norm(a);
  const nb = norm(b);
  return na && nb ? d / (na * nb) : 0;
}

/** Vector search over KB items using cosine similarity */
export async function searchKB(
  qVec: number[],
  opts?: { k?: number; minScore?: number; boostIfFileIncludes?: Array<{ substr: string; weight: number }> }
): Promise<Hit[]> {
  const { items } = await loadKB(); // NOTE: loadKB now returns { dim, items }
  const k = opts?.k ?? 12; // Increased for better diversity on broad queries
  const minScore = opts?.minScore ?? 0.28; // Balanced threshold for quality vs coverage

  const scored: Hit[] = items
    .map((it) => {
      let score = cosine(qVec, it.embedding);
      // Optional boosting for specific files (e.g., firm FAQ on price intent)
      const boosts = opts?.boostIfFileIncludes || [];
      if (boosts.length && typeof it.file === "string") {
        for (const b of boosts) {
          if (b?.substr && it.file.toLowerCase().includes(b.substr.toLowerCase())) {
            score += b.weight ?? 0;
          }
        }
      }
      // Cap score to [0, 0.999] to preserve ordering bounds
      if (score > 0.999) score = 0.999;
      return {
        id: `${it.file}#${it.start}-${it.end}`,
        score,
        meta: { file: it.file, start: it.start, end: it.end },
      } as Hit;
    })
    .filter((h) => h.score >= minScore)
  .sort((a, b) => b.score - a.score)
  .slice(0, k);

  return scored;
}