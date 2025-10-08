#!/usr/bin/env node
/**
 * Generate .txt sidecar files for all PDFs in kb-legal-documents
 * This script:
 * 1. Fetches all PDFs from GitHub
 * 2. Checks if .txt sidecar exists
 * 3. Extracts text using multi-method approach
 * 4. Creates PR with new .txt files
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs').promises;
const path = require('path');
const { PDFExtractor } = require('./pdf-extractor');

const CONFIG = {
  GITHUB_OWNER: process.env.GITHUB_OWNER || process.env.KB_REPO_OWNER || 'olivoe',
  GITHUB_REPO: process.env.GITHUB_REPO || process.env.KB_REPO_NAME || 'kb-legal-documents',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || process.env.KB_REPO_TOKEN,
  OUTPUT_DIR: path.join(process.cwd(), 'tmp', 'kb-sidecars')
};

class SidecarGenerator {
  constructor() {
    this.extractor = new PDFExtractor({ preferSidecars: false, verbose: true });
    this.pdfsProcessed = 0;
    this.sidecarsCreated = 0;
    this.sidecarsExisting = 0;
    this.failed = [];
  }

  /**
   * Fetch all files from GitHub
   */
  async fetchAllFiles() {
    console.log('📡 Fetching files from GitHub...');
    
    const treeUrl = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/git/trees/main?recursive=1`;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'KB-Sidecar-Generator'
    };
    if (CONFIG.GITHUB_TOKEN) headers['Authorization'] = `token ${CONFIG.GITHUB_TOKEN}`;

    const response = await fetch(treeUrl, { headers });
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const files = (data.tree || [])
      .filter(entry => entry.type === 'blob')
      .map(entry => ({
        path: entry.path,
        url: `https://raw.githubusercontent.com/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/main/${entry.path}`
      }));

    const pdfs = files.filter(f => f.path.endsWith('.pdf'));
    const txts = new Set(files.filter(f => f.path.endsWith('.txt')).map(f => f.path));

    console.log(`✅ Found ${pdfs.length} PDFs and ${txts.size} .txt files`);
    
    return { pdfs, txts };
  }

  /**
   * Download file from GitHub
   */
  async downloadFile(url) {
    const headers = { 'User-Agent': 'KB-Sidecar-Generator' };
    if (CONFIG.GITHUB_TOKEN) headers['Authorization'] = `token ${CONFIG.GITHUB_TOKEN}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Process a single PDF
   */
  async processPDF(pdfPath, pdfUrl, existingTxts) {
    const txtPath = pdfPath.replace(/\.pdf$/i, '.txt');
    
    // Check if sidecar already exists
    if (existingTxts.has(txtPath)) {
      console.log(`⏭️  Skipping ${pdfPath} (sidecar exists)`);
      this.sidecarsExisting++;
      return null;
    }

    console.log(`🔄 Processing ${pdfPath}...`);
    this.pdfsProcessed++;

    try {
      // Download PDF
      const pdfBuffer = await this.downloadFile(pdfUrl);
      
      // Extract text
      const result = await this.extractor.extract(pdfBuffer);
      
      if (!result.text || result.text.trim().length < 50) {
        console.log(`⚠️  Extracted text too short for ${pdfPath}`);
        this.failed.push({ path: pdfPath, reason: 'Text too short' });
        return null;
      }

      console.log(`✅ Extracted ${result.text.length} chars from ${pdfPath} using ${result.method}`);
      
      // Save to local output directory
      const outputPath = path.join(CONFIG.OUTPUT_DIR, txtPath);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, result.text, 'utf8');
      
      this.sidecarsCreated++;
      
      return {
        pdfPath,
        txtPath,
        outputPath,
        method: result.method,
        length: result.text.length
      };
    } catch (error) {
      console.error(`❌ Failed to process ${pdfPath}:`, error.message);
      this.failed.push({ path: pdfPath, reason: error.message });
      return null;
    }
  }

  /**
   * Generate all missing sidecars
   */
  async generateAll(limit = null) {
    console.log('🚀 Starting sidecar generation...');
    console.log('');

    // Fetch files
    const { pdfs, txts } = await this.fetchAllFiles();
    
    // Filter PDFs that need sidecars
    const pdfsNeedingSidecars = pdfs.filter(pdf => {
      const txtPath = pdf.path.replace(/\.pdf$/i, '.txt');
      return !txts.has(txtPath);
    });

    console.log(`📊 ${pdfsNeedingSidecars.length} PDFs need sidecars`);
    console.log('');

    if (pdfsNeedingSidecars.length === 0) {
      console.log('✅ All PDFs already have sidecars!');
      return;
    }

    // Create output directory
    await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });

    // Process PDFs (with optional limit for testing)
    const toProcess = limit ? pdfsNeedingSidecars.slice(0, limit) : pdfsNeedingSidecars;
    const results = [];

    for (const pdf of toProcess) {
      const result = await this.processPDF(pdf.path, pdf.url, txts);
      if (result) {
        results.push(result);
      }
    }

    // Print summary
    console.log('');
    console.log('📊 Summary:');
    console.log(`   PDFs processed: ${this.pdfsProcessed}`);
    console.log(`   Sidecars created: ${this.sidecarsCreated}`);
    console.log(`   Sidecars existing: ${this.sidecarsExisting}`);
    console.log(`   Failed: ${this.failed.length}`);
    
    if (this.failed.length > 0) {
      console.log('');
      console.log('❌ Failed PDFs:');
      this.failed.forEach(f => console.log(`   - ${f.path}: ${f.reason}`));
    }

    console.log('');
    console.log(`📁 Output directory: ${CONFIG.OUTPUT_DIR}`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Review the generated .txt files');
    console.log('2. Copy them to your local kb-legal-documents repo:');
    console.log(`   rsync -av ${CONFIG.OUTPUT_DIR}/ /path/to/kb-legal-documents/`);
    console.log('3. Commit and push:');
    console.log('   cd /path/to/kb-legal-documents');
    console.log('   git add *.txt');
    console.log('   git commit -m "Add .txt sidecars for PDFs"');
    console.log('   git push origin main');
    
    return results;
  }

  /**
   * Check available extraction methods
   */
  static async checkMethods() {
    console.log('🔍 Checking available extraction methods...');
    const methods = await PDFExtractor.checkAvailableMethods();
    console.log('');
    console.log('Available methods:');
    console.log(`  - pdfjs (JS): ${methods.pdfjs ? '✅' : '❌'}`);
    console.log(`  - pdftotext (poppler): ${methods.pdftotext ? '✅' : '❌'}`);
    console.log(`  - OCR (gs + tesseract): ${methods.ocr ? '✅' : '❌'}`);
    console.log('');
    
    if (!methods.pdftotext) {
      console.log('💡 Install pdftotext: arch -arm64 brew install poppler');
    }
    if (!methods.ocr) {
      console.log('💡 Install OCR tools: arch -arm64 brew install ghostscript tesseract');
    }
    
    return methods;
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--check')) {
    SidecarGenerator.checkMethods().then(() => process.exit(0));
  } else {
    const limit = args.includes('--limit') 
      ? parseInt(args[args.indexOf('--limit') + 1]) 
      : null;

    console.log('🎯 KB PDF Sidecar Generator');
    console.log('============================');
    console.log('');

    if (limit) {
      console.log(`⚠️  Running in test mode (limit: ${limit} PDFs)`);
      console.log('');
    }

    const generator = new SidecarGenerator();
    generator.generateAll(limit)
      .then(() => {
        console.log('');
        console.log('✅ Done!');
        process.exit(0);
      })
      .catch(error => {
        console.error('');
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
      });
  }
}

module.exports = { SidecarGenerator };
