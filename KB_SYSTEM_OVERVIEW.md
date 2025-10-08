# Knowledge Base System - Complete Overview

## System Architecture

The KB system is a fully automated pipeline that:
1. Fetches documents from GitHub
2. Extracts text (with multi-method fallback)
3. Generates embeddings
4. Enforces 100% coverage
5. Auto-deploys to production
6. Monitors health continuously

```
┌─────────────────────────────────────────────────────────────────┐
│                    KB Legal Documents Repo                       │
│                  (olivoe/kb-legal-documents)                     │
│                                                                   │
│  • 330 PDF documents                                             │
│  • .txt sidecars (optional, preferred)                           │
│  • Organized in subdirectories                                   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Push triggers webhook
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│              GitHub Actions: KB Build Workflow                   │
│            (kb-legal-assistant-ui/.github/workflows)             │
│                                                                   │
│  1. Fetch all files from GitHub (Git Trees API)                 │
│  2. Extract text:                                                │
│     • Try .txt sidecar first                                     │
│     • Fallback: pdfjs → pdftotext → OCR                         │
│  3. Chunk documents (1000 chars, 200 overlap)                   │
│  4. Generate embeddings (OpenAI text-embedding-3-small)         │
│  5. Enforce 100% coverage check                                  │
│  6. Commit embeddings.json + kb_index.json                      │
│  7. Trigger Vercel production deploy                             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Deploys to
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│                Production Site (Vercel)                          │
│                  ai.olivogalarza.com                             │
│                                                                   │
│  • Next.js app with RAG chat                                     │
│  • /api/kb/health - Health monitoring                            │
│  • /api/rag/search - Semantic search                             │
│  • /api/rag/stream - Streaming LLM responses                     │
│  • /kb - Document browser (330 docs)                             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Monitored by
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│            GitHub Actions: Health Check Workflow                 │
│                                                                   │
│  • Runs every 6 hours                                            │
│  • Checks coverage, staleness, file integrity                    │
│  • Sends alerts to Slack/Discord on issues                       │
│  • Fails CI if unhealthy                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Document Repository
**Location:** `olivoe/kb-legal-documents` (public)

**Contents:**
- 330 legal documents (PDFs)
- Optional `.txt` sidecars for better text quality
- Organized in subdirectories (e.g., `Materiales Extranjeria/`)

**Webhook:**
- Triggers KB rebuild on any push to main
- Monitors: `**.pdf`, `**.txt`, `**.md`, `**.html`

### 2. Build Pipeline
**Location:** `olivoe/kb-legal-assistant-ui`

**Scripts:**
- `scripts/build-kb-from-github.js` - Main pipeline
- `scripts/pdf-extractor.js` - Multi-method PDF extraction
- `scripts/generate-pdf-sidecars.js` - Sidecar generator
- `scripts/check-embedding-coverage.js` - Coverage enforcer

**Workflow:** `.github/workflows/kb-build.yml`
- Trigger: Push, repository_dispatch, schedule (daily 6am)
- Duration: ~3-5 minutes for 330 documents
- Output: `embeddings.json` (330 items), `kb_index.json` (330 paths)

### 3. Production Site
**URL:** https://ai.olivogalarza.com

**Pages:**
- `/` - Main chat interface
- `/kb` - Document browser with coverage badge
- `/rag` - RAG chat interface

**API Endpoints:**
- `/api/kb/health` - Health status
- `/api/kb/documents` - Document list
- `/api/rag/search` - Semantic search
- `/api/rag/answer` - LLM answers
- `/api/rag/stream` - Streaming responses

### 4. Monitoring
**Health Checks:**
- Endpoint: `/api/kb/health`
- Metrics: Coverage, staleness, file integrity
- Status: healthy (100%), degraded (90-99%), unhealthy (<90%)

**Automated Monitoring:**
- GitHub Action runs every 6 hours
- Webhook alerts to Slack/Discord
- Fails CI on critical issues

**Local Monitoring:**
```bash
npm run kb:health          # One-time check
npm run kb:health:watch    # Continuous (5 min)
```

## Features

### ✅ Completed Features

1. **Automated CI/CD Pipeline**
   - Fetch from GitHub on every push
   - Multi-method text extraction
   - Embedding generation with retries
   - 100% coverage enforcement
   - Auto-deploy to Vercel production

2. **Multi-Method PDF Extraction**
   - Priority 1: `.txt` sidecar (instant, best quality)
   - Priority 2: pdfjs-dist (fast, pure JS)
   - Priority 3: pdftotext (better layout)
   - Priority 4: OCR (ghostscript + tesseract)

3. **Webhook Integration**
   - KB repo → triggers UI rebuild
   - Automatic on document changes
   - No manual intervention needed

4. **Health Monitoring**
   - Real-time health endpoint
   - Scheduled checks (every 6 hours)
   - Webhook alerts (Slack/Discord)
   - Coverage and staleness tracking

5. **Document Browser**
   - Lists all 330 documents
   - Shows embedded vs. total count
   - Filter: "Only show embedded"
   - Real-time updates

## Usage

### For End Users

**Chat with the KB:**
1. Go to https://ai.olivogalarza.com
2. Ask questions in natural language
3. System searches 330 documents and provides answers

**Browse Documents:**
1. Go to https://ai.olivogalarza.com/kb
2. View all 330 documents
3. Filter by embedded status

### For Administrators

**Add New Documents:**
```bash
cd /path/to/kb-legal-documents
# Add PDFs to appropriate directory
git add *.pdf
git commit -m "Add new documents"
git push origin main
# Webhook triggers rebuild automatically
```

**Generate Sidecars:**
```bash
cd /path/to/kb-legal-assistant-ui
npm run kb:sidecars:test      # Test with 5 PDFs
npm run kb:sidecars           # Generate all
rsync -av tmp/kb-sidecars/ /path/to/kb-legal-documents/
cd /path/to/kb-legal-documents
git add *.txt
git commit -m "Add sidecars"
git push origin main
```

**Monitor Health:**
```bash
npm run kb:health             # Check once
npm run kb:health:watch       # Continuous
curl https://ai.olivogalarza.com/api/kb/health | jq
```

**Manual Rebuild:**
```bash
gh workflow run kb-build.yml
```

**Check Coverage:**
```bash
npm run kb:check
```

## Configuration

### Environment Variables

**Required:**
- `OPENAI_API_KEY` - OpenAI API key for embeddings
- `GITHUB_TOKEN` or `KB_REPO_TOKEN` - GitHub PAT (if repo is private)

**Optional:**
- `GITHUB_OWNER` or `KB_REPO_OWNER` - Default: olivoe
- `GITHUB_REPO` or `KB_REPO_NAME` - Default: kb-legal-documents
- `OPENAI_EMBED_MODEL` - Default: text-embedding-3-small
- `VERCEL_PROD_DEPLOY_HOOK_URL` - For auto-promotion
- `ALERT_WEBHOOK_URL` - Slack/Discord webhook for alerts

### GitHub Secrets

**In `kb-legal-assistant-ui`:**
- `OPENAI_API_KEY` - OpenAI API key
- `KB_REPO_TOKEN` - GitHub PAT (if KB repo is private)
- `VERCEL_PROD_DEPLOY_HOOK_URL` - Vercel deploy hook
- `ALERT_WEBHOOK_URL` - Optional: webhook for health alerts

**In `kb-legal-documents`:**
- `UI_REPO_DISPATCH_TOKEN` - GitHub PAT with Actions: Read+Write for UI repo

## Workflows

### Workflow 1: Add New Documents

```
1. Add PDFs to kb-legal-documents
   ↓
