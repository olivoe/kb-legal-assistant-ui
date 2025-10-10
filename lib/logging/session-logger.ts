// lib/logging/session-logger.ts
import { promises as fs } from "fs";
import path from "path";

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
    route?: string; // "KB_ONLY" | "KB_EMPTY" | "WEB_FALLBACK"
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
  ipHash?: string; // Hashed for privacy
};

const LOGS_DIR = path.join(process.cwd(), "data", "logs");
const CURRENT_LOG_FILE = path.join(LOGS_DIR, "chat-sessions.jsonl");

// Ensure logs directory exists
async function ensureLogsDir() {
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create logs directory:", err);
  }
}

// Append a log entry to the JSONL file
export async function logChatSession(entry: ChatLogEntry): Promise<void> {
  try {
    await ensureLogsDir();
    const line = JSON.stringify(entry) + "\n";
    await fs.appendFile(CURRENT_LOG_FILE, line, "utf-8");
  } catch (err) {
    console.error("Failed to log chat session:", err);
  }
}

// Read all log entries with optional filtering
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
    await ensureLogsDir();
    
    // Check if log file exists
    try {
      await fs.access(CURRENT_LOG_FILE);
    } catch {
      return { logs: [], total: 0 };
    }

    const content = await fs.readFile(CURRENT_LOG_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    
    let logs: ChatLogEntry[] = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((entry): entry is ChatLogEntry => entry !== null);

    // Apply filters
    if (options?.sessionId) {
      logs = logs.filter((log) => log.sessionId === options.sessionId);
    }
    if (options?.startDate) {
      logs = logs.filter((log) => log.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      logs = logs.filter((log) => log.timestamp <= options.endDate!);
    }
    if (options?.route) {
      logs = logs.filter((log) => log.metadata.route === options.route);
    }
    if (options?.minScore !== undefined) {
      logs = logs.filter((log) => (log.metadata.topScore ?? 0) >= options.minScore!);
    }

    const total = logs.length;

    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    logs = logs.slice(offset, offset + limit);

    return { logs, total };
  } catch (err) {
    console.error("Failed to read chat logs:", err);
    return { logs: [], total: 0 };
  }
}

// Get aggregated statistics
export async function getChatStats(): Promise<{
  totalSessions: number;
  totalQueries: number;
  avgResponseTime: number;
  routeDistribution: Record<string, number>;
  avgTopScore: number;
  recentActivity: Array<{ date: string; count: number }>;
}> {
  try {
    const { logs } = await readChatLogs({ limit: 10000 });

    const totalQueries = logs.length;
    const uniqueSessions = new Set(logs.map((l) => l.sessionId)).size;

    const responseTimes = logs
      .map((l) => l.metadata.responseTimeMs)
      .filter((t): t is number => t !== undefined);
    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    const routeDistribution: Record<string, number> = {};
    logs.forEach((l) => {
      const route = l.metadata.route ?? "UNKNOWN";
      routeDistribution[route] = (routeDistribution[route] ?? 0) + 1;
    });

    const topScores = logs
      .map((l) => l.metadata.topScore)
      .filter((s): s is number => s !== undefined);
    const avgTopScore =
      topScores.length > 0
        ? topScores.reduce((a, b) => a + b, 0) / topScores.length
        : 0;

    // Recent activity (last 7 days)
    const now = new Date();
    const recentActivity: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const count = logs.filter((l) => l.timestamp.startsWith(dateStr)).length;
      recentActivity.push({ date: dateStr, count });
    }

    return {
      totalSessions: uniqueSessions,
      totalQueries,
      avgResponseTime: Math.round(avgResponseTime),
      routeDistribution,
      avgTopScore: Math.round(avgTopScore * 100) / 100,
      recentActivity,
    };
  } catch (err) {
    console.error("Failed to get chat stats:", err);
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

// Rotate logs (archive old logs)
export async function rotateLogs(daysToKeep: number = 30): Promise<void> {
  try {
    const { logs } = await readChatLogs({ limit: 100000 });
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const recentLogs = logs.filter(
      (log) => new Date(log.timestamp) >= cutoffDate
    );

    const oldLogs = logs.filter((log) => new Date(log.timestamp) < cutoffDate);

    // Archive old logs
    if (oldLogs.length > 0) {
      const archiveFile = path.join(
        LOGS_DIR,
        `archive-${cutoffDate.toISOString().split("T")[0]}.jsonl`
      );
      const archiveContent = oldLogs.map((l) => JSON.stringify(l)).join("\n") + "\n";
      await fs.writeFile(archiveFile, archiveContent, "utf-8");
    }

    // Rewrite current log file with recent logs only
    const currentContent = recentLogs.map((l) => JSON.stringify(l)).join("\n") + "\n";
    await fs.writeFile(CURRENT_LOG_FILE, currentContent, "utf-8");

    console.log(`Rotated logs: kept ${recentLogs.length}, archived ${oldLogs.length}`);
  } catch (err) {
    console.error("Failed to rotate logs:", err);
  }
}

