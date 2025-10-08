#!/bin/bash
# Setup webhook in kb-legal-documents to trigger KB rebuilds
# This script helps automate the webhook setup process

set -e

echo "🔧 KB Webhook Setup Helper"
echo "============================"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Install it with: brew install gh"
    exit 1
fi

# Check if logged in
if ! gh auth status &> /dev/null; then
    echo "❌ Not logged in to GitHub CLI."
    echo "Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI is installed and authenticated"
echo ""

# Get the PAT token
echo "📝 Step 1: Generate a Personal Access Token"
echo "-------------------------------------------"
echo "1. Open: https://github.com/settings/tokens?type=beta"
echo "2. Click 'Generate new token'"
echo "3. Configure:"
echo "   - Token name: kb-webhook-trigger"
echo "   - Repository access: Only select repositories → kb-legal-assistant-ui"
echo "   - Permissions → Actions: Read and write"
echo "4. Generate and copy the token"
echo ""
read -p "Paste your PAT token here: " PAT_TOKEN

if [ -z "$PAT_TOKEN" ]; then
    echo "❌ No token provided. Exiting."
    exit 1
fi

echo ""
echo "📝 Step 2: Add secret to kb-legal-documents"
echo "--------------------------------------------"
echo -n "$PAT_TOKEN" | gh secret set UI_REPO_DISPATCH_TOKEN -R olivoe/kb-legal-documents -b-
echo "✅ Secret UI_REPO_DISPATCH_TOKEN added to olivoe/kb-legal-documents"
echo ""

# Verify secret was added
echo "📝 Step 3: Verify secret"
echo "------------------------"
gh secret list -R olivoe/kb-legal-documents | grep UI_REPO_DISPATCH_TOKEN && echo "✅ Secret verified" || echo "⚠️  Secret not found"
echo ""

echo "📝 Step 4: Create workflow file in kb-legal-documents"
echo "------------------------------------------------------"
echo "You need to add the workflow file to kb-legal-documents repo."
echo ""
echo "Option A: Manual (recommended if you have local clone)"
echo "  1. cd /path/to/kb-legal-documents"
echo "  2. mkdir -p .github/workflows"
echo "  3. Copy the workflow file:"
echo ""
cat << 'WORKFLOW_EOF'
cat > .github/workflows/trigger-ui-rebuild.yml << 'EOF'
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
EOF
WORKFLOW_EOF
echo ""
echo "  4. git add .github/workflows/trigger-ui-rebuild.yml"
echo "  5. git commit -m 'Add webhook to trigger UI KB rebuild'"
echo "  6. git push origin main"
echo ""
echo "Option B: Using GitHub web interface"
echo "  1. Go to: https://github.com/olivoe/kb-legal-documents"
echo "  2. Click 'Add file' → 'Create new file'"
echo "  3. Name: .github/workflows/trigger-ui-rebuild.yml"
echo "  4. Paste the workflow content shown above"
echo "  5. Commit directly to main"
echo ""

read -p "Press Enter when you've added the workflow file..."

echo ""
echo "📝 Step 5: Test the webhook"
echo "---------------------------"
echo "Make a test change to kb-legal-documents to trigger the webhook:"
echo ""
echo "  cd /path/to/kb-legal-documents"
echo "  echo '# Test webhook' >> README.md"
echo "  git add README.md"
echo "  git commit -m 'Test webhook trigger'"
echo "  git push origin main"
echo ""
echo "Then verify:"
echo "  1. Check kb-legal-documents actions: https://github.com/olivoe/kb-legal-documents/actions"
echo "  2. Check kb-legal-assistant-ui actions: https://github.com/olivoe/kb-legal-assistant-ui/actions"
echo ""
echo "✅ Setup complete! See WEBHOOK_SETUP.md for detailed documentation."