2. Commit and push
   ↓
3. Webhook triggers kb-build workflow
   ↓
4. Fetch, extract, embed, check coverage
   ↓
5. Commit embeddings.json + kb_index.json
   ↓
6. Trigger Vercel deploy
   ↓
7. Site updates automatically
```

### Workflow 2: Generate Sidecars

```
1. Run npm run kb:sidecars
   ↓
2. Review generated .txt files
   ↓
3. Copy to kb-legal-documents repo
   ↓
4. Commit and push
   ↓
5. Webhook triggers rebuild
   ↓
6. Build uses sidecars (faster, better quality)
```

### Workflow 3: Monitor Health

```
1. GitHub Action runs every 6 hours
   ↓
2. Calls /api/kb/health
   ↓
3. Checks coverage, staleness, integrity
   ↓
4. If unhealthy: send webhook alert
   ↓
5. Administrator investigates and fixes
```

## Maintenance

### Daily
- ✅ Automated: Health checks run every 6 hours
- ✅ Automated: Rebuild on document changes

### Weekly
- Review GitHub Actions logs
- Check for failed builds or health checks
- Verify coverage remains at 100%

### Monthly
- Review and update sidecars for modified PDFs
- Check for outdated embeddings (>30 days)
- Update dependencies if needed

### As Needed
- Add new documents → automatic rebuild
- Fix failed extractions → generate sidecars
- Respond to health alerts → investigate and fix

## Troubleshooting

### Build Fails
```bash
# Check logs
gh run list --workflow=kb-build.yml --limit 1
gh run view <RUN_ID> --log

