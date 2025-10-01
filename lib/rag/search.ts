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
  opts?: { k?: number; minScore?: number }
): Promise<Hit[]> {
  const { items } = await loadKB(); // NOTE: loadKB now returns { dim, items }
  const k = opts?.k ?? 6;
  const minScore = opts?.minScore ?? 0.25;

  const scored: Hit[] = items
    .map((it) => ({
      id: `${it.file}#${it.start}-${it.end}`,
      score: cosine(qVec, it.embedding),
      meta: { file: it.file, start: it.start, end: it.end },
    }))
    .filter((h) => h.score >= minScore)
  .sort((a, b) => b.score - a.score)
  .slice(0, k);

  return scored;
}