"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Product, ProductStatus } from "@/types";

const ALL_STATUSES: ProductStatus[] = [
  "researched",
  "analyzed",
  "generating",
  "qa_pending",
  "qa_pass",
  "qa_fail",
  "ready_for_review",
  "approved",
  "publishing",
  "published",
  "publish_failed",
];

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

function ProductsContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") ?? "all";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState(initialStatus);

  useEffect(() => {
    async function fetchProducts(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/products");
        if (!res.ok) throw new Error("Failed to fetch products");
        setProducts(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, []);

  const filteredProducts =
    statusFilter === "all"
      ? products
      : products.filter((p) => p.status === statusFilter);

  function handleStatusChange(value: string): void {
    setStatusFilter(value);
    const url =
      value === "all"
        ? "/dashboard/products"
        : `/dashboard/products?status=${value}`;
    router.replace(url, { scroll: false });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading products...</div>
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
        <h1 className="text-2xl font-bold text-white">Products</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-500">
          {products.length === 0
            ? "No products yet. Generate products from research opportunities."
            : "No products match the selected filter."}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  onClick={() =>
                    router.push(`/dashboard/products/${product.id}`)
                  }
                  className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-gray-100 font-medium">
                    {product.title}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {product.product_type}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {formatCents(product.price_cents)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeColor(product.status)}`}
                    >
                      {product.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {formatDate(product.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400 text-lg">Loading products...</div>
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
