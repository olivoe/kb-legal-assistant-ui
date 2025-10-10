#!/usr/bin/env node
// Upload/update a file in the KB GitHub repo using Octokit

require('dotenv').config({ path: '.env.local' });
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

async function main() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const src = process.argv[2];
  const dest = process.argv[3];

  if (!owner || !repo || !token) {
    console.error('Missing GITHUB_OWNER/GITHUB_REPO/GITHUB_TOKEN');
    process.exit(1);
  }
  if (!src || !dest) {
    console.error('Usage: node scripts/update-github-file.js <localPath> <repoPath>');
    process.exit(1);
  }

  const content = fs.readFileSync(src);
  const octokit = new Octokit({ auth: token });

  let sha = undefined;
  try {
    const existing = await octokit.repos.getContent({ owner, repo, path: dest });
    if (existing && existing.data && existing.data.sha) sha = existing.data.sha;
  } catch (_) {
    // not found is fine
  }

  const message = `Add/update sidecar: ${dest}`;
  const res = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: dest,
    message,
    content: content.toString('base64'),
    sha,
  });

  console.log('Uploaded:', res.data.content && res.data.content.path);
}

main().catch((e) => { console.error(e); process.exit(1); });


