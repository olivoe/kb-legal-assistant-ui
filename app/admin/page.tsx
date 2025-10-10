"use client";

import { useState, useEffect } from "react";

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Admin Login</h1>
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter admin password"
              />
            </div>
            {error && (
              <div className="mb-4 text-red-600 text-sm">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Chat Admin Dashboard</h1>
          <p className="text-gray-600">Monitor and analyze chat sessions</p>
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-600">Total Sessions</div>
              <div className="text-3xl font-bold text-blue-600">{stats.totalSessions}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-600">Total Queries</div>
              <div className="text-3xl font-bold text-green-600">{stats.totalQueries}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-600">Avg Response Time</div>
              <div className="text-3xl font-bold text-purple-600">{stats.avgResponseTime}ms</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-600">Avg Top Score</div>
              <div className="text-3xl font-bold text-orange-600">{stats.avgTopScore}</div>
            </div>
          </div>
        )}

        {/* Route Distribution */}
        {stats && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Route Distribution</h2>
            <div className="space-y-2">
              {Object.entries(stats.routeDistribution).map(([route, count]) => (
                <div key={route} className="flex items-center">
                  <span className="w-32 text-sm font-medium">{route}</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-blue-600 h-4 rounded-full"
                      style={{
                        width: `${(count / stats.totalQueries) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="ml-2 text-sm text-gray-600">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity Chart */}
        {stats && stats.recentActivity.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Recent Activity (Last 7 Days)</h2>
            <div className="flex items-end justify-between h-48 gap-2">
              {stats.recentActivity.map((day, idx) => {
                const maxCount = Math.max(...stats.recentActivity.map((d) => d.count));
                const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center">
                    <div className="w-full bg-blue-600 rounded-t" style={{ height: `${height}%` }} />
                    <div className="text-xs text-gray-600 mt-2">
                      {new Date(day.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="text-xs font-medium">{day.count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <h2 className="text-xl font-bold mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Route
              </label>
              <select
                value={filterRoute}
                onChange={(e) => {
                  setFilterRoute(e.target.value);
                  setPage(0);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">All Routes</option>
                <option value="KB_ONLY">KB Only</option>
                <option value="KB_EMPTY">KB Empty</option>
                <option value="WEB_FALLBACK">Web Fallback</option>
                <option value="OUT_OF_DOMAIN">Out of Domain</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., 0.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => {
                  setFilterStartDate(e.target.value);
                  setPage(0);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold">Chat Logs</h2>
            <p className="text-sm text-gray-600">
              Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalLogs)} of {totalLogs}
            </p>
          </div>
          
          {loading ? (
            <div className="p-8 text-center text-gray-600">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No logs found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Question
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Route
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time (ms)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-md truncate">
                        {log.question}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            log.metadata.route === "KB_ONLY"
                              ? "bg-green-100 text-green-800"
                              : log.metadata.route === "KB_EMPTY"
                              ? "bg-red-100 text-red-800"
                              : log.metadata.route === "WEB_FALLBACK"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {log.metadata.route || "N/A"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.metadata.topScore?.toFixed(3) || "N/A"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.metadata.responseTimeMs || "N/A"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-blue-600 hover:text-blue-800"
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
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                <h3 className="text-xl font-bold">Log Details</h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Timestamp</h4>
                  <p className="text-sm">{new Date(selectedLog.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Session ID</h4>
                  <p className="text-sm font-mono">{selectedLog.sessionId}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Question</h4>
                  <p className="text-sm bg-gray-50 p-3 rounded">{selectedLog.question}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Answer</h4>
                  <p className="text-sm bg-gray-50 p-3 rounded whitespace-pre-wrap">{selectedLog.answer}</p>
                </div>
                {selectedLog.metadata.rewrittenQuery && (
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Rewritten Query</h4>
                    <p className="text-sm bg-blue-50 p-3 rounded">{selectedLog.metadata.rewrittenQuery}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Metadata</h4>
                    <dl className="text-sm space-y-1">
                      <div className="flex">
                        <dt className="font-medium w-32">Route:</dt>
                        <dd>{selectedLog.metadata.route}</dd>
                      </div>
                      <div className="flex">
                        <dt className="font-medium w-32">Top Score:</dt>
                        <dd>{selectedLog.metadata.topScore?.toFixed(3)}</dd>
                      </div>
                      <div className="flex">
                        <dt className="font-medium w-32">Response Time:</dt>
                        <dd>{selectedLog.metadata.responseTimeMs}ms</dd>
                      </div>
                      <div className="flex">
                        <dt className="font-medium w-32">TopK:</dt>
                        <dd>{selectedLog.metadata.topK}</dd>
                      </div>
                      <div className="flex">
                        <dt className="font-medium w-32">Min Score:</dt>
                        <dd>{selectedLog.metadata.minScore}</dd>
                      </div>
                      <div className="flex">
                        <dt className="font-medium w-32">In Domain:</dt>
                        <dd>{selectedLog.metadata.inDomain ? "Yes" : "No"}</dd>
                      </div>
                    </dl>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Top Scores</h4>
                    <div className="text-sm space-y-1">
                      {selectedLog.metadata.topScores?.slice(0, 5).map((score, i) => (
                        <div key={i} className="flex items-center">
                          <span className="w-4">{i + 1}.</span>
                          <div className="flex-1 bg-gray-200 rounded-full h-2 mx-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${score * 100}%` }}
                            />
                          </div>
                          <span className="w-12 text-right">{score.toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {selectedLog.metadata.sources && selectedLog.metadata.sources.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Sources ({selectedLog.metadata.sources.length})</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedLog.metadata.sources.map((source, i) => (
                        <div key={i} className="bg-gray-50 p-3 rounded text-sm">
                          <div className="flex justify-between mb-1">
                            <span className="font-medium">{source.file || "Unknown"}</span>
                            <span className="text-blue-600">{source.score.toFixed(3)}</span>
                          </div>
                          {source.snippet && (
                            <p className="text-xs text-gray-600 line-clamp-2">{source.snippet}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedLog.conversationHistory && selectedLog.conversationHistory.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Conversation History</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedLog.conversationHistory.map((msg, i) => (
                        <div key={i} className={`p-3 rounded text-sm ${
                          msg.role === "user" ? "bg-blue-50" : "bg-gray-50"
                        }`}>
                          <div className="font-medium text-xs uppercase mb-1">{msg.role}</div>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

