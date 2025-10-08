// KB Health Check Endpoint
// Returns status of embeddings, coverage, and last build time

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  embeddings: {
    total: number;
    lastUpdated: string | null;
    fileSizeKB: number;
  };
  index: {
    total: number;
    lastUpdated: string | null;
    fileSizeKB: number;
  };
  coverage: {
    percentage: number;
    missing: number;
    status: "complete" | "partial" | "unknown";
  };
  issues: string[];
}

export async function GET(req: NextRequest) {
  try {
    const issues: string[] = [];
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    // Read embeddings.json
    const embeddingsPath = path.join(process.cwd(), "public", "embeddings.json");
    let embeddingsData: any = null;
    let embeddingsStats: any = null;
    
    try {
      const embeddingsContent = await fs.readFile(embeddingsPath, "utf-8");
      embeddingsData = JSON.parse(embeddingsContent);
      embeddingsStats = await fs.stat(embeddingsPath);
    } catch (error) {
      issues.push("embeddings.json not found or invalid");
      status = "unhealthy";
    }

    // Read kb_index.json
    const indexPath = path.join(process.cwd(), "public", "kb_index.json");
    let indexData: any = null;
    let indexStats: any = null;
    
    try {
      const indexContent = await fs.readFile(indexPath, "utf-8");
      indexData = JSON.parse(indexContent);
      indexStats = await fs.stat(indexPath);
    } catch (error) {
      issues.push("kb_index.json not found or invalid");
      status = "unhealthy";
    }

    // Calculate coverage
    const embeddedFiles = new Set(
      (embeddingsData?.items || []).map((item: any) => String(item.file || ""))
    );
    const totalDocs = indexData ? indexData.length : 0;
    const embeddedCount = embeddedFiles.size;
    const coveragePercentage = totalDocs > 0 ? (embeddedCount / totalDocs) * 100 : 0;
    const missingCount = totalDocs - embeddedCount;

    let coverageStatus: "complete" | "partial" | "unknown" = "unknown";
    if (totalDocs === 0) {
      issues.push("No documents in index");
      status = "unhealthy";
    } else if (coveragePercentage === 100) {
      coverageStatus = "complete";
    } else if (coveragePercentage >= 90) {
      coverageStatus = "partial";
      issues.push(`${missingCount} documents missing embeddings (${coveragePercentage.toFixed(1)}% coverage)`);
      if (status === "healthy") status = "degraded";
    } else {
      coverageStatus = "partial";
      issues.push(`Low coverage: ${coveragePercentage.toFixed(1)}% (${missingCount} missing)`);
      status = "unhealthy";
    }

    // Check file ages
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;

    if (embeddingsStats) {
      const embeddingsAge = now - embeddingsStats.mtimeMs;
      if (embeddingsAge > sevenDaysMs) {
        issues.push(`Embeddings not updated in ${Math.floor(embeddingsAge / oneDayMs)} days`);
        if (status === "healthy") status = "degraded";
      }
    }

    if (indexStats) {
      const indexAge = now - indexStats.mtimeMs;
      if (indexAge > sevenDaysMs) {
        issues.push(`Index not updated in ${Math.floor(indexAge / oneDayMs)} days`);
        if (status === "healthy") status = "degraded";
      }
    }

    // Build response
    const health: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      embeddings: {
        total: embeddingsData?.items?.length || 0,
        lastUpdated: embeddingsStats ? new Date(embeddingsStats.mtime).toISOString() : null,
        fileSizeKB: embeddingsStats ? Math.round(embeddingsStats.size / 1024) : 0,
      },
      index: {
        total: totalDocs,
        lastUpdated: indexStats ? new Date(indexStats.mtime).toISOString() : null,
        fileSizeKB: indexStats ? Math.round(indexStats.size / 1024) : 0,
      },
      coverage: {
        percentage: Math.round(coveragePercentage * 10) / 10,
        missing: missingCount,
        status: coverageStatus,
      },
      issues,
    };

    // Return appropriate HTTP status
    const httpStatus = status === "healthy" ? 200 : status === "degraded" ? 200 : 503;

    return NextResponse.json(health, { status: httpStatus });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message,
        issues: ["Health check failed: " + error.message],
      },
      { status: 503 }
    );
  }
}