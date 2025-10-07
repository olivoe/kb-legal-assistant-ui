// app/lib/similarity-github.ts
// GitHub-based similarity search for Knowledge Base

import { loadKB, EmbeddingsPayload, EmbeddingItem } from './kb';
import { embedText } from '@/lib/llm/embed';
import { loadFullTextFromGitHub } from '../../lib/github/loader';

export type Vec = number[];

function cosine(a: Vec, b: Vec): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type RetrievedChunk = {
  id: string;
  file: string;
  start: number;
  end: number;
  score: number;
  text?: string;
};

/**
 * Retrieve top-k most similar chunks for a query using GitHub as file source.
 * If `withText` is true, also attach the chunk text by slicing [start,end] from the file's full text.
 */
export async function similaritySearchFromGitHub(query: string, k = 8, withText = true): Promise<RetrievedChunk[]> {
  const kb: EmbeddingsPayload = await loadKB();
  const q = await embedText(query);

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
    const full = await loadFullTextFromGitHub(file);
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

/**
 * Legacy function that falls back to GitHub if local files aren't available
 */
export async function loadFullText(fileRel: string): Promise<string | null> {
  // Try GitHub first if configured
  try {
    const githubContent = await loadFullTextFromGitHub(fileRel);
    if (githubContent) {
      return githubContent;
    }
  } catch (error) {
    console.log(`GitHub loading failed for ${fileRel}, falling back to local filesystem`);
  }

  // Fallback to local filesystem
  const fs = await import('fs/promises');
  const path = await import('path');
  
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
      // keeps warnings quiet; we'll tidy configuration in Step 2 later
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
 * Hybrid similarity search that tries GitHub first, falls back to local
 */
export async function similaritySearch(query: string, k = 8, withText = true): Promise<RetrievedChunk[]> {
  try {
    // Try GitHub-based search first
    return await similaritySearchFromGitHub(query, k, withText);
  } catch (error) {
    console.log('GitHub similarity search failed, falling back to local filesystem');
    
    // Fallback to original similarity search
    const kb: EmbeddingsPayload = await loadKB();
    const q = await embedText(query);

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
}
