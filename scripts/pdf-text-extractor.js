#!/usr/bin/env node
/**
 * Enhanced PDF Text Extraction with Multiple Fallback Methods
 * Tries multiple tools to extract text from problematic PDFs
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class PDFTextExtractor {
  constructor() {
    this.methods = [
      'pdfjs-dist',     // Method 1: pdfjs-dist (current)
      'pdftotext',      // Method 2: poppler-utils
      'ghostscript',    // Method 3: ghostscript + pdftotext
      'tesseract',      // Method 4: OCR fallback
      'manual'          // Method 5: Manual extraction flag
    ];
  }

  /**
   * Try multiple methods to extract text from PDF
   */
  async extractText(pdfBuffer, filename) {
    console.log(`🔍 Processing PDF: ${filename}`);
    
    for (const method of this.methods) {
      try {
        console.log(`  📋 Trying method: ${method}`);
        const text = await this.extractWithMethod(method, pdfBuffer, filename);
        
        if (text && text.trim().length > 50) { // Minimum text length check
          console.log(`  ✅ Success with ${method}: ${text.length} characters`);
          return text;
        } else {
          console.log(`  ⚠️  ${method} returned insufficient text`);
        }
      } catch (error) {
        console.log(`  ❌ ${method} failed: ${error.message}`);
      }
    }
    
    console.log(`  🚨 All methods failed for ${filename}`);
    return null;
  }

  /**
   * Extract text using specific method
   */
  async extractWithMethod(method, pdfBuffer, filename) {
    switch (method) {
      case 'pdfjs-dist':
        return await this.extractWithPDFJS(pdfBuffer);
      
      case 'pdftotext':
        return await this.extractWithPDFToText(pdfBuffer, filename);
      
      case 'ghostscript':
        return await this.extractWithGhostscript(pdfBuffer, filename);
      
      case 'tesseract':
        return await this.extractWithOCR(pdfBuffer, filename);
      
      case 'manual':
        return await this.flagForManualProcessing(filename);
      
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  /**
   * Method 1: PDF.js (current method)
   */
  async extractWithPDFJS(pdfBuffer) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
    
    const doc = await pdfjs.getDocument({ data: pdfBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText.trim();
  }

  /**
   * Method 2: pdftotext (poppler-utils)
   */
  async extractWithPDFToText(pdfBuffer, filename) {
    // Save buffer to temporary file
    const tempPdf = `/tmp/temp_${Date.now()}.pdf`;
    const tempTxt = `/tmp/temp_${Date.now()}.txt`;
    
    try {
      await fs.writeFile(tempPdf, pdfBuffer);
      
      // Try pdftotext command
      await execAsync(`pdftotext "${tempPdf}" "${tempTxt}"`);
      
      const text = await fs.readFile(tempTxt, 'utf8');
      return text.trim();
    } finally {
      // Cleanup temp files
      try {
        await fs.unlink(tempPdf);
        await fs.unlink(tempTxt);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Method 3: Ghostscript + pdftotext
   */
  async extractWithGhostscript(pdfBuffer, filename) {
    const tempPdf = `/tmp/temp_${Date.now()}.pdf`;
    const tempFixedPdf = `/tmp/temp_fixed_${Date.now()}.pdf`;
    const tempTxt = `/tmp/temp_${Date.now()}.txt`;
    
    try {
      await fs.writeFile(tempPdf, pdfBuffer);
      
      // Try to fix PDF with ghostscript
      await execAsync(`gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${tempFixedPdf}" "${tempPdf}"`);
      
      // Extract text from fixed PDF
      await execAsync(`pdftotext "${tempFixedPdf}" "${tempTxt}"`);
      
      const text = await fs.readFile(tempTxt, 'utf8');
      return text.trim();
    } finally {
      // Cleanup temp files
      try {
        await fs.unlink(tempPdf);
        await fs.unlink(tempFixedPdf);
        await fs.unlink(tempTxt);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Method 4: OCR with Tesseract
   */
  async extractWithOCR(pdfBuffer, filename) {
    const tempPdf = `/tmp/temp_${Date.now()}.pdf`;
    const tempTxt = `/tmp/temp_${Date.now()}.txt`;
    
    try {
      await fs.writeFile(tempPdf, pdfBuffer);
      
      // Convert PDF to images and OCR
      await execAsync(`pdftoppm -png "${tempPdf}" /tmp/page`);
      await execAsync(`tesseract /tmp/page-1.png "${tempTxt}" -l spa+eng`);
      
      const text = await fs.readFile(tempTxt + '.txt', 'utf8');
      return text.trim();
    } finally {
      // Cleanup temp files
      try {
        await fs.unlink(tempPdf);
        await fs.unlink(tempTxt + '.txt');
        await fs.unlink('/tmp/page-1.png');
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Method 5: Flag for manual processing
   */
  async flagForManualProcessing(filename) {
    const manualFile = path.join(process.cwd(), 'data', 'manual-processing-needed.txt');
    const content = `${new Date().toISOString()}: ${filename}\n`;
    
    await fs.mkdir(path.dirname(manualFile), { recursive: true });
    await fs.appendFile(manualFile, content);
    
    return null; // Still failed, but flagged for manual processing
  }

  /**
   * Process all failed PDFs and generate .txt sidecars
   */
  async processFailedPDFs(failedFiles, githubClient) {
    console.log(`🔄 Processing ${failedFiles.length} failed PDFs...`);
    
    const results = [];
    
    for (const file of failedFiles) {
      try {
        console.log(`\n📄 Processing: ${file.fullPath}`);
        
        // Get file content from GitHub
        const pdfBuffer = await this.getFileContentFromGitHub(file, githubClient);
        
        // Try to extract text
        const text = await this.extractText(pdfBuffer, file.name);
        
        if (text) {
          // Create .txt sidecar file
          const txtPath = file.fullPath.replace(/\.pdf$/i, '.txt');
          await this.createSidecarFile(txtPath, text, githubClient);
          
          results.push({
            file: file.fullPath,
            status: 'success',
            method: 'extracted',
            txtPath: txtPath
          });
        } else {
          results.push({
            file: file.fullPath,
            status: 'failed',
            method: 'all_methods_failed'
          });
        }
      } catch (error) {
        console.error(`❌ Error processing ${file.fullPath}:`, error.message);
        results.push({
          file: file.fullPath,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Get file content from GitHub
   */
  async getFileContentFromGitHub(file, githubClient) {
    const response = await fetch(file.download_url, {
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'KB-Legal-Assistant-Builder'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub download failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Create sidecar .txt file in GitHub
   */
  async createSidecarFile(txtPath, text, githubClient) {
    // This would require GitHub API to create/update files
    // For now, we'll save locally and suggest manual upload
    const localPath = path.join(process.cwd(), 'data', 'generated-sidecars', txtPath);
    
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, text, 'utf8');
    
    console.log(`✅ Created sidecar: ${txtPath}`);
    console.log(`📁 Local path: ${localPath}`);
  }
}

module.exports = PDFTextExtractor;
