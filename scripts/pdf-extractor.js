#!/usr/bin/env node
/**
 * Multi-Method PDF Text Extraction
 * Tries multiple methods in order of preference:
 * 1. .txt sidecar file (pre-extracted, highest quality)
 * 2. pdfjs-dist (fast, works for most PDFs)
 * 3. pdftotext via poppler (better for complex layouts)
 * 4. ghostscript + tesseract (OCR for scanned PDFs)
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class PDFExtractor {
  constructor(options = {}) {
    this.preferSidecars = options.preferSidecars !== false;
    this.verbose = options.verbose || false;
  }

  /**
   * Extract text from PDF using all available methods
   * @param {Buffer|string} input - PDF buffer or file path
   * @param {string} filePath - Original file path (for sidecar lookup)
   * @returns {Promise<{text: string, method: string}>}
   */
  async extract(input, filePath = null) {
    const methods = [];

    // Method 1: Check for .txt sidecar
    if (this.preferSidecars && filePath) {
      methods.push(() => this.extractFromSidecar(filePath));
    }

    // Method 2: pdfjs-dist (fast, pure JS)
    methods.push(() => this.extractWithPdfjs(input));

    // Method 3: pdftotext (better layout preservation)
    methods.push(() => this.extractWithPdftotext(input));

    // Method 4: ghostscript + tesseract (OCR)
    methods.push(() => this.extractWithOCR(input));

    // Try each method in order
    for (const method of methods) {
      try {
        const result = await method();
        if (result && result.text && result.text.trim().length > 50) {
          if (this.verbose) {
            console.log(`✅ Extracted ${result.text.length} chars using ${result.method}`);
          }
          return result;
        }
      } catch (error) {
        if (this.verbose) {
          console.log(`⚠️  Method failed: ${error.message}`);
        }
      }
    }

    // All methods failed
    return { text: '', method: 'none' };
  }

  /**
   * Method 1: Extract from .txt sidecar file
   */
  async extractFromSidecar(pdfPath) {
    const txtPath = pdfPath.replace(/\.pdf$/i, '.txt');
    
    try {
      const text = await fs.readFile(txtPath, 'utf8');
      if (text.trim().length > 50) {
        return { text, method: 'sidecar' };
      }
    } catch (error) {
      throw new Error('No sidecar file found');
    }

    throw new Error('Sidecar file empty or too short');
  }

  /**
   * Method 2: Extract using pdfjs-dist
   */
  async extractWithPdfjs(input) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
    
    const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    if (fullText.trim().length < 50) {
      throw new Error('pdfjs extracted text too short');
    }

    return { text: fullText.trim(), method: 'pdfjs' };
  }

  /**
   * Method 3: Extract using pdftotext (poppler)
   */
  async extractWithPdftotext(input) {
    // Check if pdftotext is available
    try {
      execSync('which pdftotext', { stdio: 'ignore' });
    } catch {
      throw new Error('pdftotext not installed');
    }

    const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
    const tmpDir = '/tmp';
    const tmpPdf = path.join(tmpDir, `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    const tmpTxt = tmpPdf.replace('.pdf', '.txt');

    try {
      await fs.writeFile(tmpPdf, buffer);
      execSync(`pdftotext -layout "${tmpPdf}" "${tmpTxt}"`, { stdio: 'ignore' });
      const text = await fs.readFile(tmpTxt, 'utf8');
      
      if (text.trim().length < 50) {
        throw new Error('pdftotext extracted text too short');
      }

      return { text: text.trim(), method: 'pdftotext' };
    } finally {
      // Cleanup
      try { await fs.unlink(tmpPdf); } catch {}
      try { await fs.unlink(tmpTxt); } catch {}
    }
  }

  /**
   * Method 4: Extract using OCR (ghostscript + tesseract)
   */
  async extractWithOCR(input) {
    // Check if required tools are available
    try {
      execSync('which gs', { stdio: 'ignore' });
      execSync('which tesseract', { stdio: 'ignore' });
    } catch {
      throw new Error('OCR tools not installed (gs, tesseract)');
    }

    const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
    const tmpDir = '/tmp';
    const tmpPdf = path.join(tmpDir, `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    const tmpPng = tmpPdf.replace('.pdf', '-%03d.png');
    const tmpTxt = tmpPdf.replace('.pdf', '');

    try {
      await fs.writeFile(tmpPdf, buffer);
      
      // Convert PDF to images using ghostscript
      execSync(`gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r300 -sOutputFile="${tmpPng}" "${tmpPdf}"`, { stdio: 'ignore' });
      
      // OCR each page
      let fullText = '';
      for (let i = 0; i < 100; i++) { // Max 100 pages
        const pageFile = tmpPng.replace('%03d', String(i).padStart(3, '0'));
        try {
          await fs.access(pageFile);
          execSync(`tesseract "${pageFile}" "${tmpTxt}-${i}" -l spa+eng --psm 1`, { stdio: 'ignore' });
          const pageText = await fs.readFile(`${tmpTxt}-${i}.txt`, 'utf8');
          fullText += pageText + '\n';
          
          // Cleanup page files
          await fs.unlink(pageFile);
          await fs.unlink(`${tmpTxt}-${i}.txt`);
        } catch {
          break; // No more pages
        }
      }
      
      if (fullText.trim().length < 50) {
        throw new Error('OCR extracted text too short');
      }

      return { text: fullText.trim(), method: 'ocr' };
    } finally {
      // Cleanup
      try { await fs.unlink(tmpPdf); } catch {}
    }
  }

  /**
   * Check which extraction methods are available
   */
  static async checkAvailableMethods() {
    const methods = {
      pdfjs: true, // Always available (npm package)
      pdftotext: false,
      ocr: false
    };

    try {
      execSync('which pdftotext', { stdio: 'ignore' });
      methods.pdftotext = true;
    } catch {}

    try {
      execSync('which gs', { stdio: 'ignore' });
      execSync('which tesseract', { stdio: 'ignore' });
      methods.ocr = true;
    } catch {}

    return methods;
  }
}

module.exports = { PDFExtractor };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node pdf-extractor.js <pdf-file>');
    console.log('');
    console.log('Available methods:');
    PDFExtractor.checkAvailableMethods().then(methods => {
      console.log('  - pdfjs:', methods.pdfjs ? '✅' : '❌');
      console.log('  - pdftotext:', methods.pdftotext ? '✅' : '❌');
      console.log('  - ocr:', methods.ocr ? '✅' : '❌');
    });
    process.exit(1);
  }

  const pdfPath = args[0];
  const extractor = new PDFExtractor({ verbose: true });
  
  extractor.extract(pdfPath, pdfPath)
    .then(result => {
      console.log('');
      console.log(`Method: ${result.method}`);
      console.log(`Length: ${result.text.length} chars`);
      console.log('');
      console.log('--- Text Preview (first 500 chars) ---');
      console.log(result.text.substring(0, 500));
      console.log('...');
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}
