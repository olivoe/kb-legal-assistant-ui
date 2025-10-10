"use client";

import { useState, useEffect } from "react";

const COLORS = {
  primary: '#111827',
  secondary: '#6b7280',
  border: '#e5e7eb',
  background: '#f9fafb',
  white: '#ffffff',
  blue: '#2563eb',
  blueLight: '#eff6ff',
  green: '#10b981',
  greenLight: '#d1fae5',
  red: '#ef4444',
  redLight: '#fee2e2',
  purple: '#8b5cf6',
  purpleLight: '#ede9fe',
  orange: '#f59e0b',
  orangeLight: '#fef3c7',
};

type ChatLogEntry = {
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
};

type Stats = {
  totalSessions: number;
  totalQueries: number;
  avgResponseTime: number;
  routeDistribution: Record<string, number>;
  avgTopScore: number;
  recentActivity: Array<{ date: string; count: number }>;
};

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [logs, setLogs] = useState<ChatLogEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState<ChatLogEntry | null>(null);
  
  // Filters
  const [filterRoute, setFilterRoute] = useState("");
  const [filterMinScore, setFilterMinScore] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [page, setPage] = useState(0);
  const [totalLogs, setTotalLogs] = useState(0);
  const pageSize = 20;

  const authHeaders = {
    Authorization: `Bearer ${password}`,
  };

  useEffect(() => {
    if (authenticated) {
      fetchStats();
      fetchLogs();
    }
  }, [authenticated, filterRoute, filterMinScore, filterStartDate, page]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/logs?action=stats", {
        headers: authHeaders,
      });

      if (res.ok) {
        setAuthenticated(true);
      } else {
        setError("Invalid password");
      }
    } catch (err) {
      setError("Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch("/api/admin/logs?action=stats", {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }

  async function fetchLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
      });
      
      if (filterRoute) params.set("route", filterRoute);
      if (filterMinScore) params.set("minScore", filterMinScore);
      if (filterStartDate) params.set("startDate", filterStartDate);

      const res = await fetch(`/api/admin/logs?${params}`, {
        headers: authHeaders,
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalLogs(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: COLORS.background,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          background: COLORS.white,
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
          padding: '48px',
          width: '100%',
          maxWidth: '400px',
        }}>
          <h1 style={{
            fontSize: '28px',
            fontWeight: 700,
            marginBottom: '32px',
            textAlign: 'center',
            color: COLORS.primary,
          }}>
            Admin Login
          </h1>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: COLORS.primary,
                marginBottom: '8px',
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  outline: 'none',
                }}
                placeholder="Enter admin password"
                onFocus={(e) => e.target.style.borderColor = COLORS.blue}
                onBlur={(e) => e.target.style.borderColor = COLORS.border}
              />
            </div>
            {error && (
              <div style={{
                marginBottom: '16px',
                color: COLORS.red,
                fontSize: '14px',
                padding: '12px',
                background: COLORS.redLight,
                borderRadius: '6px',
              }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? COLORS.secondary : COLORS.primary,
                color: COLORS.white,
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 600,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              {loading ? "Authenticating..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalLogs / pageSize);

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.background,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        borderBottom: `1px solid ${COLORS.border}`,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(6px)',
      }}>
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '28px',
              fontWeight: 700,
              color: COLORS.primary,
            }}>
              Chat Admin Dashboard
            </h1>
            <p style={{
              marginTop: '8px',
              color: COLORS.secondary,
              fontSize: '14px',
            }}>
              Monitor and analyze chat sessions
            </p>
          </div>
          <a
            href="/"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: `1px solid ${COLORS.border}`,
              background: COLORS.white,
              color: COLORS.primary,
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            ← Back to Chat
          </a>
        </div>
      </header>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px' }}>
        {/* Statistics Cards */}
        {stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}>
            <StatCard
              label="Total Sessions"
              value={stats.totalSessions}
              color={COLORS.blue}
              bgColor={COLORS.blueLight}
            />
            <StatCard
              label="Total Queries"
              value={stats.totalQueries}
              color={COLORS.green}
              bgColor={COLORS.greenLight}
            />
            <StatCard
              label="Avg Response Time"
              value={`${stats.avgResponseTime}ms`}
              color={COLORS.purple}
              bgColor={COLORS.purpleLight}
            />
            <StatCard
              label="Avg Top Score"
              value={stats.avgTopScore.toFixed(2)}
              color={COLORS.orange}
              bgColor={COLORS.orangeLight}
            />
          </div>
        )}

        {/* Route Distribution */}
        {stats && Object.keys(stats.routeDistribution).length > 0 && (
          <div style={{
            background: COLORS.white,
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            padding: '24px',
            marginBottom: '32px',
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 600,
              marginBottom: '16px',
              color: COLORS.primary,
            }}>
              Route Distribution
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Object.entries(stats.routeDistribution).map(([route, count]) => (
                <div key={route} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    minWidth: '140px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: COLORS.secondary,
                  }}>
                    {route}
                  </span>
                  <div style={{
                    flex: 1,
                    height: '24px',
                    background: COLORS.background,
                    borderRadius: '12px',
                    overflow: 'hidden',
                    position: 'relative',
                  }}>
                    <div style={{
                      position: 'absolute',
                      height: '100%',
                      background: COLORS.blue,
                      borderRadius: '12px',
                      width: `${(count / stats.totalQueries) * 100}%`,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <span style={{
                    minWidth: '40px',
                    textAlign: 'right',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: COLORS.primary,
                  }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity Chart */}
        {stats && stats.recentActivity.length > 0 && (
          <div style={{
            background: COLORS.white,
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            padding: '24px',
            marginBottom: '32px',
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 600,
              marginBottom: '16px',
              color: COLORS.primary,
            }}>
              Recent Activity (Last 7 Days)
            </h2>
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              height: '200px',
              gap: '8px',
            }}>
              {stats.recentActivity.map((day, idx) => {
                const maxCount = Math.max(...stats.recentActivity.map((d) => d.count));
                const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                return (
                  <div key={idx} style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <div style={{
                      width: '100%',
                      background: COLORS.blue,
                      borderRadius: '6px 6px 0 0',
                      height: `${height}%`,
                      minHeight: day.count > 0 ? '4px' : '0',
                      transition: 'height 0.3s ease',
                    }} />
                    <div style={{
                      fontSize: '11px',
                      color: COLORS.secondary,
                      textAlign: 'center',
                    }}>
                      {new Date(day.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: COLORS.primary,
                    }}>
                      {day.count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{
          background: COLORS.white,
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          padding: '24px',
          marginBottom: '24px',
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            marginBottom: '16px',
            color: COLORS.primary,
          }}>
            Filters
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: COLORS.primary,
                marginBottom: '8px',
              }}>
                Route
              </label>
              <select
                value={filterRoute}
                onChange={(e) => {
                  setFilterRoute(e.target.value);
                  setPage(0);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              >
                <option value="">All Routes</option>
                <option value="KB_ONLY">KB Only</option>
                <option value="KB_EMPTY">KB Empty</option>
                <option value="WEB_FALLBACK">Web Fallback</option>
                <option value="OUT_OF_DOMAIN">Out of Domain</option>
              </select>
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: COLORS.primary,
                marginBottom: '8px',
              }}>
                Min Score
              </label>
              <input
                type="number"
                step="0.1"
                value={filterMinScore}
                onChange={(e) => {
                  setFilterMinScore(e.target.value);
                  setPage(0);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
                placeholder="e.g., 0.5"
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: COLORS.primary,
                marginBottom: '8px',
              }}>
                Start Date
              </label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => {
                  setFilterStartDate(e.target.value);
                  setPage(0);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              />
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div style={{
          background: COLORS.white,
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '24px',
            borderBottom: `1px solid ${COLORS.border}`,
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 600,
              color: COLORS.primary,
              marginBottom: '4px',
            }}>
              Chat Logs
            </h2>
            <p style={{
              fontSize: '14px',
              color: COLORS.secondary,
              margin: 0,
            }}>
              Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalLogs)} of {totalLogs}
            </p>
          </div>
          
          {loading ? (
            <div style={{
              padding: '48px',
              textAlign: 'center',
              color: COLORS.secondary,
            }}>
              Loading...
            </div>
          ) : logs.length === 0 ? (
            <div style={{
              padding: '48px',
              textAlign: 'center',
              color: COLORS.secondary,
            }}>
              No logs found
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
              }}>
                <thead style={{ background: COLORS.background }}>
                  <tr>
                    {['Timestamp', 'Question', 'Route', 'Score', 'Time (ms)', 'Actions'].map((header) => (
                      <th key={header} style={{
                        padding: '12px 24px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: COLORS.secondary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={idx} style={{
                      borderTop: `1px solid ${COLORS.border}`,
                    }}>
                      <td style={{
                        padding: '16px 24px',
                        fontSize: '14px',
                        color: COLORS.primary,
                        whiteSpace: 'nowrap',
                      }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td style={{
                        padding: '16px 24px',
                        fontSize: '14px',
                        color: COLORS.primary,
                        maxWidth: '300px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {log.question}
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <RouteBadge route={log.metadata.route || "N/A"} />
                      </td>
                      <td style={{
                        padding: '16px 24px',
                        fontSize: '14px',
                        color: COLORS.primary,
                      }}>
                        {log.metadata.topScore?.toFixed(3) || "N/A"}
                      </td>
                      <td style={{
                        padding: '16px 24px',
                        fontSize: '14px',
                        color: COLORS.primary,
                      }}>
                        {log.metadata.responseTimeMs || "N/A"}
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <button
                          onClick={() => setSelectedLog(log)}
                          style={{
                            padding: '6px 12px',
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: '6px',
                            background: COLORS.white,
                            color: COLORS.blue,
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                          }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              padding: '16px 24px',
              borderTop: `1px solid ${COLORS.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                style={{
                  padding: '8px 16px',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  background: COLORS.white,
                  color: page === 0 ? COLORS.secondary : COLORS.primary,
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: page === 0 ? 'not-allowed' : 'pointer',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              >
                Previous
              </button>
              <span style={{
                fontSize: '14px',
                color: COLORS.secondary,
              }}>
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
                style={{
                  padding: '8px 16px',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  background: COLORS.white,
                  color: page === totalPages - 1 ? COLORS.secondary : COLORS.primary,
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selectedLog && (
          <LogDetailModal
            log={selectedLog}
            onClose={() => setSelectedLog(null)}
          />
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bgColor }: {
  label: string;
  value: string | number;
  color: string;
  bgColor: string;
}) {
  return (
    <div style={{
      background: COLORS.white,
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      padding: '24px',
    }}>
      <div style={{
        fontSize: '14px',
        fontWeight: 500,
        color: COLORS.secondary,
        marginBottom: '8px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '32px',
        fontWeight: 700,
        color,
      }}>
        {value}
      </div>
    </div>
  );
}

function RouteBadge({ route }: { route: string }) {
  const getRouteColor = () => {
    switch (route) {
      case 'KB_ONLY':
        return { bg: COLORS.greenLight, text: COLORS.green };
      case 'KB_EMPTY':
        return { bg: COLORS.redLight, text: COLORS.red };
      case 'WEB_FALLBACK':
        return { bg: COLORS.orangeLight, text: COLORS.orange };
      case 'OUT_OF_DOMAIN':
        return { bg: COLORS.purpleLight, text: COLORS.purple };
      default:
        return { bg: COLORS.background, text: COLORS.secondary };
    }
  };

  const colors = getRouteColor();

  return (
    <span style={{
      padding: '4px 12px',
      borderRadius: '12px',
      background: colors.bg,
      color: colors.text,
      fontSize: '12px',
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {route}
    </span>
  );
}

function LogDetailModal({ log, onClose }: {
  log: ChatLogEntry;
  onClose: () => void;
}) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      zIndex: 50,
    }} onClick={onClose}>
      <div style={{
        background: COLORS.white,
        borderRadius: '12px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          padding: '24px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: COLORS.white,
          zIndex: 1,
        }}>
          <h3 style={{
            fontSize: '20px',
            fontWeight: 700,
            color: COLORS.primary,
            margin: 0,
          }}>
            Log Details
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              border: 'none',
              background: 'transparent',
              color: COLORS.secondary,
              cursor: 'pointer',
              fontSize: '24px',
              lineHeight: '1',
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '24px' }}>
          <DetailSection label="Timestamp">
            {new Date(log.timestamp).toLocaleString()}
          </DetailSection>
          <DetailSection label="Session ID">
            <code style={{
              fontSize: '12px',
              padding: '4px 8px',
              background: COLORS.background,
              borderRadius: '4px',
            }}>
              {log.sessionId}
            </code>
          </DetailSection>
          <DetailSection label="Question">
            <div style={{
              padding: '12px',
              background: COLORS.background,
              borderRadius: '8px',
              fontSize: '14px',
              lineHeight: '1.5',
            }}>
              {log.question}
            </div>
          </DetailSection>
          <DetailSection label="Answer">
            <div style={{
              padding: '12px',
              background: COLORS.background,
              borderRadius: '8px',
              fontSize: '14px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              maxHeight: '300px',
              overflowY: 'auto',
            }}>
              {log.answer}
            </div>
          </DetailSection>
          {log.metadata.rewrittenQuery && (
            <DetailSection label="Rewritten Query">
              <div style={{
                padding: '12px',
                background: COLORS.blueLight,
                borderRadius: '8px',
                fontSize: '14px',
              }}>
                {log.metadata.rewrittenQuery}
              </div>
            </DetailSection>
          )}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginTop: '24px',
          }}>
            <DetailSection label="Route">
              <RouteBadge route={log.metadata.route || "N/A"} />
            </DetailSection>
            <DetailSection label="Top Score">
              {log.metadata.topScore?.toFixed(3) || "N/A"}
            </DetailSection>
            <DetailSection label="Response Time">
              {log.metadata.responseTimeMs}ms
            </DetailSection>
            <DetailSection label="In Domain">
              {log.metadata.inDomain ? "Yes" : "No"}
            </DetailSection>
          </div>
          {log.metadata.topScores && log.metadata.topScores.length > 0 && (
            <DetailSection label="Top Scores">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {log.metadata.topScores.slice(0, 5).map((score, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span style={{ minWidth: '20px', fontSize: '14px', color: COLORS.secondary }}>
                      {i + 1}.
                    </span>
                    <div style={{
                      flex: 1,
                      height: '8px',
                      background: COLORS.background,
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        background: COLORS.blue,
                        borderRadius: '4px',
                        width: `${score * 100}%`,
                      }} />
                    </div>
                    <span style={{
                      minWidth: '60px',
                      textAlign: 'right',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: COLORS.primary,
                    }}>
                      {score.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailSection({ label, children }: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        color: COLORS.secondary,
        marginBottom: '8px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '14px',
        color: COLORS.primary,
      }}>
        {children}
      </div>
    </div>
  );
}
