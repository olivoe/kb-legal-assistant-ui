// app/lib/similarity.ts
import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadKB, type EmbeddingItem, type EmbeddingsPayload } from './kb';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required');
}

type Vec = number[];

function cosine(a: Vec, b: Vec): number {
  let dot = 0, na = 0, nb = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

export type RetrievedChunk = {
  id: string;
  file: string;
  start: number;
  end: number;
  score: number;
  text?: string;
};

/** Embed a single query string using the same model as embeddings.json */
export async function embedQuery(model: string, text: string): Promise<Vec> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`embedQuery failed: ${res.status} ${t}`);
  }
  const json = await res.json();
  return json.data[0].embedding as Vec;
}

/**
 * Try to load the full extracted text of a KB file:
 * 1) Prefer sidecar .txt if present.
 * 2) Otherwise (fallback) extract from PDF in-process.
 */
async function loadFullText(fileRel: string): Promise<string | null> {
  const root = process.cwd();
  const abs = path.join(root, 'kb', fileRel); // the UI is mounted with ./kb at repo root

  const ext = path.extname(abs).toLowerCase();
  const sidecar = ext === '.pdf' ? abs.replace(/\.pdf$/i, '.txt') : null;

  // 1) sidecar .txt
  if (sidecar) {
    try {
      const stat = await fs.stat(sidecar);
      if (stat.size > 0) {
        return await fs.readFile(sidecar, 'utf8');
      }
    } catch {}
  }

  // 2) fallback PDF extraction (only when needed)
  if (ext === '.pdf') {
    try {
      const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
      // keeps warnings quiet; we’ll tidy configuration in Step 2 later
      (pdfjs as any).GlobalWorkerOptions.standardFontDataUrl = 'pdfjs-dist/legacy/build/';

      const data = new Uint8Array(await fs.readFile(abs));
      const doc = await pdfjs.getDocument({ data }).promise;
      let out = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        out += content.items.map((it: any) => it.str).join(' ') + '\n';
      }
      return out || null;
    } catch {
      return null;
    }
  }

  // plain text-ish files
  if (['.txt', '.md', '.html'].includes(ext)) {
    try { return await fs.readFile(abs, 'utf8'); } catch { return null; }
  }

  return null;
}

/**
 * Retrieve top-k most similar chunks for a query. If `withText` is true,
 * also attach the chunk text by slicing [start,end] from the file’s full text.
 */
export async function similaritySearch(query: string, k = 8, withText = true): Promise<RetrievedChunk[]> {
  const kb: EmbeddingsPayload = await loadKB();
  const q = await embedQuery(kb.model, query);

  // score all (simple linear scan; fast enough for a few 10Ks of chunks)
  const scored: RetrievedChunk[] = kb.items.map((it: EmbeddingItem) => ({
    id: it.id,
    file: it.file,
    start: it.start,
    end: it.end,
    score: cosine(q, it.embedding),
  }));

  // pick top-k
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, k);

  if (!withText) return top;

  // group by file to avoid re-reading repeatedly
  const byFile = new Map<string, RetrievedChunk[]>();
  for (const r of top) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file)!.push(r);
  }

  for (const [file, rows] of byFile) {
    const full = await loadFullText(file);
    if (!full) continue;
    for (const r of rows) {
      // guard ranges
      const s = Math.max(0, Math.min(r.start, full.length));
      const e = Math.max(s, Math.min(r.end, full.length));
      r.text = full.slice(s, e).trim();
    }
  }

  return top;
}