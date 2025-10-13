#!/usr/bin/env node

/**
 * Safe Document Addition Pipeline
 * 
 * Adds new documents to the KB with validation, dry-run mode, and error recovery.
 * 
 * Usage:
 *   node scripts/safe-add-documents.js --path "path/to/docs" [--dry-run] [--skip-github] [--skip-rebuild]
 * 
 * Options:
 *   --path         Path to new documents (relative to public/kb-text/kb-legal-documents/)
 *   --dry-run      Test the pipeline without making any changes
 *   --skip-github  Skip GitHub push (for testing)
 *   --skip-rebuild Skip KB rebuild (if you'll do it manually later)
 *   --force        Skip confirmations
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : null;
};
const hasFlag = (name) => args.includes(name);

const config = {
  documentPath: getArg('--path'),
  dryRun: hasFlag('--dry-run'),
  skipGithub: hasFlag('--skip-github'),
  skipRebuild: hasFlag('--skip-rebuild'),
  force: hasFlag('--force')
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logStep(step, msg) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`📋 STEP ${step}: ${msg}`, 'bright');
  log('='.repeat(60), 'cyan');
}

function logSuccess(msg) {
  log(`✅ ${msg}`, 'green');
}

function logWarning(msg) {
  log(`⚠️  ${msg}`, 'yellow');
}

function logError(msg) {
  log(`❌ ${msg}`, 'red');
}

function logInfo(msg) {
  log(`ℹ️  ${msg}`, 'blue');
}

async function prompt(question) {
  if (config.force) return true;
  
  process.stdout.write(`${colors.yellow}${question} (y/n): ${colors.reset}`);
  
  return new Promise((resolve) => {
    process.stdin.once('data', (data) => {
      const answer = data.toString().trim().toLowerCase();
      resolve(answer === 'y' || answer === 'yes');
    });
  });
}

function exec(command, options = {}) {
  if (config.dryRun) {
    logInfo(`[DRY RUN] Would execute: ${command}`);
    return '';
  }
  
  try {
    return execSync(command, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
  } catch (error) {
    if (options.allowFail) {
      return null;
    }
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function validateNewDocuments() {
  logStep(1, 'Validating New Documents');
  
  if (!config.documentPath) {
    logError('No document path provided. Use --path "path/to/docs"');
    process.exit(1);
  }
  
  const fullPath = path.join(PROJECT_ROOT, 'public/kb-text/kb-legal-documents', config.documentPath);
  
  if (!await fileExists(fullPath)) {
    logError(`Path does not exist: ${fullPath}`);
    process.exit(1);
  }
  
  // Get list of files
  const stats = await fs.stat(fullPath);
  let files = [];
  
  if (stats.isDirectory()) {
    const items = await fs.readdir(fullPath);
    files = items.map(f => path.join(fullPath, f));
  } else {
    files = [fullPath];
  }
  
  // Validate each file
  const pdfs = files.filter(f => f.toLowerCase().endsWith('.pdf'));
  const txts = files.filter(f => f.toLowerCase().endsWith('.txt'));
  const others = files.filter(f => !f.toLowerCase().endsWith('.pdf') && !f.toLowerCase().endsWith('.txt'));
  
  logInfo(`Found ${pdfs.length} PDF(s), ${txts.length} TXT file(s)`);
  
  if (others.length > 0) {
    logWarning(`Found ${others.length} other file(s) that won't be processed:`);
    others.forEach(f => console.log(`  - ${path.basename(f)}`));
  }
  
  // Check for PDFs without sidecars
  const pdfsWithoutSidecars = [];
  for (const pdf of pdfs) {
    const txtPath = pdf.replace(/\.pdf$/i, '.txt');
    if (!await fileExists(txtPath)) {
      pdfsWithoutSidecars.push(pdf);
    }
  }
  
  if (pdfsWithoutSidecars.length > 0) {
    logWarning(`${pdfsWithoutSidecars.length} PDF(s) need text extraction:`);
    pdfsWithoutSidecars.forEach(f => console.log(`  - ${path.basename(f)}`));
  }
  
  logSuccess(`Validation complete: ${pdfs.length + txts.length} document(s) ready to process`);
  
  return {
    fullPath,
    pdfs,
    txts,
    pdfsWithoutSidecars,
    totalDocs: pdfs.length + txts.length
  };
}

async function generateSidecars(validation) {
  if (validation.pdfsWithoutSidecars.length === 0) {
    logInfo('All PDFs already have sidecars, skipping extraction');
    return;
  }
  
  logStep(2, 'Generating PDF Text Sidecars');
  
  logInfo(`Extracting text from ${validation.pdfsWithoutSidecars.length} PDF(s)...`);
  
  try {
    exec('node scripts/generate-pdf-sidecars.js', { silent: false });
    logSuccess('Text extraction completed');
  } catch (error) {
    logError('PDF text extraction failed');
    throw error;
  }
}

async function checkGitStatus() {
  logStep(3, 'Checking Git Status');
  
  // Check main repo
  const mainStatus = exec('git status --porcelain', { silent: true });
  if (mainStatus && mainStatus.trim()) {
    logWarning('Main repository has uncommitted changes:');
    console.log(mainStatus);
  } else {
    logSuccess('Main repository is clean');
  }
  
  // Check submodule
  const submoduleStatus = exec('git -C kb-legal-documents status --porcelain', { silent: true, allowFail: true });
  if (submoduleStatus && submoduleStatus.trim()) {
    logInfo('Submodule has changes (expected - new documents)');
  }
  
  return { mainStatus, submoduleStatus };
}

async function pushToGithub(validation) {
  if (config.skipGithub) {
    logWarning('Skipping GitHub push (--skip-github flag)');
    return;
  }
  
  logStep(4, 'Pushing to GitHub');
  
  // Add and commit to submodule
  logInfo('Committing to kb-legal-documents submodule...');
  
  const relPath = path.relative(
    path.join(PROJECT_ROOT, 'public/kb-text/kb-legal-documents'),
    validation.fullPath
  );
  
  exec(`git -C kb-legal-documents add "${relPath}"`);
  
  const commitMsg = `Add new documents: ${path.basename(validation.fullPath)} (${validation.totalDocs} files)`;
  exec(`git -C kb-legal-documents commit -m "${commitMsg}"`);
  
  logSuccess('Committed to submodule');
  
  // Push submodule
  if (!config.dryRun) {
    const shouldPush = await prompt('Push submodule to GitHub?');
    if (!shouldPush) {
      logWarning('Skipping GitHub push');
      return;
    }
  }
  
  logInfo('Pushing kb-legal-documents to GitHub...');
  exec('git -C kb-legal-documents push origin main');
  logSuccess('Pushed to GitHub');
  
  // Update submodule reference in main repo
  logInfo('Updating submodule reference in main repo...');
  exec('git add public/kb-text/kb-legal-documents');
  exec(`git commit -m "Update kb-legal-documents submodule: ${commitMsg}"`);
  
  if (!config.dryRun) {
    const shouldPushMain = await prompt('Push main repo to GitHub?');
    if (shouldPushMain) {
      exec('git push origin main');
      logSuccess('Pushed main repo to GitHub');
    }
  }
}

async function rebuildKB() {
  if (config.skipRebuild) {
    logWarning('Skipping KB rebuild (--skip-rebuild flag)');
    logInfo('Remember to run: node scripts/build-kb-from-github.js');
    return;
  }
  
  logStep(5, 'Rebuilding Knowledge Base');
  
  if (!config.dryRun) {
    const shouldRebuild = await prompt('Rebuild KB with new documents (may take several minutes)?');
    if (!shouldRebuild) {
      logWarning('Skipping KB rebuild');
      logInfo('Remember to run: node scripts/build-kb-from-github.js');
      return;
    }
  }
  
  logInfo('Rebuilding KB (this may take a few minutes)...');
  
  try {
    exec('node scripts/build-kb-from-github.js', { silent: false });
    logSuccess('KB rebuild completed');
  } catch (error) {
    logError('KB rebuild failed');
    throw error;
  }
}

async function verifyResults() {
  logStep(6, 'Verifying Results');
  
  // Check embeddings count
  const embeddingsPath = path.join(PROJECT_ROOT, 'public/kb-text/embeddings.json');
  
  if (await fileExists(embeddingsPath)) {
    const embData = JSON.parse(await fs.readFile(embeddingsPath, 'utf-8'));
    const embCount = embData.items ? embData.items.length : 0;
    logSuccess(`Embeddings file exists: ${embCount} embeddings`);
  } else {
    logWarning('Embeddings file not found');
  }
  
  // Check kb_index
  const indexPath = path.join(PROJECT_ROOT, 'public/kb-text/kb_index.json');
  
  if (await fileExists(indexPath)) {
    const indexData = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
    const docCount = Array.isArray(indexData) ? indexData.length : 0;
    logSuccess(`Index file exists: ${docCount} documents`);
  } else {
    logWarning('Index file not found');
  }
}

async function main() {
  try {
    log('\n' + '='.repeat(60), 'bright');
    log('🚀 SAFE DOCUMENT ADDITION PIPELINE', 'bright');
    log('='.repeat(60), 'bright');
    
    if (config.dryRun) {
      logWarning('DRY RUN MODE - No changes will be made');
    }
    
    // Step 1: Validate
    const validation = await validateNewDocuments();
    
    // Step 2: Generate sidecars
    await generateSidecars(validation);
    
    // Step 3: Check git status
    await checkGitStatus();
    
    // Step 4: Push to GitHub
    await pushToGithub(validation);
    
    // Step 5: Rebuild KB
    await rebuildKB();
    
    // Step 6: Verify
    if (!config.skipRebuild && !config.dryRun) {
      await verifyResults();
    }
    
    // Final summary
    log('\n' + '='.repeat(60), 'green');
    log('✅ PIPELINE COMPLETED SUCCESSFULLY', 'green');
    log('='.repeat(60), 'green');
    
    logSuccess(`Added ${validation.totalDocs} document(s) to KB`);
    
    if (config.dryRun) {
      logInfo('This was a dry run. Run without --dry-run to apply changes.');
    } else {
      logInfo('Documents are now available in the AI chat!');
      logInfo('Visit: https://ai.olivogalarza.com/kb to verify');
    }
    
    process.exit(0);
    
  } catch (error) {
    log('\n' + '='.repeat(60), 'red');
    log('❌ PIPELINE FAILED', 'red');
    log('='.repeat(60), 'red');
    
    logError(`Error: ${error.message}`);
    
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    logInfo('\nThe pipeline stopped safely. No partial changes were committed.');
    logInfo('Fix the error and run the script again.');
    
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  log('\n\n⚠️  Pipeline interrupted by user', 'yellow');
  log('No changes were committed.', 'yellow');
  process.exit(130);
});

main();

