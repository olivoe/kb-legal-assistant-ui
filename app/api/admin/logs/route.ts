// app/api/admin/logs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readChatLogs, getChatStats } from "@/lib/logging/session-logger";

// Simple authentication - in production, use proper auth
function isAuthenticated(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123"; // Set in .env.local
  
  if (!authHeader) return false;
  
  // Check for Bearer token or Basic auth
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    return token === adminPassword;
  }
  
  if (authHeader.startsWith("Basic ")) {
    const base64 = authHeader.substring(6);
    const decoded = Buffer.from(base64, "base64").toString();
    const [, password] = decoded.split(":");
    return password === adminPassword;
  }
  
  return false;
}

export async function GET(req: NextRequest) {
  // Check authentication
  if (!isAuthenticated(req)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  const { searchParams } = new URL(req.url);
  
  const action = searchParams.get("action");
  
  // Get statistics
  if (action === "stats") {
    const stats = await getChatStats();
    return NextResponse.json(stats);
  }

  // Get logs with filters
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const sessionId = searchParams.get("sessionId") ?? undefined;
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;
  const route = searchParams.get("route") ?? undefined;
  const minScore = searchParams.has("minScore")
    ? parseFloat(searchParams.get("minScore")!)
    : undefined;

  const result = await readChatLogs({
    limit,
    offset,
    sessionId,
    startDate,
    endDate,
    route,
    minScore,
  });

  return NextResponse.json(result);
}

