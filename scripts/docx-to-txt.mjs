#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import url from 'url';
import mammoth from 'mammoth';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function convertDocxToTxt(inputPath, outputPath) {
  const buf = await fs.promises.readFile(inputPath);
  const { value: text } = await mammoth.extractRawText({ buffer: buf });
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, text, 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/docx-to-txt.mjs <file1.docx> [file2.docx ...]');
    process.exit(1);
  }

  for (const inFile of args) {
    const ext = path.extname(inFile).toLowerCase();
    if (ext !== '.docx') {
      console.error(`Skipping non-docx file: ${inFile}`);
      continue;
    }
    const base = inFile.slice(0, -ext.length);
    const outFile = `${base}.txt`;
    try {
      await convertDocxToTxt(inFile, outFile);
      console.log(`Converted: ${inFile} -> ${outFile}`);
    } catch (e) {
      console.error(`Failed: ${inFile}: ${e.message || e}`);
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


