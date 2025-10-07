#!/usr/bin/env node
/**
 * Deployment script for KB processing
 * Builds KB from GitHub and prepares for production deployment
 * 
 * Usage: node scripts/deploy-kb.js
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

async function deployKB() {
  console.log('🚀 Starting KB Deployment Process...\n');

  try {
    // Step 1: Build KB from GitHub
    console.log('📡 Step 1: Building KB from GitHub repository...');
    execSync('node scripts/build-kb-from-github.js', { stdio: 'inherit' });

    // Step 2: Verify files were created
    console.log('\n✅ Step 2: Verifying generated files...');
    
    const embeddingsPath = path.join(process.cwd(), 'public', 'embeddings.json');
    const kbIndexPath = path.join(process.cwd(), 'public', 'kb_index.json');
    
    const embeddingsExists = await fs.access(embeddingsPath).then(() => true).catch(() => false);
    const kbIndexExists = await fs.access(kbIndexPath).then(() => true).catch(() => false);

    if (!embeddingsExists || !kbIndexExists) {
      throw new Error('Generated files are missing. Build process failed.');
    }

    // Step 3: Get file stats
    const embeddingsStats = await fs.stat(embeddingsPath);
    const kbIndexStats = await fs.stat(kbIndexPath);

    console.log(`   📁 embeddings.json: ${(embeddingsStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   📁 kb_index.json: ${(kbIndexStats.size / 1024).toFixed(2)} KB`);

    // Step 4: Build Next.js application
    console.log('\n🏗️  Step 3: Building Next.js application...');
    execSync('npm run build', { stdio: 'inherit' });

    console.log('\n🎉 KB Deployment completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Deploy to your hosting platform (Vercel, etc.)');
    console.log('   2. Verify KB is working at: https://ai.olivogalarza.com/kb');
    console.log('   3. Test search functionality');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  deployKB();
}

module.exports = deployKB;
