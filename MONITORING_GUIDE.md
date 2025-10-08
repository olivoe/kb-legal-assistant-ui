# KB Monitoring Guide

## Overview

The KB system includes comprehensive health monitoring to ensure:
- Embeddings are up-to-date
- 100% coverage is maintained
- Issues are detected and alerted automatically

## Health Endpoint

### API: `/api/kb/health`

Returns real-time health status of the KB system.

**Example Request:**
```bash
curl https://ai.olivogalarza.com/api/kb/health | jq
```

**Example Response (Healthy):**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-08T20:00:00.000Z",
  "embeddings": {
    "total": 330,
    "lastUpdated": "2025-10-08T19:45:22.000Z",
    "fileSizeKB": 45678
  },
  "index": {
    "total": 330,
    "lastUpdated": "2025-10-08T19:45:22.000Z",
    "fileSizeKB": 123
  },
  "coverage": {
    "percentage": 100,
    "missing": 0,
    "status": "complete"
  },
  "issues": []
}
```

**Example Response (Degraded):**
```json
{
  "status": "degraded",
  "timestamp": "2025-10-08T20:00:00.000Z",
  "embeddings": {
    "total": 328,
    "lastUpdated": "2025-10-01T10:00:00.000Z",
    "fileSizeKB": 45000
  },
  "index": {
    "total": 330,
    "lastUpdated": "2025-10-08T19:00:00.000Z",
    "fileSizeKB": 123
  },
  "coverage": {
    "percentage": 99.4,
    "missing": 2,
    "status": "partial"
  },
  "issues": [
    "2 documents missing embeddings (99.4% coverage)",
    "Embeddings not updated in 7 days"
  ]
}
```

### Status Levels

| Status | HTTP Code | Description |
|--------|-----------|-------------|
| `healthy` | 200 | All systems operational, 100% coverage |
| `degraded` | 200 | Minor issues, 90-99% coverage, or stale data |
| `unhealthy` | 503 | Critical issues, <90% coverage, or missing files |

## Monitoring Script

### Local Health Check

```bash
npm run kb:health
```

Output:
```
🏥 KB Health Monitor
====================
Checking: https://ai.olivogalarza.com/api/kb/health

Status: ✅ HEALTHY
Timestamp: 2025-10-08T20:00:00.000Z

📊 Embeddings:
   Total: 330
   Last Updated: 2025-10-08T19:45:22.000Z
   File Size: 45678 KB

📚 Index:
   Total Documents: 330
   Last Updated: 2025-10-08T19:45:22.000Z
   File Size: 123 KB

📈 Coverage:
   Percentage: 100%
   Missing: 0
   Status: complete

✅ All systems healthy!
```

### Continuous Monitoring

Watch for changes every 5 minutes:

```bash
npm run kb:health:watch
```

Or custom interval:

```bash
node scripts/monitor-kb-health.js --watch 10
```

## Automated Monitoring

### GitHub Actions

The system includes automated health checks via GitHub Actions:

**Workflow:** `.github/workflows/kb-health-check.yml`

**Triggers:**
- Every 6 hours (scheduled)
- After KB rebuild completes
- Manual trigger via GitHub UI

**View Status:**
```bash
gh run list --workflow=kb-health-check.yml --limit 5
```

**Trigger Manually:**
```bash
gh workflow run kb-health-check.yml
```

### Scheduled Checks

The health check runs automatically:
- **Every 6 hours** - Ensures continuous monitoring
- **After KB builds** - Validates successful deployment
- **On-demand** - Via GitHub Actions UI or CLI

## Alerting

### Configure Webhook Alerts

Add a webhook URL to receive alerts for degraded/unhealthy status.

#### Slack Webhook

1. Create incoming webhook: https://api.slack.com/messaging/webhooks
2. Add to GitHub secrets:
   ```bash
   gh secret set ALERT_WEBHOOK_URL -b"https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
   ```

#### Discord Webhook

1. Server Settings → Integrations → Webhooks → New Webhook
2. Copy webhook URL
3. Add to GitHub secrets:
   ```bash
   gh secret set ALERT_WEBHOOK_URL -b"https://discord.com/api/webhooks/YOUR/WEBHOOK/URL"
   ```

#### Local Testing

```bash
export ALERT_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
npm run kb:health
```

### Alert Conditions

Alerts are sent when:
- **Critical (unhealthy):**
  - Coverage < 90%
  - Embeddings file missing
  - Index file missing
  - Health check fails
  
- **Warning (degraded):**
  - Coverage 90-99%
  - Data not updated in 7+ days

### Alert Message Format

```
🔴 KB Health Alert: CRITICAL

