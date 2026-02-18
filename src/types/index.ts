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

export interface EtsyListingData {
  listing_id: number;
  title: string;
  description: string;
  price_cents: number;
  currency: string;
  num_favorers: number;
  views: number;
  tags: string[];
  taxonomy_id: number;
  url: string;
  shop_name: string;
  review_count: number;
  rating: number | null;
  is_digital: boolean;
  sales_estimate?: string;
  listing_quality?: string;
}

export interface ResearchRaw {
  id: string;
  run_id: string;
  source: ResearchSource;
  category: string;
  product_data: EtsyListingData;
  created_at: string;
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
    structure_quality: number;
    formula_correctness: number;
    visual_design: number;
    usability: number;
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
  image_urls: string[];
  tags: string[];
  price_cents: number;
  currency: string;
  thumbnail_prompt: string;
  qa_score: QAResult | null;
  qa_attempts: number;
  etsy_listing_id: number | null;
  etsy_url: string | null;
  taxonomy_id: number | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  product_id: string;
  etsy_receipt_id: string;
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

export interface Lesson {
  id: string;
  product_id: string | null;
  phase: "generation" | "qa" | "research";
  lesson: string;
  dimension: string | null;
  severity: number;
  source_feedback: string | null;
  status: "active" | "archived";
  created_at: string;
}

export interface DashboardSummary {
  total_products: number;
  published_count: number;
  total_revenue_cents: number;
  products_in_queue: number;
  last_research_run: string | null;
  products_by_status: Record<ProductStatus, number>;
}

// --- Spreadsheet Spec Types ---

export interface SpreadsheetSpec {
  sheets: SheetSpec[];
  color_scheme: {
    primary: string;
    secondary: string;
    accent: string;
    header_bg: string;
    header_text: string;
    alt_row_bg: string;
  };
}

export interface SheetSpec {
  name: string;
  purpose: string;
  is_instructions: boolean;
  columns: {
    letter: string;
    header: string;
    width: number;
    type: "text" | "number" | "currency" | "date" | "percentage" | "formula";
    number_format?: string;
  }[];
  rows: {
    row: number;
    is_header: boolean;
    is_total: boolean;
    is_sample: boolean;
    cells: Record<
      string,
      {
        value?: string | number | null;
        formula?: string;
        style?: {
          bold?: boolean;
          font_color?: string;
          bg_color?: string;
          h_align?: "left" | "center" | "right";
          border?: "thin" | "medium";
        };
      }
    >;
  }[];
  frozen: { rows: number; cols: number };
  merged_cells: string[];
  protected_ranges: string[];
  conditional_formats: { range: string; rule: string; style: object }[];
}

// --- Etsy Token Types ---

export interface EtsyToken {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string;
  created_at: string;
  updated_at: string;
}
