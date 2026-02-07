"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardSummary, PipelineRun } from "@/types";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "Running...";
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

  useEffect(() => {
    async function fetchData() {
      try {
        const [summaryRes, pipelineRes] = await Promise.all([
          fetch("/api/analytics/summary"),
          fetch("/api/pipeline"),
        ]);

        if (!summaryRes.ok) throw new Error("Failed to fetch summary");
        if (!pipelineRes.ok) throw new Error("Failed to fetch pipeline runs");

        const summaryData = await summaryRes.json();
        const pipelineData = await pipelineRes.json();

        setSummary(summaryData);
        setPipelineRuns(pipelineData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  async function handleRunResearch() {
    setResearchLoading(true);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "research", params: {} }),
      });
      if (!res.ok) throw new Error("Failed to start research");

      const pipelineRes = await fetch("/api/pipeline");
      if (pipelineRes.ok) {
        setPipelineRuns(await pipelineRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run research");
    } finally {
      setResearchLoading(false);
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
        <h2 className="text-lg font-semibold text-white mb-4">
          Recent Pipeline Activity
        </h2>
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
                      {formatDuration(run.started_at, run.completed_at)}
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