Status: unhealthy
Coverage: 85%
Missing: 50 documents

Issues:
  - Low coverage: 85.0% (50 missing)
  - Embeddings not updated in 10 days

Time: 2025-10-08T20:00:00.000Z
Site: https://ai.olivogalarza.com
```

## Monitoring Dashboard

### Quick Status Check

```bash
# Check health
curl -s https://ai.olivogalarza.com/api/kb/health | jq '.status'

# Check coverage
curl -s https://ai.olivogalarza.com/api/kb/health | jq '.coverage.percentage'

# List issues
curl -s https://ai.olivogalarza.com/api/kb/health | jq '.issues[]'
```

### Integration with Monitoring Tools

#### Uptime Robot / Pingdom

- **URL:** `https://ai.olivogalarza.com/api/kb/health`
- **Method:** GET
- **Success:** HTTP 200
- **Failure:** HTTP 503
- **Check Interval:** 5-15 minutes

#### Datadog / New Relic

```bash
# Synthetic monitoring
curl -f https://ai.olivogalarza.com/api/kb/health || exit 1
```

#### Prometheus

```yaml
- job_name: 'kb-health'
  metrics_path: '/api/kb/health'
  static_configs:
    - targets: ['ai.olivogalarza.com']
```

## Troubleshooting

### Health Check Fails

```bash
# 1. Check if site is accessible
curl -I https://ai.olivogalarza.com

# 2. Check health endpoint
curl -v https://ai.olivogalarza.com/api/kb/health

# 3. Check local files
ls -lh public/embeddings.json public/kb_index.json

# 4. Verify embeddings
npm run kb:check
```

### Coverage Issues

```bash
# 1. Check coverage locally
npm run kb:check

# 2. Rebuild KB
npm run build-kb

# 3. Check GitHub Actions
gh run list --workflow=kb-build.yml --limit 1
gh run view <RUN_ID> --log
```

### Stale Data

```bash
# 1. Check last update time
stat -f "%Sm" public/embeddings.json

# 2. Trigger rebuild
gh workflow run kb-build.yml

# 3. Check webhook
cd /path/to/kb-legal-documents
echo "test" >> README.md
git add README.md
git commit -m "Trigger rebuild"
git push origin main
```

## Best Practices

1. **Monitor Regularly**
   - Set up automated health checks every 6 hours
   - Configure webhook alerts for immediate notification

2. **Review Logs**
   - Check GitHub Actions logs weekly
   - Look for patterns in failures

3. **Maintain Coverage**
   - Keep 100% coverage at all times
   - Generate `.txt` sidecars for all PDFs

4. **Update Regularly**
   - Rebuild KB when documents change
   - Keep embeddings fresh (< 7 days old)

5. **Test Alerts**
   - Verify webhook alerts work
   - Test with manual health check

## Monitoring Checklist

- [ ] Health endpoint accessible
- [ ] GitHub Actions health check enabled
- [ ] Webhook alerts configured
- [ ] Coverage at 100%
- [ ] Embeddings updated within 7 days
- [ ] No critical issues reported
- [ ] Automated rebuild working
- [ ] Webhook triggers functioning

## Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run kb:health` | Run health check once |
| `npm run kb:health:watch` | Continuous monitoring (5 min) |
| `npm run kb:check` | Verify embedding coverage |
| `npm run build-kb` | Rebuild KB from GitHub |

## API Reference

### GET /api/kb/health

Returns KB health status.

**Response Fields:**
- `status` - Overall health: healthy, degraded, unhealthy
- `timestamp` - ISO 8601 timestamp
- `embeddings.total` - Number of embedded chunks
- `embeddings.lastUpdated` - Last update time
- `embeddings.fileSizeKB` - File size in KB
- `index.total` - Total documents in index
- `index.lastUpdated` - Last update time
- `index.fileSizeKB` - File size in KB
- `coverage.percentage` - Coverage percentage (0-100)
- `coverage.missing` - Number of missing embeddings
- `coverage.status` - complete, partial, unknown
- `issues` - Array of issue descriptions

**Status Codes:**
- `200` - Healthy or degraded
- `503` - Unhealthy

## Support

For issues or questions:
1. Check GitHub Actions logs
2. Run local health check
3. Review this guide
4. Check webhook configuration
