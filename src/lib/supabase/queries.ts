import { getSupabaseAdmin } from "./client";
import type {
  ResearchRaw,
  ResearchReport,
  Product,
  Sale,
  PipelineRun,
  ProductStatus,
  DashboardSummary,
} from "@/types";

const db = () => getSupabaseAdmin();

// --- Research ---

export async function insertResearchRaw(rows: Omit<ResearchRaw, "id" | "created_at">[]): Promise<ResearchRaw[]> {
  const { data, error } = await db().from("research_raw").insert(rows).select();
  if (error) throw error;
  return data;
}

export async function getResearchRawByRunId(runId: string): Promise<ResearchRaw[]> {
  const { data, error } = await db()
    .from("research_raw")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

// --- Reports ---

export async function insertReport(report: Omit<ResearchReport, "id" | "created_at">): Promise<ResearchReport> {
  const { data, error } = await db().from("research_reports").insert(report).select().single();
  if (error) throw error;
  return data;
}

export async function getReports(status?: "active" | "archived"): Promise<ResearchReport[]> {
  let q = db().from("research_reports").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getReportById(id: string): Promise<ResearchReport> {
  const { data, error } = await db().from("research_reports").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// --- Products ---

export async function insertProduct(product: Omit<Product, "id" | "created_at" | "updated_at">): Promise<Product> {
  const { data, error } = await db().from("products").insert(product).select().single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
  const { data, error } = await db()
    .from("products")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getProducts(filters?: { status?: ProductStatus; product_type?: string }): Promise<Product[]> {
  let q = db().from("products").select("*").order("created_at", { ascending: false });
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.product_type) q = q.eq("product_type", filters.product_type);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getProductById(id: string): Promise<Product> {
  const { data, error } = await db().from("products").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await db().from("products").delete().eq("id", id);
  if (error) throw error;
}

// --- Sales ---

export async function insertSale(sale: Omit<Sale, "id" | "created_at">): Promise<Sale> {
  const { data, error } = await db().from("sales").insert(sale).select().single();
  if (error) throw error;
  return data;
}

export async function getSales(filters?: { product_id?: string; from?: string; to?: string }): Promise<Sale[]> {
  let q = db().from("sales").select("*").order("sale_timestamp", { ascending: false });
  if (filters?.product_id) q = q.eq("product_id", filters.product_id);
  if (filters?.from) q = q.gte("sale_timestamp", filters.from);
  if (filters?.to) q = q.lte("sale_timestamp", filters.to);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// --- Pipeline Runs ---

export async function insertPipelineRun(run: Omit<PipelineRun, "id">): Promise<PipelineRun> {
  const { data, error } = await db().from("pipeline_runs").insert(run).select().single();
  if (error) throw error;
  return data;
}

export async function updatePipelineRun(
  id: string,
  updates: Partial<PipelineRun>,
): Promise<PipelineRun> {
  const { data, error } = await db().from("pipeline_runs").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function getLatestPipelineRuns(): Promise<PipelineRun[]> {
  const { data, error } = await db()
    .from("pipeline_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

// --- Dashboard Summary ---

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [productsRes, salesRes, runsRes] = await Promise.all([
    db().from("products").select("status"),
    db().from("sales").select("amount_cents"),
    db().from("pipeline_runs").select("phase, started_at").eq("phase", "research").order("started_at", { ascending: false }).limit(1),
  ]);

  if (productsRes.error) throw productsRes.error;
  if (salesRes.error) throw salesRes.error;
  if (runsRes.error) throw runsRes.error;

  const products = productsRes.data || [];
  const sales = salesRes.data || [];
  const runs = runsRes.data || [];

  const statusCounts = {} as Record<ProductStatus, number>;
  for (const p of products) {
    statusCounts[p.status as ProductStatus] = (statusCounts[p.status as ProductStatus] || 0) + 1;
  }

  const queueStatuses: ProductStatus[] = ["researched", "analyzed", "generating", "qa_pending", "qa_pass", "ready_for_review", "approved", "publishing"];

  return {
    total_products: products.length,
    published_count: statusCounts["published"] || 0,
    total_revenue_cents: sales.reduce((sum, s) => sum + s.amount_cents, 0),
    products_in_queue: queueStatuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0),
    last_research_run: runs[0]?.started_at || null,
    products_by_status: statusCounts,
  };
}
