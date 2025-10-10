// lib/logging/session-logger-pg.ts
// Postgres-based session logging for production
import { sql } from '@vercel/postgres';

export type ChatLogEntry = {
  sessionId: string;
  timestamp: string;
  question: string;
  answer: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  metadata: {
    topK: number;
    minScore: number;
    kbOnly: boolean;
    route?: string;
    topScores?: number[];
    topScore?: number;
    responseTimeMs?: number;
    model?: string;
    rewrittenQuery?: string;
    inDomain?: boolean;
    sources?: Array<{
      id: string;
      score: number;
      file: string | null;
      snippet?: string;
    }>;
  };
  requestId?: string;
  userAgent?: string;
  ipHash?: string;
};

/**
 * Log a chat session to Postgres
 */
export async function logChatSession(entry: ChatLogEntry): Promise<void> {
  try {
    await sql`
      INSERT INTO chat_sessions (
        session_id,
        timestamp,
        question,
        answer,
        conversation_history,
        top_k,
        min_score,
        kb_only,
        route,
        top_scores,
        top_score,
        response_time_ms,
        model,
        rewritten_query,
        in_domain,
        sources,
        request_id,
        user_agent,
        ip_hash
      ) VALUES (
        ${entry.sessionId},
        ${entry.timestamp},
        ${entry.question},
        ${entry.answer},
        ${entry.conversationHistory ? JSON.stringify(entry.conversationHistory) : null},
        ${entry.metadata.topK},
        ${entry.metadata.minScore},
        ${entry.metadata.kbOnly},
        ${entry.metadata.route || null},
        ${entry.metadata.topScores ? JSON.stringify(entry.metadata.topScores) : null},
        ${entry.metadata.topScore || null},
        ${entry.metadata.responseTimeMs || null},
        ${entry.metadata.model || null},
        ${entry.metadata.rewrittenQuery || null},
        ${entry.metadata.inDomain ?? true},
        ${entry.metadata.sources ? JSON.stringify(entry.metadata.sources) : null},
        ${entry.requestId || null},
        ${entry.userAgent || null},
        ${entry.ipHash || null}
      )
    `;
  } catch (error) {
    console.error('Failed to log chat session to Postgres:', error);
    // Don't throw - logging failures shouldn't break the app
  }
}

/**
 * Read chat logs with filtering and pagination
 */
export async function readChatLogs(options?: {
  limit?: number;
  offset?: number;
  sessionId?: string;
  startDate?: string;
  endDate?: string;
  route?: string;
  minScore?: number;
}): Promise<{ logs: ChatLogEntry[]; total: number }> {
  try {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    
    // Build WHERE conditions
    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (options?.sessionId) {
      conditions.push(`session_id = $${paramIndex++}`);
      params.push(options.sessionId);
    }
    
    if (options?.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(options.startDate);
    }
    
    if (options?.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(options.endDate);
    }
    
    if (options?.route) {
      conditions.push(`route = $${paramIndex++}`);
      params.push(options.route);
    }
    
    if (options?.minScore !== undefined) {
      conditions.push(`top_score >= $${paramIndex++}`);
      params.push(options.minScore);
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM chat_sessions WHERE ${whereClause}`;
    const countResult = await sql.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.count || '0');
    
    // Get paginated logs
    const dataQuery = `
      SELECT 
        session_id,
        timestamp,
        question,
        answer,
        conversation_history,
        top_k,
        min_score,
        kb_only,
        route,
        top_scores,
        top_score,
        response_time_ms,
        model,
        rewritten_query,
        in_domain,
        sources,
        request_id,
        user_agent,
        ip_hash
      FROM chat_sessions
      WHERE ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const dataResult = await sql.query(dataQuery, [...params, limit, offset]);
    
    // Transform rows to ChatLogEntry format
    const logs: ChatLogEntry[] = dataResult.rows.map((row: any) => ({
      sessionId: row.session_id,
      timestamp: row.timestamp,
      question: row.question,
      answer: row.answer,
      conversationHistory: row.conversation_history,
      metadata: {
        topK: row.top_k,
        minScore: parseFloat(row.min_score),
        kbOnly: row.kb_only,
        route: row.route,
        topScores: row.top_scores,
        topScore: row.top_score ? parseFloat(row.top_score) : undefined,
        responseTimeMs: row.response_time_ms,
        model: row.model,
        rewrittenQuery: row.rewritten_query,
        inDomain: row.in_domain,
        sources: row.sources,
      },
      requestId: row.request_id,
      userAgent: row.user_agent,
      ipHash: row.ip_hash,
    }));
    
    return { logs, total };
  } catch (error) {
    console.error('Failed to read chat logs from Postgres:', error);
    return { logs: [], total: 0 };
  }
}

/**
 * Get aggregated statistics
 */
export async function getChatStats(): Promise<{
  totalSessions: number;
  totalQueries: number;
  avgResponseTime: number;
  routeDistribution: Record<string, number>;
  avgTopScore: number;
  recentActivity: Array<{ date: string; count: number }>;
}> {
  try {
    // Get basic stats
    const statsResult = await sql`
      SELECT 
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(*) as total_queries,
        AVG(response_time_ms) as avg_response_time,
        AVG(top_score) as avg_top_score
      FROM chat_sessions
      WHERE timestamp >= NOW() - INTERVAL '30 days'
    `;
    
    const stats = statsResult.rows[0];
    
    // Get route distribution
    const routeResult = await sql`
      SELECT route, COUNT(*) as count
      FROM chat_sessions
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY route
    `;
    
    const routeDistribution: Record<string, number> = {};
    routeResult.rows.forEach((row: any) => {
      routeDistribution[row.route || 'UNKNOWN'] = parseInt(row.count);
    });
    
    // Get recent activity (last 7 days)
    const activityResult = await sql`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as count
      FROM chat_sessions
      WHERE timestamp >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `;
    
    // Fill in missing days with zero counts
    const recentActivity: Array<{ date: string; count: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayData = activityResult.rows.find((row: any) => 
        row.date && new Date(row.date).toISOString().split('T')[0] === dateStr
      );
      
      recentActivity.push({
        date: dateStr,
        count: dayData ? parseInt(dayData.count) : 0,
      });
    }
    
    return {
      totalSessions: parseInt(stats?.unique_sessions || '0'),
      totalQueries: parseInt(stats?.total_queries || '0'),
      avgResponseTime: Math.round(parseFloat(stats?.avg_response_time || '0')),
      routeDistribution,
      avgTopScore: Math.round((parseFloat(stats?.avg_top_score || '0')) * 100) / 100,
      recentActivity,
    };
  } catch (error) {
    console.error('Failed to get chat stats from Postgres:', error);
    return {
      totalSessions: 0,
      totalQueries: 0,
      avgResponseTime: 0,
      routeDistribution: {},
      avgTopScore: 0,
      recentActivity: [],
    };
  }
}

/**
 * Clean up old logs (optional maintenance task)
 */
export async function cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
  try {
    const result = await sql`
      DELETE FROM chat_sessions
      WHERE timestamp < NOW() - INTERVAL '${sql.raw(daysToKeep.toString())} days'
    `;
    
    return result.rowCount || 0;
  } catch (error) {
    console.error('Failed to cleanup old logs:', error);
    return 0;
  }
}

