#!/usr/bin/env node
/**
 * Migration script to help move KB files from local storage to GitHub
 * 
 * Usage:
 *   node scripts/migrate-to-github.js
 * 
 * This script will:
 * 1. List all files in the current kb-text directory
 * 2. Provide instructions for creating a GitHub repository
 * 3. Show the recommended repository structure
 */

const fs = require('fs');
const path = require('path');

const KB_TEXT_DIR = path.join(__dirname, '..', 'public', 'kb-text');

function scanDirectory(dir, relativePath = '') {
  const items = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip certain directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        
        items.push({
          type: 'directory',
          name: entry.name,
          path: relPath,
          children: scanDirectory(fullPath, relPath)
        });
      } else {
        // Only include supported file types
        const ext = path.extname(entry.name).toLowerCase();
        if (['.pdf', '.txt', '.md', '.html', '.docx', '.json'].includes(ext)) {
          const stats = fs.statSync(fullPath);
          items.push({
            type: 'file',
            name: entry.name,
            path: relPath,
            size: stats.size,
            extension: ext
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error.message);
  }
  
  return items;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function printStructure(items, indent = 0) {
  const prefix = '  '.repeat(indent);
  
  for (const item of items) {
    if (item.type === 'directory') {
      console.log(`${prefix}📁 ${item.name}/`);
      printStructure(item.children, indent + 1);
    } else {
      const size = formatSize(item.size);
      console.log(`${prefix}📄 ${item.name} (${size})`);
    }
  }
}

function calculateTotalSize(items) {
  let total = 0;
  
  for (const item of items) {
    if (item.type === 'file') {
      total += item.size;
    } else if (item.type === 'directory') {
      total += calculateTotalSize(item.children);
    }
  }
  
  return total;
}

function countFiles(items) {
  let count = 0;
  
  for (const item of items) {
    if (item.type === 'file') {
      count++;
    } else if (item.type === 'directory') {
      count += countFiles(item.children);
    }
  }
  
  return count;
}

function main() {
  console.log('🔍 Scanning Knowledge Base files...\n');
  
  if (!fs.existsSync(KB_TEXT_DIR)) {
    console.error('❌ Knowledge Base directory not found:', KB_TEXT_DIR);
    console.log('Please make sure the kb-text directory exists in the public folder.');
    process.exit(1);
  }
  
  const items = scanDirectory(KB_TEXT_DIR);
  const totalSize = calculateTotalSize(items);
  const fileCount = countFiles(items);
  
  console.log('📊 Knowledge Base Summary:');
  console.log(`   Total files: ${fileCount}`);
  console.log(`   Total size: ${formatSize(totalSize)}`);
  console.log(`   Directory: ${KB_TEXT_DIR}\n`);
  
  console.log('📁 Current Repository Structure:');
  printStructure(items);
  console.log('');
  
  console.log('🚀 Next Steps to Migrate to GitHub:');
  console.log('');
  console.log('1. Create a new GitHub repository:');
  console.log('   - Go to https://github.com/new');
  console.log('   - Name it: kb-legal-documents');
  console.log('   - Make it private (recommended for legal documents)');
  console.log('   - Initialize with README');
  console.log('');
  console.log('2. Create a GitHub Personal Access Token:');
  console.log('   - Go to https://github.com/settings/tokens');
  console.log('   - Click "Generate new token (classic)"');
  console.log('   - Select scopes: "repo" (for private repos) or "public_repo" (for public)');
  console.log('   - Copy the token');
  console.log('');
  console.log('3. Set up environment variables:');
  console.log('   - Copy env.template to .env.local');
  console.log('   - Fill in your GitHub credentials');
  console.log('');
  console.log('4. Upload files to GitHub:');
  console.log('   - Clone the new repository locally');
  console.log('   - Copy all files from public/kb-text/ to the repository');
  console.log('   - Commit and push to GitHub');
  console.log('');
  console.log('5. Update the application:');
  console.log('   - Install dependencies: npm install @octokit/rest');
  console.log('   - Update your API routes to use GitHub endpoints');
  console.log('   - Test the integration');
  console.log('');
  console.log('💡 Tips:');
  console.log('   - Keep the same directory structure in GitHub');
  console.log('   - Ensure .txt sidecar files are included for PDFs');
  console.log('   - Consider using Git LFS for large PDF files');
  console.log('   - Set up webhooks for automatic updates');
  
  if (totalSize > 100 * 1024 * 1024) { // 100MB
    console.log('');
    console.log('⚠️  Warning: Your repository is larger than 100MB.');
    console.log('   Consider using Git LFS for large files or splitting into multiple repositories.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { scanDirectory, calculateTotalSize, countFiles };
