# KB Auto-Rebuild Webhook Setup

This guide shows how to configure `kb-legal-documents` to automatically trigger a rebuild in `kb-legal-assistant-ui` whenever KB files are updated.

## Overview

When you push changes to `kb-legal-documents`, a webhook will:
1. Trigger the `kb-build.yml` workflow in `kb-legal-assistant-ui`
2. Fetch updated files from GitHub
3. Regenerate embeddings
4. Enforce 100% coverage
5. Auto-deploy to Vercel production

## Setup Steps

### 1. Generate a Personal Access Token (PAT)

Create a fine-grained PAT with workflow trigger permissions:

1. Go to: https://github.com/settings/tokens?type=beta
2. Click **"Generate new token"**
3. Configure:
   - **Token name**: `kb-webhook-trigger`
   - **Expiration**: 90 days (or custom)
   - **Repository access**: "Only select repositories" → select `olivoe/kb-legal-assistant-ui`
   - **Permissions** → Repository permissions:
     - **Actions**: Read and write ✅
4. Click **"Generate token"** and **copy the token** (you'll only see it once)

### 2. Add the token as a secret in kb-legal-documents

1. Go to: https://github.com/olivoe/kb-legal-documents/settings/secrets/actions
2. Click **"New repository secret"**
3. Configure:
   - **Name**: `UI_REPO_DISPATCH_TOKEN`
   - **Secret**: paste the token from step 1
4. Click **"Add secret"**

### 3. Create the workflow file in kb-legal-documents

1. In your local clone of `kb-legal-documents`, create the directory:
   ```bash
   cd /path/to/kb-legal-documents
   mkdir -p .github/workflows
   ```

2. Create the file `.github/workflows/trigger-ui-rebuild.yml` with this content:

```yaml
name: Trigger UI KB Rebuild

on:
  push:
    branches:
      - main
    paths:
      - '**.pdf'
      - '**.txt'
      - '**.md'
      - '**.html'

jobs:
  trigger-rebuild:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger repository dispatch
        run: |
          curl -X POST \
            -H "Accept: application/vnd.github+json" \
            -H "Authorization: Bearer ${{ secrets.UI_REPO_DISPATCH_TOKEN }}" \
            -H "X-GitHub-Api-Version: 2022-11-28" \
            https://api.github.com/repos/olivoe/kb-legal-assistant-ui/dispatches \
            -d '{"event_type":"kb-updated","client_payload":{"repository":"${{ github.repository }}","ref":"${{ github.ref }}","sha":"${{ github.sha }}"}}'
      
      - name: Log trigger
        run: |
          echo "✅ Triggered KB rebuild in kb-legal-assistant-ui"
          echo "Repository: ${{ github.repository }}"
          echo "Ref: ${{ github.ref }}"
          echo "SHA: ${{ github.sha }}"
```

3. Commit and push:
   ```bash
   git add .github/workflows/trigger-ui-rebuild.yml
   git commit -m "Add webhook to trigger UI KB rebuild on file changes"
   git push origin main
   ```

### 4. Test the webhook

1. Make a small change to any file in `kb-legal-documents`:
   ```bash
   cd /path/to/kb-legal-documents
   echo "# Test update" >> README.md
   git add README.md
   git commit -m "Test webhook trigger"
   git push origin main
   ```

2. Verify the webhook fired:
   - Go to: https://github.com/olivoe/kb-legal-documents/actions
   - You should see a "Trigger UI KB Rebuild" workflow run

3. Verify the UI rebuild was triggered:
   - Go to: https://github.com/olivoe/kb-legal-assistant-ui/actions
   - You should see a new "Rebuild KB and Enforce Embedding Coverage" workflow run
   - Check that it was triggered by `repository_dispatch`

## Alternative: Using GitHub CLI

If you prefer command-line setup:

```bash
# 1. Create and set the secret (requires gh CLI logged in)
gh auth login
cd /path/to/kb-legal-documents
echo -n "YOUR_PAT_TOKEN_HERE" | gh secret set UI_REPO_DISPATCH_TOKEN -b-

# 2. Create the workflow file
mkdir -p .github/workflows
cat > .github/workflows/trigger-ui-rebuild.yml << 'EOF'
[paste the YAML content from step 3 above]
EOF

# 3. Commit and push
git add .github/workflows/trigger-ui-rebuild.yml
git commit -m "Add webhook to trigger UI KB rebuild"
git push origin main
```

## Troubleshooting

### Webhook doesn't trigger

1. **Check the secret exists:**
   ```bash
   gh secret list -R olivoe/kb-legal-documents
   ```
   Should show `UI_REPO_DISPATCH_TOKEN`

2. **Check PAT permissions:**
   - Go to: https://github.com/settings/tokens
   - Verify the token has `Actions: Read and write` for `kb-legal-assistant-ui`

3. **Check workflow logs:**
   - Go to: https://github.com/olivoe/kb-legal-documents/actions
   - Click on the latest "Trigger UI KB Rebuild" run
   - Check for errors in the curl command

### UI rebuild doesn't start

1. **Verify repository_dispatch is configured:**
   - Check `.github/workflows/kb-build.yml` in `kb-legal-assistant-ui`
   - Should have:
     ```yaml
     on:
       repository_dispatch:
         types: [kb-updated]
     ```

2. **Check Actions are enabled:**
   - Go to: https://github.com/olivoe/kb-legal-assistant-ui/settings/actions
   - Ensure "Allow all actions and reusable workflows" is selected

## What happens automatically

Once configured, every time you:
- Add a new PDF to `kb-legal-documents`
- Update a `.txt` sidecar
- Modify any KB document

The system will:
1. ✅ Trigger the webhook in `kb-legal-documents`
2. ✅ Start the KB rebuild in `kb-legal-assistant-ui`
3. ✅ Fetch all files from GitHub
4. ✅ Extract text and generate embeddings
5. ✅ Enforce 100% coverage
6. ✅ Commit updated embeddings
7. ✅ Deploy to Vercel production
8. ✅ Update `ai.olivogalarza.com` automatically

**No manual intervention required!** 🚀
