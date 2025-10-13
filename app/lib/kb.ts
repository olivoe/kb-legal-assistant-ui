// app/lib/kb.ts
import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';

export type EmbeddingItem = {
  id: string;
  file: string;
  start: number;
  end: number;
  embedding: number[];
};

export type EmbeddingsPayload = {
  model: string;
  dims: number;
  items: EmbeddingItem[];
};

// Simple in-memory cache so we don't re-read the JSON on every request
let cache: EmbeddingsPayload | null = null;

export async function loadKB(): Promise<EmbeddingsPayload> {
  if (cache) return cache;

  const root = process.cwd();
  const embPath = path.join(root, 'public', 'kb-text', 'embeddings.json');

  const raw = await fs.readFile(embPath, 'utf8');
  const parsed = JSON.parse(raw) as EmbeddingsPayload;

  // very light sanity checks
  if (!parsed?.items?.length || !Array.isArray(parsed.items[0].embedding)) {
    throw new Error('Invalid embeddings.json format');
  }
  cache = parsed;
  return cache;
}

/** Optional: helper to get all unique files included in the KB */
export async function kbFiles(): Promise<string[]> {
  const { items } = await loadKB();
  return Array.from(new Set(items.map(i => i.file))).sort();
}