"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Product, ProductStatus, SpreadsheetSpec } from "@/types";

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
    case "publishing":
      return "bg-yellow-600/20 text-yellow-400";
    case "qa_fail":
    case "publish_failed":
      return "bg-red-600/20 text-red-400";
    default:
      return "bg-gray-600/20 text-gray-400";
  }
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 10);
  let barColor = "bg-gray-500";
  if (pct >= 80) barColor = "bg-green-500";
  else if (pct >= 60) barColor = "bg-blue-500";
  else if (pct >= 40) barColor = "bg-yellow-500";
  else barColor = "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-400 w-40 shrink-0">{label}</span>
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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg transition-colors text-xs font-medium"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

function SpreadsheetPreview({ content }: { content: Record<string, unknown> }) {
  const spec = content as unknown as SpreadsheetSpec;
  if (!spec?.sheets) return null;

  return (
    <div className="space-y-4">
      {spec.sheets.map((sheet, i) => (
        <div key={i} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-gray-100">{sheet.name}</span>
            {sheet.is_instructions && (
              <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full">Instructions</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-2">{sheet.purpose}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-gray-500">{sheet.columns.length} columns</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-500">{sheet.rows.length} rows</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-500">
              {sheet.rows.flatMap(r => Object.values(r.cells).filter(c => c.formula)).length} formulas
            </span>
            {sheet.frozen.rows > 0 && (
              <>
                <span className="text-gray-600">|</span>
                <span className="text-gray-500">frozen: {sheet.frozen.rows}R</span>
              </>
            )}
          </div>
          {sheet.columns.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {sheet.columns.map((col) => (
                <span key={col.letter} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                  {col.letter}: {col.header}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      {spec.color_scheme && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Colors:</span>
          {Object.entries(spec.color_scheme).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1" title={key}>
              <div className="w-4 h-4 rounded border border-gray-600" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-600">{key.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      )}
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
  const [publishProgress, setPublishProgress] = useState<string | null>(null);

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
      const actionParams: Record<string, unknown> = { productId: id };
      if (action === "generate" && product) {
        actionParams.opportunityId = product.opportunity_id;
        actionParams.reportId = product.report_id;
        actionParams.opportunity = product;
      }
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, params: actionParams }),
      });
      if (!res.ok) throw new Error(`Failed to run ${action}`);

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

  async function handlePublishToEtsy() {
    setActionLoading(true);
    setError(null);
    setPublishProgress("Creating draft listing...");
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", params: { productId: id } }),
      });
      if (!res.ok) throw new Error("Failed to start publishing");

      setPublishProgress("Publishing in progress... This may take a minute.");

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const productRes = await fetch(`/api/products/${id}`);
          if (productRes.ok) {
            const updated: Product = await productRes.json();
            setProduct(updated);
            if (updated.status === "published") {
              setPublishProgress(null);
              clearInterval(pollInterval);
              setActionLoading(false);
            } else if (updated.status === "publish_failed") {
              setPublishProgress(null);
              setError("Publishing failed. Check the product status for details.");
              clearInterval(pollInterval);
              setActionLoading(false);
            }
          }
        } catch {
          // Ignore poll errors
        }
      }, 5000);

      // Safety timeout
      setTimeout(() => {
        clearInterval(pollInterval);
        setActionLoading(false);
        setPublishProgress(null);
      }, 120000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
      setActionLoading(false);
      setPublishProgress(null);
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

  const showPublishButton = product.status === "approved" || product.status === "publish_failed" || product.status === "ready_for_review";

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Back button */}
      <button
        onClick={() => router.push("/dashboard/products")}
        className="text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Products
      </button>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {publishProgress && (
        <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-300 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {publishProgress}
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

        <p className="text-gray-300 mb-4 whitespace-pre-wrap">{product.description}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Price</span>
            <p className="text-gray-100 font-medium">
              {formatCents(product.price_cents)} {product.currency}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Tags ({product.tags.length}/13)</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {product.tags.length > 0 ? (
                product.tags.map((tag) => (
                  <span key={tag} className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded">
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

        {product.etsy_url && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <a
              href={product.etsy_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 text-sm underline"
            >
              View on Etsy
            </a>
          </div>
        )}
      </div>

      {/* Product Assets — Images Grid + Download */}
      {(product.image_urls?.length > 0 || product.thumbnail_url || product.content_file_url) && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Product Assets</h2>

          {/* Image Grid */}
          {product.image_urls?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
              {product.image_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={url}
                    alt={`Listing image ${i + 1}`}
                    className="w-full aspect-square object-cover rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
                  />
                </a>
              ))}
            </div>
          )}

          {/* Fallback single thumbnail */}
          {!product.image_urls?.length && product.thumbnail_url && (
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-2">Thumbnail</p>
              <img
                src={product.thumbnail_url}
                alt={`${product.title} thumbnail`}
                className="w-48 h-48 object-cover rounded-lg border border-gray-700"
              />
            </div>
          )}

          {/* Download Spreadsheet */}
          {product.content_file_url && (
            <a
              href={product.content_file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600/20 hover:bg-green-600/30 border border-green-700 text-green-400 rounded-lg transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Spreadsheet (.xlsx)
            </a>
          )}
        </div>
      )}

      {/* Publish to Etsy */}
      {showPublishButton && product.status !== "published" && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Publish to Etsy</h2>
          <p className="text-sm text-gray-400 mb-4">
            Automatically creates a listing, uploads images and the spreadsheet file, and activates it on Etsy.
          </p>
          <button
            onClick={handlePublishToEtsy}
            disabled={actionLoading}
            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm flex items-center gap-2"
          >
            {actionLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Publishing...
              </>
            ) : (
              "Publish to Etsy"
            )}
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {product.status === "ready_for_review" && (
          <button
            onClick={() => handlePatch({ status: "approved" as ProductStatus })}
            disabled={actionLoading}
            className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {actionLoading ? "Processing..." : "Approve"}
          </button>
        )}

        {(product.status === "ready_for_review" || product.status === "qa_fail") && (
          <button
            onClick={() => handlePatch({ status: "qa_fail" as ProductStatus })}
            disabled={actionLoading}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
          >
            Reject
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
            <ScoreBar label="Structure Quality" value={product.qa_score.scores.structure_quality} />
            <ScoreBar label="Formula Correctness" value={product.qa_score.scores.formula_correctness} />
            <ScoreBar label="Visual Design" value={product.qa_score.scores.visual_design} />
            <ScoreBar label="Usability" value={product.qa_score.scores.usability} />
            <ScoreBar label="Listing Copy" value={product.qa_score.scores.listing_copy} />
          </div>
          {product.qa_score.feedback && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-sm text-gray-400 font-medium mb-1">Feedback</p>
              <p className="text-sm text-gray-300">{product.qa_score.feedback}</p>
            </div>
          )}
        </div>
      )}

      {/* Spreadsheet Preview */}
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Spreadsheet Preview
          </button>
          {showContent && (
            <div className="mt-4">
              <SpreadsheetPreview content={product.content} />
            </div>
          )}
        </div>
      )}

      {/* Thumbnail Prompt */}
      {product.thumbnail_prompt && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Image Prompts</h2>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500 mb-1">Main Cover</p>
              <p className="text-sm text-gray-300 bg-gray-800 border border-gray-700 rounded-lg p-3">
                {product.thumbnail_prompt}
              </p>
            </div>
          </div>
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
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-y"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Price ($)</label>
              <input
                type="text"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Tags (comma-separated, 13 max)</label>
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
