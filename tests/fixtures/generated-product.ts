import type { GeneratedProduct } from "@/lib/ai/generator";
import { makeSpreadsheetSpec } from "./spreadsheet-spec";

export function makeGeneratedProduct(overrides?: Partial<GeneratedProduct>): GeneratedProduct {
  return {
    product_type: "spreadsheet_template",
    title: "Monthly Budget Tracker Spreadsheet Template Excel Google Sheets Financial Planner",
    description: "Track your monthly income and expenses with this professional budget tracker.\n\n**What You Get:**\n- Instructions sheet\n- Budget tracking sheet with auto-calculations\n\n**Features:**\n- Automatic difference and percentage calculations\n- Protected formula cells\n- Professional formatting\n\nWorks with Microsoft Excel (2016+) and Google Sheets.\n\nDesigned with AI assistance. Template structure and formulas created using AI tools.",
    content: makeSpreadsheetSpec(),
    tags: [
      "budget tracker",
      "monthly budget",
      "expense tracker",
      "financial planner",
      "budget spreadsheet",
      "money tracker",
      "household budget",
      "budget template",
      "excel template",
      "google sheets",
      "finance tracker",
      "spending tracker",
      "personal budget",
    ],
    price_cents: 1999,
    currency: "usd",
    thumbnail_prompt: "Professional budget tracker spreadsheet template cover image with bold title text",
    preview_prompts: [
      "Laptop mockup showing a budget spreadsheet with colorful charts and organized columns",
      "Feature callouts with checkmarks: automated calculations, multiple tabs, protected formulas",
      "Sheet overview diagram showing Instructions tab and Budget tracking tab",
      "Compatibility graphic showing Excel and Google Sheets logos side by side",
    ],
    taxonomy_id: 2078,
    ...overrides,
  };
}
