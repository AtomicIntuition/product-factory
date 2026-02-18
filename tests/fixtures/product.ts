import type { Product } from "@/types";
import { makeSpreadsheetSpec } from "./spreadsheet-spec";

export function makeProduct(overrides?: Partial<Product>): Product {
  const spec = makeSpreadsheetSpec();
  return {
    id: "prod-001",
    opportunity_id: "opp-001",
    report_id: "rpt-001",
    product_type: "spreadsheet_template",
    title: "Monthly Budget Tracker Spreadsheet Template Excel Google Sheets Financial Planner",
    description: "Track your monthly income and expenses with this professional budget tracker.\n\nDesigned with AI assistance. Template structure and formulas created using AI tools.",
    content: {
      ...spec,
      preview_prompts: [
        "Laptop mockup showing a budget spreadsheet",
        "Feature callouts with checkmarks",
        "Sheet overview diagram",
        "Compatibility graphic",
      ],
    } as unknown as Record<string, unknown>,
    content_file_url: "https://storage.example.com/products/prod-001/template.xlsx",
    thumbnail_url: "https://storage.example.com/products/prod-001/image-1.png",
    image_urls: [
      "https://storage.example.com/products/prod-001/image-1.png",
      "https://storage.example.com/products/prod-001/image-2.png",
      "https://storage.example.com/products/prod-001/image-3.png",
    ],
    tags: [
      "budget tracker", "monthly budget", "expense tracker", "financial planner",
      "budget spreadsheet", "money tracker", "household budget", "budget template",
      "excel template", "google sheets", "finance tracker", "spending tracker",
      "personal budget",
    ],
    price_cents: 1999,
    currency: "usd",
    thumbnail_prompt: "Professional budget tracker spreadsheet template cover image",
    qa_score: {
      passed: true,
      scores: {
        structure_quality: 8,
        formula_correctness: 9,
        visual_design: 7,
        usability: 8,
        listing_copy: 7,
      },
      feedback: "Good quality template. All formulas look correct.",
      attempt: 1,
    },
    qa_attempts: 1,
    etsy_listing_id: null,
    etsy_url: null,
    taxonomy_id: 2078,
    status: "ready_for_review",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}
