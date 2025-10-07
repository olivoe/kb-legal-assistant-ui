#!/usr/bin/env node
/**
 * Test script for GitHub integration
 * Run this after setting up your environment variables
 */

require('dotenv').config({ path: '.env.local' });

async function testGitHubIntegration() {
  console.log('🧪 Testing GitHub Integration...\n');

  // Check environment variables
  console.log('1. Checking environment variables:');
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || token === 'your_github_personal_access_token_here') {
    console.log('❌ GITHUB_TOKEN not set or still has placeholder value');
    return;
  }
  console.log('✅ GITHUB_TOKEN is set');

  if (!owner || owner === 'your-github-username') {
    console.log('❌ GITHUB_OWNER not set or still has placeholder value');
    return;
  }
  console.log(`✅ GITHUB_OWNER is set: ${owner}`);

  if (!repo || repo === 'your-repository-name' || repo === '') {
    console.log('❌ GITHUB_REPO not set or still has placeholder value');
    return;
  }
  console.log(`✅ GITHUB_REPO is set: ${repo}\n`);

  // Test GitHub API connection
  console.log('2. Testing GitHub API connection:');
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'KB-Legal-Assistant-Test'
      }
    });

    if (response.ok) {
      const repoData = await response.json();
      console.log(`✅ Repository found: ${repoData.full_name}`);
      console.log(`   Description: ${repoData.description || 'No description'}`);
      console.log(`   Private: ${repoData.private ? 'Yes' : 'No'}`);
      console.log(`   Size: ${repoData.size} KB\n`);
    } else {
      console.log(`❌ Repository not found or access denied: ${response.status}`);
      console.log(`   Make sure the repository exists and your token has access\n`);
      return;
    }
  } catch (error) {
    console.log(`❌ API connection failed: ${error.message}\n`);
    return;
  }

  // Test file listing
  console.log('3. Testing file access:');
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'KB-Legal-Assistant-Test'
      }
    });

    if (response.ok) {
      const files = await response.json();
      console.log(`✅ Repository accessible, found ${files.length} items:`);
      
      // Show first few items
      files.slice(0, 5).forEach(file => {
        console.log(`   ${file.type === 'dir' ? '📁' : '📄'} ${file.name}`);
      });
      
      if (files.length > 5) {
        console.log(`   ... and ${files.length - 5} more items`);
      }
      console.log('');
    } else {
      console.log(`❌ Cannot access repository contents: ${response.status}\n`);
      return;
    }
  } catch (error) {
    console.log(`❌ File access failed: ${error.message}\n`);
    return;
  }

  // Test our application API
  console.log('4. Testing application API:');
  try {
    const response = await fetch('http://localhost:3000/api/kb/documents-github');
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Application API working: ${data.count} documents found`);
      console.log(`   Source: ${data.source}`);
      if (data.repository) {
        console.log(`   Repository: ${data.repository.name}`);
      }
    } else {
      console.log(`❌ Application API failed: ${response.status}`);
      console.log('   Make sure your Next.js app is running (npm run dev)');
    }
  } catch (error) {
    console.log(`❌ Application API test failed: ${error.message}`);
    console.log('   Make sure your Next.js app is running (npm run dev)');
  }

  console.log('\n🎉 GitHub integration test complete!');
  console.log('\nNext steps:');
  console.log('1. Start your development server: npm run dev');
  console.log('2. Visit: http://localhost:3000/kb');
  console.log('3. Check that documents load from GitHub');
  console.log('4. Test search functionality');
}

// Run the test
testGitHubIntegration().catch(console.error);
