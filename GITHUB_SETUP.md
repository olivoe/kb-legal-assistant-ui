# 🚀 GitHub Integration Setup Guide

This guide will help you migrate your Knowledge Base from local files to GitHub storage.

## ✅ What's Been Implemented

The following GitHub integration code has been created:

### 📁 New Files Created:
- `lib/github/client.ts` - GitHub API client
- `lib/github/loader.ts` - File loading functions
- `app/lib/similarity-github.ts` - GitHub-based similarity search
- `app/api/kb/documents-github/route.ts` - GitHub documents API
- `app/api/github/webhook/route.ts` - Webhook handler for updates
- `scripts/migrate-to-github.js` - Migration helper script
- `env.template` - Environment configuration template

## 🛠️ Setup Steps

### Step 1: Install Dependencies

```bash
npm install @octokit/rest
```

### Step 2: Create GitHub Repository

1. **Go to GitHub**: https://github.com/new
2. **Repository name**: `kb-legal-documents`
3. **Description**: `Legal documents knowledge base for immigration law`
4. **Visibility**: Private (recommended for legal documents)
5. **Initialize**: Check "Add a README file"
6. **Create repository**

### Step 3: Create GitHub Personal Access Token

1. **Go to**: https://github.com/settings/tokens
2. **Click**: "Generate new token (classic)"
3. **Note**: "KB Legal Assistant"
4. **Expiration**: Choose appropriate duration
5. **Scopes**: Select `repo` (for private repos) or `public_repo` (for public repos)
6. **Generate token** and copy it immediately

### Step 4: Configure Environment Variables

1. **Copy template**: `cp env.template .env.local`
2. **Edit `.env.local`**:

```bash
# GitHub Integration
GITHUB_TOKEN=ghp_your_token_here
GITHUB_OWNER=your-github-username
GITHUB_REPO=kb-legal-documents

# Existing OpenAI configuration
OPENAI_API_KEY=your_existing_openai_key
```

### Step 5: Upload Files to GitHub

#### Option A: Using GitHub Web Interface
1. Go to your new repository
2. Click "uploading an existing file"
3. Drag and drop the entire `public/kb-text/` folder
4. Commit with message: "Initial knowledge base documents"

#### Option B: Using Git Command Line
```bash
# Clone your new repository
git clone https://github.com/your-username/kb-legal-documents.git
cd kb-legal-documents

# Copy files from your current project
cp -r /path/to/kb-legal-assistant-ui/public/kb-text/* .

# Commit and push
git add .
git commit -m "Initial knowledge base documents"
git push origin main
```

### Step 6: Update Your Application

#### Update the KB page to use GitHub API:
```typescript
// In app/kb/page.tsx, change the API endpoint:
const response = await fetch('/api/kb/documents-github'); // Instead of /api/kb/documents
```

#### Update similarity search to use GitHub:
```typescript
// In your search functions, import:
import { similaritySearchFromGitHub } from '@/app/lib/similarity-github';
```

### Step 7: Test the Integration

1. **Start your development server**: `npm run dev`
2. **Visit**: http://localhost:3000/kb
3. **Check**: Documents should load from GitHub
4. **Test search**: Try searching for content

## 📊 Current Knowledge Base Structure

Your current files (159 documents, ~500MB):

```
public/kb-text/
├── Materiales Extranjeria/
│   ├── Criterios de gestión/ (11 PDFs + TXT sidecars)
│   ├── FAQs/ (3 PDFs + TXT sidecars)
│   ├── Hojas informativas/ (75 PDFs + TXT sidecars)
│   ├── Instrucciones/ (11 PDFs + TXT sidecars)
│   ├── Modelos EX/ (26 PDFs + TXT sidecars)
│   ├── Normativa/ (21 PDFs + TXT sidecars)
│   └── ...
├── embeddings.json
├── kb_index.json
└── labels.json
```

## 🔧 Advanced Configuration

### GitHub Webhooks (Optional)

For automatic updates when documents change:

1. **Go to repository settings**: Settings → Webhooks
2. **Add webhook**: 
   - URL: `https://your-domain.com/api/github/webhook`
   - Content type: `application/json`
   - Events: `Pushes`
3. **Secret**: Generate a random string and add to `.env.local`:
   ```bash
   GITHUB_WEBHOOK_SECRET=your_random_secret_here
   ```

### Git LFS for Large Files

If you have large PDF files (>100MB):

```bash
# Install Git LFS
git lfs install

# Track large files
git lfs track "*.pdf"
git add .gitattributes
git commit -m "Add Git LFS tracking for PDFs"
```

## 🚨 Troubleshooting

### Common Issues:

1. **"Unauthorized" errors**: Check your GitHub token permissions
2. **"Repository not found"**: Verify GITHUB_OWNER and GITHUB_REPO
3. **"File not found"**: Ensure files are uploaded to GitHub
4. **Rate limiting**: GitHub API has 5,000 requests/hour limit

### Debug Mode:

Add to `.env.local`:
```bash
DEBUG_GITHUB=true
```

## 📈 Benefits of GitHub Integration

✅ **Free storage**: 100GB per repository  
✅ **Version control**: Track document changes  
✅ **Collaboration**: Multiple people can manage documents  
✅ **Backup**: Automatic backups via GitHub  
✅ **Access control**: Granular permissions  
✅ **Webhooks**: Real-time updates  
✅ **API access**: 5,000 requests/hour  

## 🔄 Migration Checklist

- [ ] Install `@octokit/rest` dependency
- [ ] Create GitHub repository
- [ ] Generate personal access token
- [ ] Configure environment variables
- [ ] Upload files to GitHub
- [ ] Update application code
- [ ] Test integration
- [ ] Set up webhooks (optional)
- [ ] Update deployment configuration

## 📞 Support

If you encounter issues:
1. Check the console logs for error messages
2. Verify your GitHub token permissions
3. Ensure all environment variables are set
4. Test with the `/api/kb/documents-github` endpoint

The integration includes fallback to local files, so your application will continue working even if GitHub is unavailable.
