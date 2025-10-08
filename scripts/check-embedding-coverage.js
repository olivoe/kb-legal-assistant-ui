#!/usr/bin/env node
/**
 * Check embedding coverage: ensures every document in kb_index.json
 * has at least one corresponding embedding entry (by file),
 * or, for PDFs, a sidecar .txt is also acceptable.
 *
 * Strategy:
 * - For each path in kb_index.json:
 *   - If it ends with .pdf, require sidecar .txt to be embedded
 *   - If it ends with .txt/.md/.html, require that exact path to be embedded
 * - Read public/embeddings.json -> items[].file
 * - Report any missing sources and exit non-zero if any missing
 */

const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalize(p) {
  // Ensure consistent separators and Unicode normalization
  return p.replace(/\\/g, '/').normalize('NFC');
}

function pdfToTxt(p) {
  return p.replace(/\.pdf$/i, '.txt');
}

function main() {
  const kbIndexPath = path.join(process.cwd(), 'public', 'kb_index.json');
  const embeddingsPath = path.join(process.cwd(), 'public', 'embeddings.json');

  if (!fs.existsSync(kbIndexPath)) {
    console.error(`kb_index.json not found at ${kbIndexPath}`);
    process.exit(2);
  }
  if (!fs.existsSync(embeddingsPath)) {
    console.error(`embeddings.json not found at ${embeddingsPath}`);
    process.exit(2);
  }

  const index = readJson(kbIndexPath);
  const embeddings = readJson(embeddingsPath);

  const embeddedFiles = new Set(
    (embeddings.items || []).map((it) => normalize(String(it.file || '')))
  );

  const requiredCandidates = index.map((docPath) => {
    const p = normalize(String(docPath));
    if (/\.pdf$/i.test(p)) return [pdfToTxt(p), p];
    return [p];
  });

  const missing = [];
  for (const candidates of requiredCandidates) {
    const covered = candidates.some((c) => embeddedFiles.has(normalize(c)));
    if (!covered) {
      // prefer reporting the first candidate
      missing.push(candidates[0]);
    }
  }

  const uniqueMissing = Array.from(new Set(missing));
  if (uniqueMissing.length > 0) {
    console.error(`❌ Missing embeddings for ${uniqueMissing.length} document(s):`);
    for (const m of uniqueMissing) console.error(`  - ${m}`);
    process.exit(1);
  }

  console.log(`✅ Embedding coverage OK for ${index.length} documents`);
}

main();


