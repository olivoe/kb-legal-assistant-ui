# Vercel Postgres Setup Guide

This guide explains how to set up Vercel Postgres for persistent admin logging.

## Overview

The admin logging system now uses **Vercel Postgres** instead of file-based storage, providing:
- ✅ Persistent storage that survives deployments
- ✅ Efficient querying and aggregation
- ✅ Scalable and reliable infrastructure
- ✅ Automatic backups (on paid plans)

---

## Setup Steps

### 1. Create Postgres Database in Vercel

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to **Storage** tab
3. Click **Create Database**
4. Select **Postgres**
5. Choose your database name (e.g., `kb-chat-logs`)
6. Select a region (closest to your deployment region)
7. Click **Create**

### 2. Connect Database to Your Project

1. In the Vercel Storage dashboard, click on your new Postgres database
2. Go to the **Settings** tab
3. Under **Projects**, click **Connect Project**
4. Select your `kb-legal-assistant-ui` project
5. Click **Connect**

Vercel will automatically add the following environment variables to your project:
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NO_SSL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

### 3. Initialize the Database Schema

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to your Postgres database in Vercel Dashboard
2. Click on the **Query** tab
3. Copy and paste the contents of `/lib/db/schema.sql`
4. Click **Execute**

#### Option B: Via Command Line

```bash
# Make sure you have POSTGRES_URL in your .env.local
node scripts/init-db.js
```

### 4. Set Up Local Development (Optional)

If you want to test locally with Postgres:

1. Get your database credentials from Vercel Dashboard:
   - Go to Storage > Your Postgres DB > `.env.local` tab
   - Copy all the `POSTGRES_*` variables

2. Add them to your local `.env.local`:
   ```env
   POSTGRES_URL=postgres://username:password@host:5432/database
   POSTGRES_PRISMA_URL=postgres://username:password@host:5432/database?pgbouncer=true&connect_timeout=15
   # ... other variables
   ```

3. Initialize the local database:
   ```bash
   node scripts/init-db.js
   ```

---

## Verification

To verify the setup is working:

1. **Check Database Connection**:
   - Go to Vercel Dashboard > Storage > Your Postgres DB > Query tab
   - Run: `SELECT COUNT(*) FROM chat_sessions;`
   - Should return `0` if no logs yet

2. **Test Logging**:
   - Visit `https://ai.olivogalarza.com`
   - Ask a question in the chat
   - Go to `https://ai.olivogalarza.com/admin`
   - Login with your `ADMIN_PASSWORD`
   - You should see the logged session

3. **Check Locally** (if set up):
   ```bash
   npm run dev
   # Visit http://localhost:3000
   # Ask a question
   # Visit http://localhost:3000/admin
   # Check logs appear
   ```

---

## Database Schema

The `chat_sessions` table stores:

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `session_id` | VARCHAR | Session identifier |
| `timestamp` | TIMESTAMPTZ | When the interaction occurred |
| `question` | TEXT | User's question |
| `answer` | TEXT | AI's response |
| `conversation_history` | JSONB | Previous exchanges |
| `top_k` | INTEGER | Number of KB results retrieved |
| `min_score` | DECIMAL | Minimum similarity score |
| `kb_only` | BOOLEAN | Whether web fallback was disabled |
| `route` | VARCHAR | KB_ONLY, KB_WEB, OUT_OF_DOMAIN |
| `top_scores` | JSONB | Array of similarity scores |
| `top_score` | DECIMAL | Highest similarity score |
| `response_time_ms` | INTEGER | Response latency |
| `model` | VARCHAR | LLM model used |
| `rewritten_query` | TEXT | Query after rewriting |
| `in_domain` | BOOLEAN | Whether query was in-domain |
| `sources` | JSONB | Source documents used |
| `request_id` | VARCHAR | Request tracking ID |
| `user_agent` | TEXT | Browser/client info |
| `ip_hash` | VARCHAR | Hashed IP (privacy) |
| `created_at` | TIMESTAMPTZ | Record creation time |

**Indexes** are created for efficient querying on:
- `session_id`
- `timestamp`
- `route`
- `in_domain`
- `created_at`

---

## Maintenance

### View Database Size

```sql
SELECT pg_size_pretty(pg_total_relation_size('chat_sessions')) as size;
```

### Clean Up Old Logs (90+ days)

```sql
DELETE FROM chat_sessions WHERE timestamp < NOW() - INTERVAL '90 days';
```

Or use the maintenance function:
```javascript
import { cleanupOldLogs } from '@/lib/logging/session-logger-pg';
await cleanupOldLogs(90); // Keep last 90 days
```

### Export Logs

```sql
COPY (SELECT * FROM chat_sessions WHERE timestamp >= NOW() - INTERVAL '30 days') 
TO '/tmp/logs.csv' CSV HEADER;
```

---

## Troubleshooting

### "Failed to log chat session to Postgres"

**Cause**: Database connection issue or missing environment variables.

**Solution**:
1. Check that `POSTGRES_URL` is set in Vercel environment variables
2. Verify the database is connected to your project
3. Check Vercel logs for detailed error messages

### "Table does not exist"

**Cause**: Database schema not initialized.

**Solution**:
Run the initialization script:
```bash
node scripts/init-db.js
```

### "Permission denied for table chat_sessions"

**Cause**: Database user doesn't have proper permissions.

**Solution**:
Grant permissions (as database owner):
```sql
GRANT ALL PRIVILEGES ON TABLE chat_sessions TO your_postgres_user;
GRANT USAGE, SELECT ON SEQUENCE chat_sessions_id_seq TO your_postgres_user;
```

---

## Migration from File-Based Logging

If you had previous logs in `data/logs/chat-sessions.jsonl`, you can migrate them:

```javascript
// scripts/migrate-logs-to-postgres.js
const { logChatSession } = require('./lib/logging/session-logger-pg');
const fs = require('fs').promises;

async function migrate() {
  const content = await fs.readFile('data/logs/chat-sessions.jsonl', 'utf-8');
  const lines = content.trim().split('\n');
  
  for (const line of lines) {
    const entry = JSON.parse(line);
    await logChatSession(entry);
  }
  
  console.log(`Migrated ${lines.length} logs to Postgres`);
}

migrate();
```

---

## Cost Considerations

**Vercel Postgres Free Tier**:
- 256 MB storage
- ~10,000-50,000 log entries (depending on data size)
- Good for moderate traffic

**Pro Plan**:
- 1 GB storage
- ~50,000-200,000 log entries
- Automatic backups

**Monitor Usage**:
Check your database size regularly:
```sql
SELECT 
  pg_size_pretty(pg_database_size(current_database())) as db_size,
  COUNT(*) as total_logs
FROM chat_sessions;
```

---

## Security Notes

- ✅ IP addresses are **hashed** before storage (SHA-256)
- ✅ Database credentials are stored as **encrypted environment variables**
- ✅ Admin dashboard requires **password authentication**
- ✅ Database connections use **SSL/TLS** by default
- ⚠️ Consider implementing **user consent** for logging in production
- ⚠️ Comply with **GDPR/privacy regulations** for EU users

---

## Further Reading

- [Vercel Postgres Documentation](https://vercel.com/docs/storage/vercel-postgres)
- [Vercel Postgres SDK Reference](https://vercel.com/docs/storage/vercel-postgres/sdk)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)

