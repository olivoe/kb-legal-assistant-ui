#!/usr/bin/env node

import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const github = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

if (!owner || !repo) {
  console.error('❌ Missing GITHUB_OWNER or GITHUB_REPO in .env.local');
  process.exit(1);
}

// List of PDFs that failed during the build process
const failedPDFs = [
  'Materiales Extranjeria/Normativa/BOE-A-2024-24099 Reglamento.pdf',
  'Materiales Extranjeria/Normativa/BOE-A-2025-12056 Tasas.pdf',
  'Materiales Extranjeria/Normativa/BOE-A-2025-15752 estructura Ministerio.pdf',
  'Materiales Extranjeria/Normativa/BOE-B-2025-22775 ampliacion homologacion.pdf',
  'Materiales Extranjeria/Normativa/L00021-00057 Directiva (UE) 2016-801 estudios.pdf',
  'Materiales Extranjeria/Normativa/L00035-00048 Directiva 2004-38-CE ciudadanos UE.pdf',
  'Materiales Extranjeria/Normativa/L00044-00053 Directiva 2003-109 ciudadanos UE.pdf',
  'Materiales Extranjeria/Normativa/OJ_L_202501208_ES_TXT.pdf',
  'Materiales Extranjeria/Normativa/OJ_L_202501544_ES_TXT.pdf',
  'Materiales Extranjeria/Notas aclaratorias/2024-12-02 Nota aclaratoria disposicion transitoria segunda.pdf',
  'Materiales Extranjeria/Notas aclaratorias/2025-01-30 Nota aclaratoria disposicion transitoria quinta.pdf',
  'Materiales Extranjeria/Notas/25-06-20 Nota NUSS DT2 Reglamento.pdf',
  'articulos/25-08-19 Ley de Nietos EN.pdf',
  'articulos/25-08-19 Ley de Nietos ES.pdf',
  'articulos/Asesoria-migratoria-inversion.pdf',
  'articulos/Computo DT5.pdf',
  'articulos/Nacionalidad - matrimonio extranjero.pdf'
];

async function downloadPDFFromGitHub(filePath) {
  try {
    const response = await github.repos.getContent({
      owner,
      repo,
      path: filePath,
    });

    if (response.data.type === 'file' && response.data.download_url) {
      const downloadResponse = await fetch(response.data.download_url, {
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'User-Agent': 'KB-Legal-Assistant-Builder'
        }
      });

      if (!downloadResponse.ok) {
        throw new Error(`GitHub download failed: ${downloadResponse.status}`);
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    throw new Error('File not found or not downloadable');
  } catch (error) {
    console.error(`❌ Failed to download ${filePath}:`, error.message);
    return null;
  }
}

async function extractTextWithPdftotext(pdfBuffer, outputPath) {
  try {
    // Write PDF to temporary file
    const tempPdfPath = path.join(process.cwd(), 'temp.pdf');
    await fs.writeFile(tempPdfPath, pdfBuffer);

    // Extract text using pdftotext with layout preservation
    const command = `pdftotext -layout "${tempPdfPath}" "${outputPath}"`;
    execSync(command, { stdio: 'pipe' });

    // Clean up temp file
    await fs.unlink(tempPdfPath);

    // Check if text was extracted
    const text = await fs.readFile(outputPath, 'utf8');
    if (text.trim().length < 10) {
      throw new Error('Extracted text too short');
    }

    return true;
  } catch (error) {
    console.error(`❌ pdftotext failed:`, error.message);
    return false;
  }
}

async function processFailedPDFs() {
  console.log('🔧 Processing failed PDFs...\n');

  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const pdfPath of failedPDFs) {
    console.log(`📄 Processing: ${pdfPath}`);
    
    try {
      // Download PDF from GitHub
      const pdfBuffer = await downloadPDFFromGitHub(pdfPath);
      if (!pdfBuffer) {
        results.failed++;
        results.errors.push(`${pdfPath}: Download failed`);
        continue;
      }

      // Create output directory
      const outputDir = path.join(process.cwd(), 'data', 'generated-sidecars');
      await fs.mkdir(outputDir, { recursive: true });

      // Generate .txt filename
      const txtPath = path.join(outputDir, pdfPath.replace(/\.pdf$/i, '.txt'));
      await fs.mkdir(path.dirname(txtPath), { recursive: true });

      // Extract text
      const success = await extractTextWithPdftotext(pdfBuffer, txtPath);
      
      if (success) {
        console.log(`✅ Generated: ${txtPath}`);
        results.success++;
      } else {
        results.failed++;
        results.errors.push(`${pdfPath}: Text extraction failed`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${pdfPath}:`, error.message);
      results.failed++;
      results.errors.push(`${pdfPath}: ${error.message}`);
    }

    console.log(''); // Empty line for readability
  }

  // Summary
  console.log('📊 Processing Summary:');
  console.log(`✅ Success: ${results.success}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(error => console.log(`   ${error}`));
  }

  if (results.success > 0) {
    console.log('\n📋 Next Steps:');
    console.log('1. Upload the generated .txt files to GitHub:');
    console.log('   cd data/generated-sidecars');
    console.log('   git add .');
    console.log('   git commit -m "Add .txt sidecars for failed PDFs"');
    console.log('   git push origin main');
    console.log('\n2. Rebuild the KB:');
    console.log('   npm run build-kb');
  }

  return results;
}

// Run the script
processFailedPDFs().catch(console.error);