# Common causes:
# - OpenAI API rate limit → retries will handle
# - PDF extraction failure → generate sidecar
# - Coverage check fails → investigate missing docs
```

### Low Coverage
```bash
# Check which docs are missing
npm run kb:check

# Generate sidecars for failed PDFs
npm run kb:sidecars

# Or manually create .txt for problematic PDFs
```

### Health Check Fails
```bash
# Check health locally
npm run kb:health

# Check production
curl https://ai.olivogalarza.com/api/kb/health | jq

# Trigger rebuild if needed
gh workflow run kb-build.yml
```

## Performance

### Build Times
- **330 documents:** ~3-5 minutes
- **Per document:** ~0.5-1 second
- **Embedding generation:** ~2-3 minutes (with retries)

### File Sizes
- `embeddings.json`: ~45 MB (330 docs, 1042 chunks)
- `kb_index.json`: ~123 KB (330 paths)
- Total KB size: ~200 MB (PDFs in GitHub)

### API Response Times
- `/api/kb/health`: <100ms
- `/api/rag/search`: 200-500ms
- `/api/rag/answer`: 2-5s (LLM generation)

## Security

- GitHub repos: Public (kb-legal-documents) and private (kb-legal-assistant-ui)
- API keys: Stored as GitHub secrets
- Tokens: Fine-grained PATs with minimal scopes
- Webhooks: Verified signatures (if configured)
- Vercel: Environment variables for production

## Documentation

- `README.md` - Project overview
- `WEBHOOK_SETUP.md` - Webhook configuration guide
- `PDF_SIDECAR_GUIDE.md` - Sidecar generation guide
- `MONITORING_GUIDE.md` - Health monitoring guide
- `KB_SYSTEM_OVERVIEW.md` - This document

## Quick Reference

### NPM Scripts
```bash
npm run build-kb           # Build KB from GitHub
npm run kb:check           # Check coverage
npm run kb:sidecars        # Generate all sidecars
npm run kb:sidecars:test   # Test with 5 PDFs
npm run kb:sidecars:check  # Check available methods
npm run kb:health          # Health check
npm run kb:health:watch    # Continuous monitoring
```

### GitHub CLI
```bash
gh workflow run kb-build.yml                    # Trigger rebuild
gh workflow run kb-health-check.yml             # Trigger health check
gh run list --workflow=kb-build.yml --limit 5   # List recent builds
gh run view <RUN_ID> --log                      # View logs
gh secret list                                  # List secrets
```

### API Endpoints
```bash
curl https://ai.olivogalarza.com/api/kb/health
curl https://ai.olivogalarza.com/api/kb/documents
curl -X POST https://ai.olivogalarza.com/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query":"residencia por arraigo"}'
```

## Status

✅ **Production Ready**

All features implemented and tested:
- ✅ Automated CI/CD pipeline
- ✅ Multi-method PDF extraction
- ✅ 100% embedding coverage
- ✅ Webhook integration
- ✅ Health monitoring
- ✅ Auto-deployment
- ✅ Comprehensive documentation

**Current Stats:**
- Documents: 330
- Embeddings: 330 (100% coverage)
- Build time: ~3-5 minutes
- Uptime: Monitored every 6 hours
- Last updated: 2025-10-08

## Next Steps (Optional Enhancements)

1. **Advanced Monitoring**
   - Grafana dashboard
   - Prometheus metrics
   - Custom alerting rules

2. **Performance Optimization**
   - Cache embeddings for unchanged docs
   - Parallel processing
   - Incremental updates

3. **Enhanced Search**
   - Hybrid search (semantic + keyword)
   - Re-ranking
   - Query expansion

4. **User Features**
   - Document annotations
   - Favorite documents
   - Search history

---

**System Status:** 🟢 Operational
**Last Updated:** 2025-10-08
**Maintained by:** AI Agent + User
