// lib/github/loader.ts
// GitHub-based file loading for Knowledge Base

import { GitHubKBClient, createGitHubKBClient, MockGitHubKBClient } from './client';

/**
 * Try to load the full extracted text of a KB file from GitHub:
 * 1) Prefer sidecar .txt if present.
 * 2) Otherwise (fallback) extract from PDF in-process.
 */
export async function loadFullTextFromGitHub(fileRel: string): Promise<string | null> {
  let githubClient: GitHubKBClient;

  try {
    // Try to create real GitHub client first
    githubClient = createGitHubKBClient();
  } catch (error) {
    console.warn('GitHub client creation failed, falling back to mock client:', error);
    // Fallback to mock client for development
    githubClient = new MockGitHubKBClient();
  }

  const ext = getFileExtension(fileRel).toLowerCase();
  const sidecar = ext === '.pdf' ? fileRel.replace(/\.pdf$/i, '.txt') : null;

  // 1) Try sidecar .txt first
  if (sidecar) {
    try {
      const content = await githubClient.getFileContent(sidecar);
      if (content && content.trim().length > 0) {
        return content;
      }
    } catch (error) {
      console.log(`Sidecar file not found: ${sidecar}`);
    }
  }

  // 2) Fallback PDF extraction (only when needed)
  if (ext === '.pdf') {
    try {
      const pdfContent = await githubClient.getFileContent(fileRel);
      if (pdfContent) {
        return await extractTextFromPDF(pdfContent);
      }
    } catch (error) {
      console.error(`Failed to load PDF file ${fileRel}:`, error);
    }
  }

  // 3) Plain text files
  if (['.txt', '.md', '.html'].includes(ext)) {
    try {
      return await githubClient.getFileContent(fileRel);
    } catch (error) {
      console.error(`Failed to load text file ${fileRel}:`, error);
    }
  }

  return null;
}

/**
 * Get all documents from GitHub repository
 */
export async function getAllDocumentsFromGitHub(): Promise<string[]> {
  let githubClient: GitHubKBClient;

  try {
    githubClient = createGitHubKBClient();
  } catch (error) {
    console.warn('GitHub client creation failed, falling back to mock client:', error);
    githubClient = new MockGitHubKBClient();
  }

  try {
    const allFiles = await githubClient.getAllFiles();
    
    // Filter for supported document types
    const supportedExtensions = ['.pdf', '.txt', '.md', '.html', '.docx'];
    const documents = allFiles
      .filter(file => file.type === 'file')
      .filter(file => {
        const ext = getFileExtension(file.name).toLowerCase();
        return supportedExtensions.includes(ext);
      })
      .map(file => file.path);

    return documents;
  } catch (error) {
    console.error('Failed to get documents from GitHub:', error);
    return [];
  }
}

/**
 * Get file extension from path
 */
function getFileExtension(path: string): string {
  const lastDot = path.lastIndexOf('.');
  return lastDot >= 0 ? path.substring(lastDot) : '';
}

/**
 * Extract text from PDF content (base64 encoded)
 */
async function extractTextFromPDF(pdfContent: string): Promise<string | null> {
  try {
    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(pdfContent, 'base64');
    
    // Import pdfjs-dist dynamically
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
    
    // Load PDF document
    const doc = await pdfjs.getDocument({ data: pdfBuffer }).promise;
    
    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText.trim() || null;
  } catch (error) {
    console.error('PDF text extraction failed:', error);
    return null;
  }
}

/**
 * Get document metadata from GitHub
 */
export async function getDocumentMetadata(path: string): Promise<{
  name: string;
  path: string;
  size: number;
  lastModified?: string;
} | null> {
  let githubClient: GitHubKBClient;

  try {
    githubClient = createGitHubKBClient();
  } catch (error) {
    console.warn('GitHub client creation failed, falling back to mock client:', error);
    githubClient = new MockGitHubKBClient();
  }

  try {
    const metadata = await githubClient.getFileMetadata(path);
    if (!metadata) {
      return null;
    }

    return {
      name: metadata.name,
      path: metadata.path,
      size: metadata.size,
      lastModified: metadata.sha // Using SHA as a proxy for modification time
    };
  } catch (error) {
    console.error(`Failed to get metadata for ${path}:`, error);
    return null;
  }
}

/**
 * Check if GitHub integration is properly configured
 */
export function isGitHubConfigured(): boolean {
  return !!(
    process.env.GITHUB_TOKEN &&
    process.env.GITHUB_OWNER &&
    process.env.GITHUB_REPO
  );
}

/**
 * Get GitHub repository information
 */
export async function getRepositoryInfo(): Promise<{
  name: string;
  description: string;
  url: string;
  size: number;
  defaultBranch: string;
} | null> {
  let githubClient: GitHubKBClient;

  try {
    githubClient = createGitHubKBClient();
  } catch (error) {
    console.warn('GitHub client creation failed:', error);
    return null;
  }

  try {
    const repoInfo = await githubClient.getRepositoryInfo();
    
    return {
      name: repoInfo.name,
      description: repoInfo.description || '',
      url: repoInfo.html_url,
      size: repoInfo.size,
      defaultBranch: repoInfo.default_branch
    };
  } catch (error) {
    console.error('Failed to get repository info:', error);
    return null;
  }
}
