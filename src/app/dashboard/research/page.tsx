"use client";

import { useEffect, useState } from "react";
import type { ResearchReport, Opportunity } from "@/types";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function scoreColor(score: number): string {
  if (score >= 0.8) return "bg-green-500";
  if (score >= 0.6) return "bg-blue-500";
  if (score >= 0.4) return "bg-yellow-500";
  return "bg-red-500";
}

function scoreBadgeColor(score: number): string {
  if (score >= 0.8) return "bg-green-600/20 text-green-400";
  if (score >= 0.6) return "bg-blue-600/20 text-blue-400";
  if (score >= 0.4) return "bg-yellow-600/20 text-yellow-400";
  return "bg-red-600/20 text-red-400";
}

function statusBadge(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-600/20 text-green-400";
    case "archived":
      return "bg-gray-600/20 text-gray-400";
    default:
      return "bg-gray-600/20 text-gray-400";
  }
}

export default function ResearchPage(): React.ReactElement {
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  const [researchLoading, setResearchLoading] = useState(false);
  const [nicheInput, setNicheInput] = useState("");

  const [seedUrls, setSeedUrls] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    try {
      const res = await fetch("/api/research/reports");
      if (!res.ok) throw new Error("Failed to fetch research reports");
      setReports(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleRunResearch() {
    setResearchLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = {};
      if (nicheInput.trim()) {
        params.niche = nicheInput.trim();
      }
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "research", params }),
      });
      if (!res.ok) throw new Error("Failed to start research");
      setNicheInput("");
      await fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run research");
    } finally {
      setResearchLoading(false);
    }
  }

  async function handleSubmitSeeds() {
    if (!seedUrls.trim()) return;
    setSeedLoading(true);
    setSeedSuccess(false);
    setError(null);
    try {
      const urls = seedUrls
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);
      const res = await fetch("/api/research/seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) throw new Error("Failed to submit seed URLs");
      setSeedUrls("");
      setSeedSuccess(true);
      setTimeout(() => setSeedSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit seeds");
    } finally {
      setSeedLoading(false);
    }
  }

  async function handleGenerate(opportunity: Opportunity, reportId: string) {
    setGeneratingIds((prev) => new Set(prev).add(opportunity.id));
    setError(null);
    setGenerateSuccess(null);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          params: {
            opportunityId: opportunity.id,
            reportId,
            opportunity,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to start generation");
      setGenerateSuccess(
        `Generation started for "${opportunity.niche}". This takes 1-3 minutes — check the Products page for results.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start generation"
      );
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(opportunity.id);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading research data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Research</h1>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Niche (optional)
            </label>
            <input
              type="text"
              value={nicheInput}
              onChange={(e) => setNicheInput(e.target.value)}
              placeholder="e.g. productivity templates"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 w-64"
            />
          </div>
          <button
            onClick={handleRunResearch}
            disabled={researchLoading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            {researchLoading && (
              <svg
                className="animate-spin h-4 w-4"
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
            {researchLoading ? "Running..." : "Run New Research"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {generateSuccess && (
        <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg text-sm">
          {generateSuccess}
        </div>
      )}

      {/* Add Seed URLs */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-3">
          Add Seed URLs
        </h2>
        <p className="text-sm text-gray-400 mb-3">
          Paste Gumroad product URLs (one per line) to seed the research
          pipeline.
        </p>
        <textarea
          value={seedUrls}
          onChange={(e) => setSeedUrls(e.target.value)}
          rows={4}
          placeholder={"https://gumroad.com/l/example1\nhttps://gumroad.com/l/example2"}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-y"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleSubmitSeeds}
            disabled={seedLoading || !seedUrls.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {seedLoading ? "Submitting..." : "Submit Seeds"}
          </button>
          {seedSuccess && (
            <span className="text-green-400 text-sm">
              Seeds submitted successfully!
            </span>
          )}
        </div>
      </div>

      {/* Research Reports */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">
          Research Reports
        </h2>
        {reports.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-500">
            No research reports yet. Run your first research above to discover
            opportunities.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const isExpanded = expandedReportId === report.id;
              return (
                <div
                  key={report.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
                >
                  {/* Report Header */}
                  <div className="flex items-center">
                    <button
                      onClick={() =>
                        setExpandedReportId(isExpanded ? null : report.id)
                      }
                      className="flex-1 px-5 py-4 flex items-center gap-4 hover:bg-gray-800/50 transition-colors text-left"
                    >
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-sm text-gray-300">
                            {formatDateTime(report.created_at)}
                          </span>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(report.status)}`}
                          >
                            {report.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {report.opportunities.length} opportunities
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 truncate">
                          {report.summary.length > 100
                            ? report.summary.slice(0, 100) + "..."
                            : report.summary}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm("Delete this research report?")) return;
                        setDeletingReportId(report.id);
                        fetch(`/api/research/reports/${report.id}`, { method: "DELETE" })
                          .then((res) => {
                            if (!res.ok) throw new Error("Delete failed");
                            setReports((prev) => prev.filter((r) => r.id !== report.id));
                            if (isExpanded) setExpandedReportId(null);
                          })
                          .catch(() => setError("Failed to delete report"))
                          .finally(() => setDeletingReportId(null));
                      }}
                      disabled={deletingReportId === report.id}
                      className="px-4 py-4 text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                      title="Delete report"
                    >
                      {deletingReportId === report.id ? (
                        <span className="text-xs">...</span>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Expanded: Summary + Opportunities Table */}
                  {isExpanded && (
                    <div className="border-t border-gray-800">
                      <div className="px-5 py-4 bg-gray-800/30">
                        <p className="text-sm text-gray-400 font-medium mb-1">Summary</p>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">{report.summary}</p>
                      </div>
                    </div>
                  )}
                  {isExpanded && (
                    <div className="border-t border-gray-800 overflow-x-auto">
                      {report.opportunities.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 text-sm">
                          No opportunities in this report.
                        </div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-800 text-gray-400 text-left">
                              <th className="px-4 py-3 font-medium">Niche</th>
                              <th className="px-4 py-3 font-medium">Type</th>
                              <th className="px-4 py-3 font-medium">
                                Composite
                              </th>
                              <th className="px-4 py-3 font-medium">Demand</th>
                              <th className="px-4 py-3 font-medium">
                                Competition
                              </th>
                              <th className="px-4 py-3 font-medium">Gap</th>
                              <th className="px-4 py-3 font-medium">
                                Feasibility
                              </th>
                              <th className="px-4 py-3 font-medium">Price</th>
                              <th className="px-4 py-3 font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.opportunities.map((opp) => (
                              <tr
                                key={opp.id}
                                className="border-b border-gray-800/50 last:border-0"
                              >
                                <td className="px-4 py-3 text-gray-100">
                                  {opp.niche}
                                </td>
                                <td className="px-4 py-3 text-gray-300">
                                  {opp.product_type}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${scoreColor(opp.composite_score)}`}
                                        style={{
                                          width: `${opp.composite_score * 100}%`,
                                        }}
                                      />
                                    </div>
                                    <span
                                      className={`text-xs px-1.5 py-0.5 rounded ${scoreBadgeColor(opp.composite_score)}`}
                                    >
                                      {(opp.composite_score * 100).toFixed(0)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-gray-400">
                                  {(opp.demand_score * 100).toFixed(0)}
                                </td>
                                <td className="px-4 py-3 text-gray-400">
                                  {(opp.competition_score * 100).toFixed(0)}
                                </td>
                                <td className="px-4 py-3 text-gray-400">
                                  {(opp.gap_score * 100).toFixed(0)}
                                </td>
                                <td className="px-4 py-3 text-gray-400">
                                  {(opp.feasibility_score * 100).toFixed(0)}
                                </td>
                                <td className="px-4 py-3 text-gray-300">
                                  {formatCents(opp.suggested_price_cents)}
                                </td>
                                <td className="px-4 py-3">
                                  {opp.built ? (
                                    <span className="text-xs text-gray-500">
                                      Built
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleGenerate(opp, report.id)}
                                      disabled={generatingIds.has(opp.id)}
                                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 text-white text-xs font-medium rounded transition-colors"
                                    >
                                      {generatingIds.has(opp.id)
                                        ? "Generating..."
                                        : "Generate"}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
