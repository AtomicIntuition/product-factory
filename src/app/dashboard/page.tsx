"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import type { DashboardSummary, PipelineRun } from "@/types";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function formatDuration(start: string, end: string | null): string {
  if (!end) {
    // Live elapsed time for running tasks
    const ms = Date.now() - new Date(start).getTime();
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s elapsed`;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}m ${remainSecs}s elapsed`;
  }
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-600/20 text-green-400";
    case "running":
      return "bg-yellow-600/20 text-yellow-400";
    case "failed":
      return "bg-red-600/20 text-red-400";
    default:
      return "bg-gray-600/20 text-gray-400";
  }
}

export default function DashboardPage(): React.ReactElement {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [deletingRunIds, setDeletingRunIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasRunning = pipelineRuns.some((r) => r.status === "running");

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      const [summaryRes, pipelineRes] = await Promise.all([
        fetch("/api/analytics/summary"),
        fetch("/api/pipeline"),
      ]);

      if (!summaryRes.ok) throw new Error("Failed to fetch summary");
      if (!pipelineRes.ok) throw new Error("Failed to fetch pipeline runs");

      setSummary(await summaryRes.json());
      setPipelineRuns(await pipelineRes.json());
    } catch (err) {
      if (isInitial) {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Poll every 5s while any run is "running", plus tick every second for live elapsed time
  useEffect(() => {
    if (!hasRunning) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    // Poll API every 5 seconds
    pollRef.current = setInterval(() => {
      fetchData();
    }, 5000);

    // Tick every second to update elapsed time display
    const tickInterval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(tickInterval);
    };
  }, [hasRunning, fetchData]);

  async function handleRunResearch() {
    setResearchLoading(true);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "research", params: {} }),
      });
      if (!res.ok) throw new Error("Failed to start research");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run research");
    } finally {
      setResearchLoading(false);
    }
  }

  async function handleDeleteRun(id: string) {
    setDeletingRunIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/pipeline?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setPipelineRuns((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete run");
    } finally {
      setDeletingRunIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-red-900/30 border border-red-700 text-red-300 px-6 py-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Total Products", value: summary?.total_products ?? 0 },
    { label: "Published", value: summary?.published_count ?? 0 },
    { label: "Revenue", value: formatCents(summary?.total_revenue_cents ?? 0) },
    { label: "Unpublished", value: summary?.products_in_queue ?? 0 },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Dashboard Overview</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-gray-900 border border-gray-800 rounded-lg p-6"
          >
            <p className="text-sm text-gray-400 mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRunResearch}
            disabled={researchLoading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {researchLoading && (
              <svg
                className="animate-spin h-4 w-4 text-white"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {researchLoading ? "Running Research..." : "Run Research"}
          </button>
          <Link
            href="/dashboard/research"
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-100 font-medium rounded-lg transition-colors border border-gray-700"
          >
            View Opportunities
          </Link>
          <Link
            href="/dashboard/products?status=ready_for_review"
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-100 font-medium rounded-lg transition-colors border border-gray-700"
          >
            Review Products
          </Link>
        </div>
      </div>

      {/* Recent Pipeline Activity */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-white">
            Recent Pipeline Activity
          </h2>
          {hasRunning && (
            <span className="flex items-center gap-1.5 text-xs text-yellow-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
              </span>
              Auto-refreshing
            </span>
          )}
        </div>
        {pipelineRuns.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-500">
            No pipeline activity yet. Run your first research to get started.
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="px-4 py-3 font-medium">Phase</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pipelineRuns.slice(0, 10).map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-gray-800/50 last:border-0"
                  >
                    <td className="px-4 py-3 capitalize text-gray-100">
                      {run.phase}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(run.status)}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {formatDate(run.started_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {run.status === "running" && (
                        <svg
                          className="inline-block animate-spin h-3 w-3 mr-1.5 text-yellow-400"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                      )}
                      {formatDuration(run.started_at, run.completed_at)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteRun(run.id)}
                        disabled={deletingRunIds.has(run.id)}
                        className="text-gray-500 hover:text-red-400 disabled:opacity-40 transition-colors text-xs"
                      >
                        {deletingRunIds.has(run.id) ? "..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
