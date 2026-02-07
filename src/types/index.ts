export type ProductStatus =
  | "researched"
  | "analyzed"
  | "generating"
  | "qa_pending"
  | "qa_pass"
  | "qa_fail"
  | "ready_for_review"
  | "approved"
  | "publishing"
  | "published"
  | "publish_failed";

export type PipelinePhase =
  | "research"
  | "analyze"
  | "generate"
  | "qa"
  | "publish";

export type PipelineRunStatus = "running" | "completed" | "failed";

export type ResearchSource = "web_search" | "scrape" | "manual_seed";

export interface ResearchRaw {
  id: string;
  run_id: string;
  source: ResearchSource;
  category: string;
  product_data: GumroadProductData;
  created_at: string;
}

export interface GumroadProductData {
  title: string;
  description: string;
  price_cents: number;
  currency: string;
  rating: number | null;
  review_count: number;
  seller_name: string;
  seller_id: string;
  url: string;
  tags: string[];
  category: string;
}

export interface Opportunity {
  id: string;
  niche: string;
  product_type: string;
  description: string;
  demand_score: number;
  competition_score: number;
  gap_score: number;
  feasibility_score: number;
  composite_score: number;
  rationale: string;
  competitor_prices: number[];
  suggested_price_cents: number;
  built: boolean;
}

export interface ResearchReport {
  id: string;
  run_id: string;
  opportunities: Opportunity[];
  summary: string;
  status: "active" | "archived";
  created_at: string;
}

export interface QAResult {
  passed: boolean;
  scores: {
    content_length: number;
    uniqueness: number;
    relevance: number;
    quality: number;
    listing_copy: number;
  };
  feedback: string;
  attempt: number;
}

export interface Product {
  id: string;
  opportunity_id: string;
  report_id: string;
  product_type: string;
  title: string;
  description: string;
  content: Record<string, unknown>;
  content_file_url: string | null;
  thumbnail_url: string | null;
  tags: string[];
  price_cents: number;
  currency: string;
  thumbnail_prompt: string;
  qa_score: QAResult | null;
  qa_attempts: number;
  gumroad_id: string | null;
  gumroad_url: string | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  product_id: string;
  gumroad_sale_id: string;
  amount_cents: number;
  currency: string;
  buyer_email: string;
  sale_timestamp: string;
  created_at: string;
}

export interface PipelineRun {
  id: string;
  phase: PipelinePhase;
  status: PipelineRunStatus;
  metadata: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
}

export interface DashboardSummary {
  total_products: number;
  published_count: number;
  total_revenue_cents: number;
  products_in_queue: number;
  last_research_run: string | null;
  products_by_status: Record<ProductStatus, number>;
}
