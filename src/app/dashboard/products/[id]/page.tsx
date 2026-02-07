"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import type { Product, ProductStatus } from "@/types";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function statusBadgeColor(status: ProductStatus): string {
  switch (status) {
    case "published":
      return "bg-green-600/20 text-green-400";
    case "ready_for_review":
    case "approved":
      return "bg-blue-600/20 text-blue-400";
    case "generating":
    case "qa_pending":
    case "qa_pass":
      return "bg-yellow-600/20 text-yellow-400";
    case "qa_fail":
    case "publish_failed":
      return "bg-red-600/20 text-red-400";
    default:
      return "bg-gray-600/20 text-gray-400";
  }
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  // QA scores are 1-10, convert to percentage
  const pct = Math.round(value * 10);
  let barColor = "bg-gray-500";
  if (pct >= 80) barColor = "bg-green-500";
  else if (pct >= 60) barColor = "bg-blue-500";
  else if (pct >= 40) barColor = "bg-yellow-500";
  else barColor = "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-400 w-32 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-gray-300 w-10 text-right">{pct}</span>
    </div>
  );
}

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(params);
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showContent, setShowContent] = useState(false);

  // Editable fields
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editTags, setEditTags] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const res = await fetch(`/api/products/${id}`);
        if (!res.ok) throw new Error("Failed to fetch product");
        const data: Product = await res.json();
        setProduct(data);
        setEditTitle(data.title);
        setEditDescription(data.description);
        setEditPrice((data.price_cents / 100).toFixed(2));
        setEditTags(data.tags.join(", "));
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchProduct();
  }, [id]);

  async function handlePatch(updates: Partial<Product>) {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update product");
      const updated = await res.json();
      setProduct(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePipelineAction(action: string) {
    setActionLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { productId: id };
      if (action === "generate" && product) {
        params.opportunityId = product.opportunity_id;
        params.reportId = product.report_id;
        params.opportunity = product; // backend will validate what it needs
      }
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, params }),
      });
      if (!res.ok) throw new Error(`Failed to run ${action}`);

      // Refresh product data
      const productRes = await fetch(`/api/products/${id}`);
      if (productRes.ok) {
        setProduct(await productRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSave() {
    setSaveLoading(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const priceCents = Math.round(parseFloat(editPrice) * 100);
      if (isNaN(priceCents) || priceCents < 0) {
        throw new Error("Invalid price");
      }
      const tags = editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          price_cents: priceCents,
          tags,
        }),
      });
      if (!res.ok) throw new Error("Failed to save changes");
      const updated = await res.json();
      setProduct(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaveLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading product...</div>
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-red-900/30 border border-red-700 text-red-300 px-6 py-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Product not found.</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Back button */}
      <button
        onClick={() => router.push("/dashboard/products")}
        className="text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Products
      </button>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Product Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{product.title}</h1>
            <p className="text-gray-400 mt-1">{product.product_type}</p>
          </div>
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusBadgeColor(product.status)}`}
          >
            {product.status.replace(/_/g, " ")}
          </span>
        </div>

        <p className="text-gray-300 mb-4">{product.description}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Price</span>
            <p className="text-gray-100 font-medium">
              {formatCents(product.price_cents)} {product.currency}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Tags</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {product.tags.length > 0 ? (
                product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-gray-600">None</span>
              )}
            </div>
          </div>
          <div>
            <span className="text-gray-500">Created</span>
            <p className="text-gray-100">{formatDate(product.created_at)}</p>
          </div>
          <div>
            <span className="text-gray-500">Updated</span>
            <p className="text-gray-100">{formatDate(product.updated_at)}</p>
          </div>
        </div>

        {product.gumroad_url && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <a
              href={product.gumroad_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm underline"
            >
              View on Gumroad
            </a>
          </div>
        )}
      </div>

      {/* Thumbnail + Download */}
      {(product.thumbnail_url || product.content_file_url) && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Product Assets</h2>
          <div className="flex flex-wrap gap-6">
            {product.thumbnail_url && (
              <div>
                <p className="text-sm text-gray-400 mb-2">Thumbnail</p>
                <img
                  src={product.thumbnail_url}
                  alt={`${product.title} thumbnail`}
                  className="w-48 h-48 object-cover rounded-lg border border-gray-700"
                />
              </div>
            )}
            {product.content_file_url && (
              <div className="flex items-end">
                <a
                  href={product.content_file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-700 text-blue-400 rounded-lg transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {product.status === "ready_for_review" && (
          <>
            <button
              onClick={() => handlePatch({ status: "approved" as ProductStatus })}
              disabled={actionLoading}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
            >
              {actionLoading ? "Processing..." : "Approve"}
            </button>
            <button
              onClick={() => handlePatch({ status: "qa_fail" as ProductStatus })}
              disabled={actionLoading}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
            >
              Reject
            </button>
          </>
        )}

        {product.status === "approved" && (
          <button
            onClick={() => handlePipelineAction("publish")}
            disabled={actionLoading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {actionLoading ? "Publishing..." : "Publish"}
          </button>
        )}

        {product.status === "publish_failed" && (
          <button
            onClick={() => handlePipelineAction("publish")}
            disabled={actionLoading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {actionLoading ? "Retrying..." : "Retry Publish"}
          </button>
        )}

        {product.status === "qa_fail" && (
          <button
            onClick={() => handlePipelineAction("generate")}
            disabled={actionLoading}
            className="px-5 py-2.5 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {actionLoading ? "Regenerating..." : "Retry Generation"}
          </button>
        )}

        <button
          onClick={async () => {
            if (!confirm("Delete this product? This cannot be undone.")) return;
            setActionLoading(true);
            try {
              const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
              if (!res.ok) throw new Error("Failed to delete product");
              router.push("/dashboard/products");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Delete failed");
              setActionLoading(false);
            }
          }}
          disabled={actionLoading}
          className="px-5 py-2.5 bg-red-600/20 hover:bg-red-600/40 border border-red-700 disabled:opacity-60 text-red-400 font-medium rounded-lg transition-colors text-sm"
        >
          {actionLoading ? "Deleting..." : "Delete Product"}
        </button>
      </div>

      {/* QA Results */}
      {product.qa_score && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">QA Results</h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                product.qa_score.passed
                  ? "bg-green-600/20 text-green-400"
                  : "bg-red-600/20 text-red-400"
              }`}
            >
              {product.qa_score.passed ? "PASSED" : "FAILED"}
            </span>
          </div>
          <p className="text-sm text-gray-400 mb-1">
            Attempt {product.qa_score.attempt} of {product.qa_attempts}
          </p>
          <div className="space-y-3 mt-4">
            <ScoreBar
              label="Content Length"
              value={product.qa_score.scores.content_length}
            />
            <ScoreBar
              label="Uniqueness"
              value={product.qa_score.scores.uniqueness}
            />
            <ScoreBar
              label="Relevance"
              value={product.qa_score.scores.relevance}
            />
            <ScoreBar
              label="Quality"
              value={product.qa_score.scores.quality}
            />
            <ScoreBar
              label="Listing Copy"
              value={product.qa_score.scores.listing_copy}
            />
          </div>
          {product.qa_score.feedback && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-sm text-gray-400 font-medium mb-1">
                Feedback
              </p>
              <p className="text-sm text-gray-300">
                {product.qa_score.feedback}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Content Preview */}
      {product.content && Object.keys(product.content).length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <button
            onClick={() => setShowContent(!showContent)}
            className="flex items-center gap-2 text-lg font-semibold text-white hover:text-gray-200 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showContent ? "rotate-90" : ""}`}
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
            Content Preview
          </button>
          {showContent && (
            <pre className="mt-4 bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 overflow-x-auto max-h-96 overflow-y-auto">
              {JSON.stringify(product.content, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Thumbnail Prompt */}
      {product.thumbnail_prompt && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-2">
            Thumbnail Prompt
          </h2>
          <p className="text-sm text-gray-400 mb-1">
            {product.thumbnail_url ? "Generated from:" : "Thumbnail generation failed or was skipped. Prompt:"}
          </p>
          <p className="text-sm text-gray-300 bg-gray-800 border border-gray-700 rounded-lg p-4">
            {product.thumbnail_prompt}
          </p>
        </div>
      )}

      {/* Edit Fields */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Edit Product</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Description
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-y"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Price ($)
              </label>
              <input
                type="text"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saveLoading}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
            >
              {saveLoading ? "Saving..." : "Save Changes"}
            </button>
            {saveSuccess && (
              <span className="text-green-400 text-sm">Saved!</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
