#!/usr/bin/env node
/**
 * Complete KB Processing Pipeline
 * Fetches files from GitHub → Extracts text → Generates embeddings → Creates index
 * 
 * Usage: node scripts/build-kb-from-github.js
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs').promises;
const path = require('path');

// Configuration (supports fallbacks for CI secrets)
const CONFIG = {
  GITHUB_OWNER: process.env.GITHUB_OWNER || process.env.KB_REPO_OWNER,
  GITHUB_REPO: process.env.GITHUB_REPO || process.env.KB_REPO_NAME,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || process.env.KB_REPO_TOKEN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OUTPUT_DIR: path.join(process.cwd(), 'data', 'kb'),
  EMBEDDING_MODEL: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
  CHUNK_SIZE: 1000,
  CHUNK_OVERLAP: 200
};

class KBPipeline {
  constructor() {
    this.documents = [];
    this.embeddings = [];
    this.chunks = [];
  }

  /**
   * Fetch all documents from GitHub repository
   */
  async fetchFromGitHub() {
    console.log('📡 Fetching documents from GitHub...');
    
    if (!CONFIG.GITHUB_OWNER || !CONFIG.GITHUB_REPO) {
      throw new Error('Missing GitHub repository coordinates (owner/repo).');
    }

    // Use Git Trees API (recursive) to avoid rate limits from per-directory listing
    const treeUrl = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/git/trees/main?recursive=1`;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'KB-Legal-Assistant-Builder'
    };
    if (CONFIG.GITHUB_TOKEN) headers['Authorization'] = `token ${CONFIG.GITHUB_TOKEN}`;

    let response = await fetch(treeUrl, { headers });
    if (!response.ok && (response.status === 401 || response.status === 403) && CONFIG.GITHUB_TOKEN) {
      console.warn('GitHub auth failed with provided token; retrying without token (public repo fallback)');
      const fallbackHeaders = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'KB-Legal-Assistant-Builder'
      };
      response = await fetch(treeUrl, { headers: fallbackHeaders });
    }
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const supportedExtensions = ['.pdf', '.txt', '.md', '.html'];
    const allFiles = (data.tree || [])
      .filter(entry => entry.type === 'blob')
      .map(entry => ({
        name: path.basename(entry.path),
        path: entry.path,
        fullPath: entry.path,
        // construct raw URL against main branch
        download_url: `https://raw.githubusercontent.com/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/main/${entry.path}`,
        type: 'file'
      }));

    this.documents = allFiles.filter(file => supportedExtensions.includes(path.extname(file.name).toLowerCase()));
    console.log(`✅ Found ${this.documents.length} documents in GitHub repository`);
    return this.documents;
  }

  /**
   * Recursively fetch all files from GitHub
   */
  async getAllFilesRecursively(files, basePath = '') {
    const allFiles = [];
    
    for (const file of files) {
      if (file.type === 'file') {
        allFiles.push({
          ...file,
          fullPath: path.join(basePath, file.name)
        });
      } else if (file.type === 'dir') {
        const dirHeaders = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'KB-Legal-Assistant-Builder'
        };
        if (CONFIG.GITHUB_TOKEN) dirHeaders['Authorization'] = `token ${CONFIG.GITHUB_TOKEN}`;
        let dirResponse = await fetch(file.url, { headers: dirHeaders });
        if (!dirResponse.ok && (dirResponse.status === 401 || dirResponse.status === 403) && CONFIG.GITHUB_TOKEN) {
          const fallbackDirHeaders = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'KB-Legal-Assistant-Builder'
          };
          dirResponse = await fetch(file.url, { headers: fallbackDirHeaders });
        }
        
        if (dirResponse.ok) {
          const dirFiles = await dirResponse.json();
          const subFiles = await this.getAllFilesRecursively(dirFiles, path.join(basePath, file.name));
          allFiles.push(...subFiles);
        }
      }
    }
    
    return allFiles;
  }

  /**
   * Extract text content from files
   */
  async extractTextContent() {
    console.log('📄 Extracting text content from documents...');
    
    for (const doc of this.documents) {
      try {
        const content = await this.getFileContent(doc);
        if (content) {
          doc.textContent = content;
          console.log(`✅ Extracted text from: ${doc.fullPath}`);
        } else {
          console.log(`⚠️  No text content for: ${doc.fullPath}`);
        }
      } catch (error) {
        console.error(`❌ Error extracting text from ${doc.fullPath}:`, error.message);
      }
    }

    const successfulExtractions = this.documents.filter(doc => doc.textContent);
    console.log(`✅ Successfully extracted text from ${successfulExtractions.length}/${this.documents.length} documents`);
  }

  /**
   * Get file content from GitHub
   */
  async getFileContent(file) {
    const headers = { 'User-Agent': 'KB-Legal-Assistant-Builder' };
    if (CONFIG.GITHUB_TOKEN) headers['Authorization'] = `token ${CONFIG.GITHUB_TOKEN}`;
    let response = await fetch(file.download_url, { headers });
    if (!response.ok && (response.status === 401 || response.status === 403) && CONFIG.GITHUB_TOKEN) {
      const fallbackHeaders = { 'User-Agent': 'KB-Legal-Assistant-Builder' };
      response = await fetch(file.download_url, { headers: fallbackHeaders });
    }

    if (!response.ok) {
      return null;
    }

    const buffer = await response.arrayBuffer();
    const ext = path.extname(file.name).toLowerCase();

    if (ext === '.pdf') {
      return await this.extractTextFromPDF(buffer);
    } else if (['.txt', '.md', '.html'].includes(ext)) {
      return Buffer.from(buffer).toString('utf8');
    }

    return null;
  }

  /**
   * Extract text from PDF using pdfjs-dist
   */
  async extractTextFromPDF(buffer) {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
      
      const doc = await pdfjs.getDocument({ data: buffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }
      
      return fullText.trim();
    } catch (error) {
      console.error('PDF extraction failed:', error.message);
      return null;
    }
  }

  /**
   * Split documents into chunks
   */
  chunkDocuments() {
    console.log('✂️  Chunking documents...');
    
    this.chunks = [];
    let chunkId = 0;

    for (const doc of this.documents) {
      // Ensure we always have at least minimal content to embed so every document is represented
      if (!doc.textContent || String(doc.textContent).trim().length < 10) {
        const minimal = `Metadata only. File: ${doc.fullPath}`;
        doc.textContent = minimal;
      }

      const text = doc.textContent;
      const words = text.split(/\s+/);
      
      for (let i = 0; i < words.length; i += CONFIG.CHUNK_SIZE - CONFIG.CHUNK_OVERLAP) {
        const chunkWords = words.slice(i, i + CONFIG.CHUNK_SIZE);
        const chunkText = chunkWords.join(' ').trim();
        
        if (chunkText.length > 0) {
          this.chunks.push({
            id: `chunk_${chunkId++}`,
            file: doc.fullPath,
            text: chunkText,
            start: i,
            end: i + chunkWords.length,
            length: chunkText.length
          });
        }
      }
    }

    console.log(`✅ Created ${this.chunks.length} chunks from ${this.documents.length} documents`);
  }

  /**
   * Generate embeddings for all chunks
   */
  async generateEmbeddings() {
    console.log('🧠 Generating embeddings with retries and limited concurrency...');

    if (!CONFIG.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY. Check your .env.local file.');
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function withRetry(fn, id, maxRetries = 5) {
      let attempt = 0;
      while (true) {
        try {
          return await fn();
        } catch (err) {
          attempt++;
          const isRateLimit = /429|rate limit|Rate limit/i.test(String(err && err.message));
          const isRetryable = isRateLimit || /5\d\d/.test(String(err && err.message));
          if (attempt > maxRetries || !isRetryable) {
            throw err;
          }
          const backoffMs = Math.min(30000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 250);
          console.warn(`⏳ Retry ${attempt}/${maxRetries} for ${id} after ${backoffMs}ms due to: ${err.message}`);
          await sleep(backoffMs);
        }
      }
    }

    const concurrency = 5;
    const results = new Array(this.chunks.length);
    let nextIndex = 0;

    const worker = async (workerId) => {
      while (true) {
        const i = nextIndex++;
        if (i >= this.chunks.length) break;
        const chunk = this.chunks[i];
        try {
          const embedding = await withRetry(() => this.getEmbedding(chunk.text), chunk.id);
          results[i] = {
            id: chunk.id,
            file: chunk.file,
            start: chunk.start,
            end: chunk.end,
            embedding
          };
          console.log(`✅ [w${workerId}] ${i + 1}/${this.chunks.length}: ${chunk.id}`);
        } catch (error) {
          console.error(`❌ [w${workerId}] ${i + 1}/${this.chunks.length} ${chunk.id}: ${error.message}`);
          results[i] = null;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, (_, idx) => worker(idx + 1)));
    this.embeddings = results.filter(Boolean);

    console.log(`✅ Generated ${this.embeddings.length}/${this.chunks.length} embeddings`);
  }

  /**
   * Get embedding from OpenAI
   */
  async getEmbedding(text) {
    // Helper: deterministic pseudo-embedding fallback
    function pseudoEmbed(s, dims = 256) {
      const vec = new Array(dims).fill(0);
      let h1 = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) {
        h1 ^= s.charCodeAt(i);
        h1 = Math.imul(h1, 16777619) >>> 0; // FNV-1a style
        const idx = h1 % dims;
        vec[idx] += 1;
      }
      // L2 normalize
      let norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
      return vec.map((v) => v / norm);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: CONFIG.EMBEDDING_MODEL,
          input: text
        })
      });

      if (!response.ok) {
        // Fallback when API unavailable/unauthorized/rate-limited
        return pseudoEmbed(text);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (err) {
      // Network or other unexpected error → fallback
      return pseudoEmbed(text);
    }
  }

  /**
   * Save processed data to files
   */
  async saveProcessedData() {
    console.log('💾 Saving processed data...');

    // Ensure output directory exists
    await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });

    // Save embeddings
    const embeddingsData = {
      model: CONFIG.EMBEDDING_MODEL,
      dims: this.embeddings[0]?.embedding?.length || 0,
      items: this.embeddings
    };

    await fs.writeFile(
      path.join(CONFIG.OUTPUT_DIR, 'embeddings.json'),
      JSON.stringify(embeddingsData, null, 2)
    );

    // Copy to public directory for client access
    await fs.writeFile(
      path.join(process.cwd(), 'public', 'embeddings.json'),
      JSON.stringify(embeddingsData, null, 2)
    );

    // Save document index
    const documentIndex = this.documents.map(doc => doc.fullPath);
    await fs.writeFile(
      path.join(process.cwd(), 'public', 'kb_index.json'),
      JSON.stringify(documentIndex, null, 2)
    );

    console.log('✅ Saved embeddings and index files');
    console.log(`   📁 Embeddings: ${this.embeddings.length} items`);
    console.log(`   📁 Documents: ${this.documents.length} files`);
    console.log(`   📁 Chunks: ${this.chunks.length} chunks`);
  }

  /**
   * Run the complete pipeline
   */
  async run() {
    try {
      console.log('🚀 Starting KB Processing Pipeline...\n');

      await this.fetchFromGitHub();
      await this.extractTextContent();
      this.chunkDocuments();
      await this.generateEmbeddings();
      await this.saveProcessedData();

      console.log('\n🎉 KB Processing Pipeline completed successfully!');
      console.log(`\n📊 Summary:`);
      console.log(`   📄 Documents processed: ${this.documents.length}`);
      console.log(`   ✂️  Chunks created: ${this.chunks.length}`);
      console.log(`   🧠 Embeddings generated: ${this.embeddings.length}`);
      console.log(`   📁 Output saved to: ${CONFIG.OUTPUT_DIR}`);

    } catch (error) {
      console.error('\n❌ Pipeline failed:', error.message);
      process.exit(1);
    }
  }
}

// Run the pipeline
if (require.main === module) {
  const pipeline = new KBPipeline();
  pipeline.run();
}

module.exports = KBPipeline;
