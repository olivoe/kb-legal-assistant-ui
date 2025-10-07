// lib/github/client.ts
// GitHub API client for Knowledge Base file access

export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  download_url?: string;
  content?: string;
  encoding?: string;
}

export interface GitHubRepository {
  owner: string;
  repo: string;
  branch?: string;
}

export class GitHubKBClient {
  private token: string;
  private repo: GitHubRepository;
  private baseUrl: string;

  constructor(token: string, repository: GitHubRepository) {
    this.token = token;
    this.repo = repository;
    this.baseUrl = `https://api.github.com/repos/${repository.owner}/${repository.repo}`;
  }

  /**
   * Get file content from GitHub repository
   */
  async getFileContent(path: string): Promise<string> {
    try {
      const url = `${this.baseUrl}/contents/${encodeURIComponent(path)}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'KB-Legal-Assistant-UI'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`File not found: ${path}`);
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.type !== 'file') {
        throw new Error(`Path is not a file: ${path}`);
      }

      if (data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf8');
      } else {
        return data.content;
      }
    } catch (error) {
      console.error(`Error fetching file ${path}:`, error);
      throw error;
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(path: string = ''): Promise<GitHubFile[]> {
    try {
      const url = `${this.baseUrl}/contents/${encodeURIComponent(path)}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'KB-Legal-Assistant-UI'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return []; // Directory doesn't exist
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!Array.isArray(data)) {
        throw new Error(`Expected array of files, got: ${typeof data}`);
      }

      return data as GitHubFile[];
    } catch (error) {
      console.error(`Error listing files in ${path}:`, error);
      throw error;
    }
  }

  /**
   * Recursively get all files in the repository
   */
  async getAllFiles(path: string = ''): Promise<GitHubFile[]> {
    const allFiles: GitHubFile[] = [];
    
    try {
      const items = await this.listFiles(path);
      
      for (const item of items) {
        if (item.type === 'file') {
          allFiles.push(item);
        } else if (item.type === 'dir') {
          const subFiles = await this.getAllFiles(item.path);
          allFiles.push(...subFiles);
        }
      }
    } catch (error) {
      console.error(`Error getting all files from ${path}:`, error);
    }

    return allFiles;
  }

  /**
   * Get file metadata without content
   */
  async getFileMetadata(path: string): Promise<GitHubFile | null> {
    try {
      const url = `${this.baseUrl}/contents/${encodeURIComponent(path)}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'KB-Legal-Assistant-UI'
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data as GitHubFile;
    } catch (error) {
      console.error(`Error getting file metadata for ${path}:`, error);
      return null;
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(path: string): Promise<boolean> {
    const metadata = await this.getFileMetadata(path);
    return metadata !== null && metadata.type === 'file';
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo(): Promise<any> {
    try {
      const response = await fetch(this.baseUrl, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'KB-Legal-Assistant-UI'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting repository info:', error);
      throw error;
    }
  }
}

/**
 * Create a GitHub KB client from environment variables
 */
export function createGitHubKBClient(): GitHubKBClient {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new Error('Missing required environment variables: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
  }

  return new GitHubKBClient(token, { owner, repo });
}

/**
 * Fallback client for development/testing without GitHub API
 */
export class MockGitHubKBClient extends GitHubKBClient {
  constructor() {
    super('mock-token', { owner: 'mock', repo: 'mock' });
  }

  async getFileContent(path: string): Promise<string> {
    // Fallback to local filesystem for development
    const fs = await import('fs/promises');
    const pathModule = await import('path');
    
    try {
      const localPath = pathModule.join(process.cwd(), 'public', 'kb-text', path);
      return await fs.readFile(localPath, 'utf8');
    } catch (error) {
      throw new Error(`Mock client: File not found: ${path}`);
    }
  }

  async listFiles(path: string = ''): Promise<GitHubFile[]> {
    // Fallback to local filesystem for development
    const fs = await import('fs/promises');
    const pathModule = await import('path');
    
    try {
      const localPath = pathModule.join(process.cwd(), 'public', 'kb-text', path);
      const entries = await fs.readdir(localPath, { withFileTypes: true });
      
      return entries.map(entry => ({
        name: entry.name,
        path: pathModule.join(path, entry.name),
        sha: 'mock-sha',
        size: 0,
        type: entry.isDirectory() ? 'dir' : 'file'
      }));
    } catch (error) {
      return [];
    }
  }
}
