#!/usr/bin/env node
/**
 * Fix Failed PDFs - Install tools and process problematic PDFs
 * 
 * Usage: node scripts/fix-failed-pdfs.js
 */

require('dotenv').config({ path: '.env.local' });
const PDFTextExtractor = require('./pdf-text-extractor');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class FailedPDFFixer {
  constructor() {
    this.extractor = new PDFTextExtractor();
    this.failedFiles = [
      // Add the files that failed during processing
      {
        fullPath: "articulos/25-08-19 Ley de Nietos EN.pdf",
        name: "25-08-19 Ley de Nietos EN.pdf",
        download_url: `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/articulos/25-08-19%20Ley%20de%20Nietos%20EN.pdf`
      },
      {
        fullPath: "articulos/25-08-19 Ley de Nietos ES.pdf", 
        name: "25-08-19 Ley de Nietos ES.pdf",
        download_url: `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/articulos/25-08-19%20Ley%20de%20Nietos%20ES.pdf`
      }
    ];
  }

  /**
   * Check if required tools are installed
   */
  async checkTools() {
    console.log('🔧 Checking required tools...\n');
    
    const tools = [
      { name: 'pdftotext', check: 'pdftotext -v', install: 'brew install poppler' },
      { name: 'ghostscript', check: 'gs -v', install: 'brew install ghostscript' },
      { name: 'tesseract', check: 'tesseract -v', install: 'brew install tesseract' }
    ];

    const missingTools = [];

    for (const tool of tools) {
      try {
        await execAsync(tool.check);
        console.log(`✅ ${tool.name}: installed`);
      } catch (error) {
        console.log(`❌ ${tool.name}: not installed`);
        missingTools.push(tool);
      }
    }

    if (missingTools.length > 0) {
      console.log('\n📦 Missing tools detected:');
      for (const tool of missingTools) {
        console.log(`   ${tool.install}`);
      }
      
      console.log('\n🚀 Install missing tools with:');
      const installCommands = missingTools.map(tool => tool.install).join(' && ');
      console.log(`   ${installCommands}`);
      
      return false;
    }

    return true;
  }

  /**
   * Install required tools
   */
  async installTools() {
    console.log('📦 Installing required tools...\n');
    
    try {
      // Install poppler (includes pdftotext)
      console.log('Installing poppler...');
      await execAsync('brew install poppler');
      
      // Install ghostscript
      console.log('Installing ghostscript...');
      await execAsync('brew install ghostscript');
      
      // Install tesseract
      console.log('Installing tesseract...');
      await execAsync('brew install tesseract');
      
      console.log('✅ All tools installed successfully!');
      return true;
    } catch (error) {
      console.error('❌ Error installing tools:', error.message);
      return false;
    }
  }

  /**
   * Process failed PDFs
   */
  async processFailedPDFs() {
    console.log('🔄 Processing failed PDFs...\n');
    
    try {
      const results = await this.extractor.processFailedPDFs(this.failedFiles);
      
      console.log('\n📊 Processing Results:');
      for (const result of results) {
        if (result.status === 'success') {
          console.log(`✅ ${result.file}: ${result.method} → ${result.txtPath}`);
        } else {
          console.log(`❌ ${result.file}: ${result.status}`);
        }
      }
      
      return results;
    } catch (error) {
      console.error('❌ Error processing PDFs:', error.message);
      return [];
    }
  }

  /**
   * Run the complete fix process
   */
  async run() {
    try {
      console.log('🚀 Starting PDF Fix Process...\n');
      
      // Step 1: Check tools
      const toolsInstalled = await this.checkTools();
      
      if (!toolsInstalled) {
        console.log('\n⚠️  Some tools are missing. Please install them first:');
        console.log('   brew install poppler ghostscript tesseract');
        console.log('\nThen run this script again.');
        return;
      }
      
      // Step 2: Process failed PDFs
      const results = await this.processFailedPDFs();
      
      // Step 3: Summary
      console.log('\n🎉 PDF Fix Process completed!');
      console.log('\n📋 Next steps:');
      console.log('   1. Review generated .txt files in data/generated-sidecars/');
      console.log('   2. Upload .txt files to GitHub repository');
      console.log('   3. Re-run: npm run build-kb');
      
    } catch (error) {
      console.error('\n❌ PDF Fix Process failed:', error.message);
      process.exit(1);
    }
  }
}

// Run the fixer
if (require.main === module) {
  const fixer = new FailedPDFFixer();
  fixer.run();
}

module.exports = FailedPDFFixer;
