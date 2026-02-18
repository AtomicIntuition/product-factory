"use client";

import { useEffect, useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Sale, Product } from "@/types";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function toDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface DailyRevenue {
  date: string;
  revenue: number;
}

interface ProductSales {
  product: string;
  product_id: string;
  sales: number;
  revenue: number;
  avgPrice: number;
}

export default function AnalyticsPage(): React.ReactElement {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const [salesRes, productsRes] = await Promise.all([
          fetch("/api/analytics/sales"),
          fetch("/api/products"),
        ]);

        if (!salesRes.ok) throw new Error("Failed to fetch sales");
        if (!productsRes.ok) throw new Error("Failed to fetch products");

        const salesData: Sale[] = await salesRes.json();
        const productsData: Product[] = await productsRes.json();

        setSales(salesData);
        setProducts(productsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const filteredSales = useMemo(() => {
    let result = sales;
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((s) => new Date(s.sale_timestamp) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1); // include the end date
      result = result.filter((s) => new Date(s.sale_timestamp) < to);
    }
    return result;
  }, [sales, dateFrom, dateTo]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const dailyRevenue: DailyRevenue[] = useMemo(() => {
    const map = new Map<string, number>();
    filteredSales.forEach((s) => {
      const key = toDateKey(s.sale_timestamp);
      map.set(key, (map.get(key) ?? 0) + s.amount_cents);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({ date, revenue: revenue / 100 }));
  }, [filteredSales]);

  const productSales: ProductSales[] = useMemo(() => {
    const map = new Map<
      string,
      { sales: number; revenue: number; title: string }
    >();
    filteredSales.forEach((s) => {
      const existing = map.get(s.product_id) ?? {
        sales: 0,
        revenue: 0,
        title: productMap.get(s.product_id)?.title ?? "Unknown",
      };
      existing.sales += 1;
      existing.revenue += s.amount_cents;
      map.set(s.product_id, existing);
    });
    return Array.from(map.entries())
      .map(([product_id, data]) => ({
        product: data.title,
        product_id,
        sales: data.sales,
        revenue: data.revenue,
        avgPrice: data.sales > 0 ? data.revenue / data.sales : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, productMap]);

  const barData = useMemo(() => {
    return productSales.map((ps) => ({
      name: ps.product.length > 20 ? ps.product.slice(0, 20) + "..." : ps.product,
      sales: ps.sales,
    }));
  }, [productSales]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading analytics...</div>
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
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Analytics</h1>

      {/* Date Range Picker */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {filteredSales.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-500">
          No sales data available for the selected period.
        </div>
      ) : (
        <>
          {/* Revenue Over Time */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Revenue Over Time
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyRevenue}>
                  <defs>
                    <linearGradient
                      id="revenueGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#3b82f6"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="#3b82f6"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    stroke="#9ca3af"
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                      color: "#f3f4f6",
                    }}
                    formatter={(value: number | undefined) => [
                      `$${(value ?? 0).toFixed(2)}`,
                      "Revenue",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sales Per Product */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Sales Per Product
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="name"
                    stroke="#9ca3af"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                      color: "#f3f4f6",
                    }}
                  />
                  <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Performing Products Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">
                Top Performing Products
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="px-6 py-3 font-medium">Product</th>
                  <th className="px-6 py-3 font-medium">Total Sales</th>
                  <th className="px-6 py-3 font-medium">Gross Revenue</th>
                  <th className="px-6 py-3 font-medium">Est. Net Revenue</th>
                  <th className="px-6 py-3 font-medium">Avg. Sale Price</th>
                </tr>
              </thead>
              <tbody>
                {productSales.map((ps) => {
                  // Etsy fees: $0.20 listing + 6.5% transaction + 3% + $0.25 payment processing
                  const listingFees = ps.sales * 20; // $0.20 per sale in cents
                  const transactionFees = Math.round(ps.revenue * 0.065);
                  const processingFees = Math.round(ps.revenue * 0.03) + ps.sales * 25; // 3% + $0.25
                  const totalFees = listingFees + transactionFees + processingFees;
                  const netRevenue = ps.revenue - totalFees;
                  return (
                    <tr
                      key={ps.product_id}
                      className="border-b border-gray-800/50 last:border-0"
                    >
                      <td className="px-6 py-3 text-gray-100 font-medium">
                        {ps.product}
                      </td>
                      <td className="px-6 py-3 text-gray-300">{ps.sales}</td>
                      <td className="px-6 py-3 text-gray-300">
                        {formatCents(ps.revenue)}
                      </td>
                      <td className="px-6 py-3 text-green-400">
                        {formatCents(netRevenue)}
                      </td>
                      <td className="px-6 py-3 text-gray-300">
                        {formatCents(Math.round(ps.avgPrice))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Etsy Fee Breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-3">
              Etsy Fee Breakdown
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              Estimated fees per sale (digital listings):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-gray-500 mb-1">Listing Fee</p>
                <p className="text-gray-200 font-medium">$0.20 / listing</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-gray-500 mb-1">Transaction Fee</p>
                <p className="text-gray-200 font-medium">6.5% of sale price</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-gray-500 mb-1">Payment Processing</p>
                <p className="text-gray-200 font-medium">3% + $0.25</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-gray-500 mb-1">Total (approx.)</p>
                <p className="text-gray-200 font-medium">~15% of sale price</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
