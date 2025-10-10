# Admin Logging & Monitoring System

## Overview

The Admin Logging & Monitoring system provides comprehensive tracking and analysis of all chat sessions in the AI Legal Assistant. This system helps monitor response quality, performance metrics, and user interactions.

## Features

### 📊 Dashboard Analytics
- **Session Statistics**: Total sessions, queries, and average response times
- **Route Distribution**: Visual breakdown of KB-only, web fallback, and out-of-domain queries
- **Activity Tracking**: 7-day activity chart showing query trends
- **Performance Metrics**: Response times and relevance scores

### 🔍 Detailed Log Inspection
- View complete question-answer pairs
- Inspect conversation history and context
- Examine source citations and snippets
- Review query rewriting and domain classification
- Analyze top similarity scores

### 🎯 Filtering & Search
- Filter by route type (KB_ONLY, WEB_FALLBACK, OUT_OF_DOMAIN)
- Filter by minimum relevance score
- Filter by date range
- Pagination support for large log volumes

### 🔐 Security
- Password-protected access
- IP address hashing for privacy
- Session-based tracking without PII

## Setup

### 1. Configure Admin Password

Add the admin password to your `.env.local` file:

```bash
ADMIN_PASSWORD=your_secure_password_here
```

**Important**: Use a strong, unique password for production environments.

### 2. Create Logs Directory

The logs directory will be created automatically when the first log is written. Alternatively, create it manually:

```bash
mkdir -p data/logs
```

### 3. Update .gitignore

The `data/logs/` directory is already excluded from version control to protect sensitive data.

## Accessing the Admin Dashboard

### Local Development
```
http://localhost:3000/admin
```

### Production
```
https://your-domain.com/admin
```

Enter your configured admin password to access the dashboard.

## API Endpoints

### GET /api/admin/logs

Retrieve chat logs with optional filtering.

**Authentication**: Bearer token (admin password)

**Query Parameters**:
- `limit`: Number of logs to return (default: 50)
- `offset`: Pagination offset (default: 0)
- `sessionId`: Filter by specific session
- `startDate`: Filter logs from this date (ISO format)
- `endDate`: Filter logs until this date (ISO format)
- `route`: Filter by route type (KB_ONLY, WEB_FALLBACK, OUT_OF_DOMAIN, KB_EMPTY)
- `minScore`: Filter by minimum relevance score (0-1)

**Example**:
```bash
curl -H "Authorization: Bearer your_admin_password" \
  "http://localhost:3000/api/admin/logs?limit=20&route=KB_ONLY&minScore=0.5"
```

### GET /api/admin/logs?action=stats

Retrieve aggregated statistics.

**Authentication**: Bearer token (admin password)

**Example**:
```bash
curl -H "Authorization: Bearer your_admin_password" \
  "http://localhost:3000/api/admin/logs?action=stats"
```

**Response**:
```json
{
  "totalSessions": 150,
  "totalQueries": 280,
  "avgResponseTime": 2500,
  "routeDistribution": {
    "KB_ONLY": 200,
    "WEB_FALLBACK": 50,
    "OUT_OF_DOMAIN": 30
  },
  "avgTopScore": 0.65,
  "recentActivity": [
    { "date": "2025-10-10", "count": 45 }
  ]
}
```

## Log Structure

Each log entry contains:

```typescript
{
  sessionId: string;           // Unique session identifier
  timestamp: string;           // ISO timestamp
  question: string;            // User's question
  answer: string;              // AI's response
  conversationHistory: [...];  // Previous messages in session
  metadata: {
    topK: number;             // Number of results retrieved
    minScore: number;          // Minimum similarity threshold
    kbOnly: boolean;           // KB-only mode flag
    route: string;             // Route taken (KB_ONLY, WEB_FALLBACK, etc.)
    topScores: number[];       // Similarity scores of top results
    topScore: number;          // Highest similarity score
    responseTimeMs: number;    // Response time in milliseconds
    model: string;             // LLM model used
    rewrittenQuery: string;    // Query after rewriting
    inDomain: boolean;         // Domain classification result
    sources: [...];            // Source citations
  };
  requestId: string;           // Request identifier
  userAgent: string;           // Browser user agent
  ipHash: string;              // Hashed IP (for privacy)
}
```

## Storage

### File Format
Logs are stored as JSONL (JSON Lines) in `data/logs/chat-sessions.jsonl`:
- One JSON object per line
- Append-only for performance
- Easy to parse and process

### Log Rotation

To prevent log files from growing too large, implement periodic rotation:

```javascript
// In a scheduled task or cron job
import { rotateLogs } from '@/lib/logging/session-logger';

// Keep logs for 30 days, archive older logs
await rotateLogs(30);
```

This will:
1. Archive logs older than 30 days to `archive-YYYY-MM-DD.jsonl`
2. Keep recent logs in the main file
3. Maintain performance for active log access

## Monitoring Best Practices

### 1. Regular Reviews
- Check dashboard weekly for trends
- Monitor route distribution (high OUT_OF_DOMAIN percentage may indicate domain classifier issues)
- Review low-score queries for KB improvements

### 2. Performance Tracking
- Track average response times
- Identify slow queries for optimization
- Monitor embedding/LLM API latency

### 3. Quality Assessment
- Review out-of-domain classifications for false positives
- Examine low-score queries that returned answers
- Identify common question patterns for KB enhancement

### 4. Privacy Compliance
- IP addresses are hashed (SHA-256)
- No PII is stored by default
- Session IDs are random UUIDs
- Consider implementing data retention policies

## Troubleshooting

### Dashboard Not Loading
1. Verify `ADMIN_PASSWORD` is set in `.env.local`
2. Check that the password matches when logging in
3. Inspect browser console for errors

### Logs Not Appearing
1. Verify `data/logs/` directory exists and is writable
2. Check server logs for logging errors
3. Ensure chat requests are completing successfully

### Performance Issues
1. Implement log rotation if files are large
2. Consider database storage for very high volumes
3. Add indexes if querying becomes slow

## Future Enhancements

Potential improvements for the logging system:

- **Database Backend**: Migrate from JSONL to PostgreSQL/MongoDB for better querying
- **Real-time Dashboard**: WebSocket updates for live monitoring
- **Alerts**: Automated notifications for errors or anomalies
- **Export Features**: Download logs in CSV/JSON formats
- **User Feedback**: Allow users to rate responses for quality tracking
- **A/B Testing**: Compare different prompts or parameters
- **Cost Tracking**: Monitor OpenAI API usage and costs per session

## Security Considerations

1. **Password Strength**: Use a strong, unique password for production
2. **HTTPS Only**: Always use HTTPS in production
3. **Access Logs**: Monitor who accesses the admin dashboard
4. **Data Retention**: Implement policies to delete old logs
5. **PII Protection**: Avoid logging sensitive user information
6. **Environment Variables**: Never commit `.env.local` to version control

## Support

For issues or questions:
1. Check server logs: `npm run dev` or production logs
2. Review this guide for configuration steps
3. Examine the code in `lib/logging/session-logger.ts`
4. Test API endpoints with curl or Postman

---

**Last Updated**: October 2025  
**Version**: 1.0.0

