"use client";

import { useEffect, useState } from "react";
import type { Lesson } from "@/types";

const SEVERITY_COLORS: Record<number, string> = {
  1: "bg-gray-600/20 text-gray-400",
  2: "bg-blue-600/20 text-blue-400",
  3: "bg-yellow-600/20 text-yellow-400",
  4: "bg-orange-600/20 text-orange-400",
  5: "bg-red-600/20 text-red-400",
};

const DIMENSION_COLORS: Record<string, string> = {
  structure_quality: "bg-purple-600/20 text-purple-400",
  formula_correctness: "bg-cyan-600/20 text-cyan-400",
  visual_design: "bg-green-600/20 text-green-400",
  usability: "bg-blue-600/20 text-blue-400",
  listing_copy: "bg-pink-600/20 text-pink-400",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function LessonsPage(): React.ReactElement {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "archived">("all");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLessons(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const url = filter === "all" ? "/api/lessons" : `/api/lessons?status=${filter}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch lessons");
        setLessons(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }
    fetchLessons();
  }, [filter]);

  async function handleDelete(id: string): Promise<void> {
    if (!confirm("Delete this lesson?")) return;
    setActionInProgress(id);
    try {
      const res = await fetch(`/api/lessons?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setLessons((prev) => prev.filter((l) => l.id !== id));
    } catch {
      setError("Failed to delete lesson");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleToggleStatus(lesson: Lesson): Promise<void> {
    const newStatus = lesson.status === "active" ? "archived" : "active";
    setActionInProgress(lesson.id);
    try {
      const res = await fetch("/api/lessons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lesson.id, status: newStatus }),
      });
      if (!res.ok) throw new Error("Update failed");
      setLessons((prev) =>
        prev.map((l) => (l.id === lesson.id ? { ...l, status: newStatus } : l)),
      );
    } catch {
      setError("Failed to update lesson");
    } finally {
      setActionInProgress(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading lessons...</div>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lessons</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rules learned from QA evaluations. Injected into the generator before each run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Filter:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "active" | "archived")}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {lessons.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-500">
          No lessons yet. Lessons are extracted automatically after each QA evaluation.
        </div>
      ) : (
        <div className="space-y-3">
          {lessons.map((lesson) => (
            <div
              key={lesson.id}
              className={`bg-gray-900 border rounded-lg p-4 ${
                lesson.status === "archived"
                  ? "border-gray-800/50 opacity-60"
                  : "border-gray-800"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-gray-100 text-sm leading-relaxed">
                    {lesson.lesson}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        SEVERITY_COLORS[lesson.severity] ?? SEVERITY_COLORS[3]
                      }`}
                    >
                      severity {lesson.severity}
                    </span>
                    {lesson.dimension && (
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          DIMENSION_COLORS[lesson.dimension] ?? "bg-gray-600/20 text-gray-400"
                        }`}
                      >
                        {lesson.dimension.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700/30 text-gray-500">
                      {lesson.status}
                    </span>
                    <span className="text-xs text-gray-600">
                      {formatDate(lesson.created_at)}
                    </span>
                  </div>
                  {lesson.source_feedback && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">
                        Source feedback
                      </summary>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed whitespace-pre-wrap">
                        {lesson.source_feedback}
                      </p>
                    </details>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleStatus(lesson)}
                    disabled={actionInProgress === lesson.id}
                    className="text-gray-500 hover:text-gray-300 disabled:opacity-40 transition-colors px-2 py-1 text-xs"
                    title={lesson.status === "active" ? "Archive" : "Activate"}
                  >
                    {lesson.status === "active" ? "Archive" : "Activate"}
                  </button>
                  <button
                    onClick={() => handleDelete(lesson.id)}
                    disabled={actionInProgress === lesson.id}
                    className="text-red-500 hover:text-red-400 disabled:opacity-40 transition-colors p-1"
                    title="Delete lesson"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
