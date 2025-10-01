// lib/rag/similarity.ts

export const dot = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export const norm = (a: number[]) => {
  const d = dot(a, a);
  return d > 0 ? Math.sqrt(d) : 1e-9;
};

export const cosine = (a: number[], b: number[]) => {
  return dot(a, b) / (norm(a) * norm(b) + 1e-9);
};