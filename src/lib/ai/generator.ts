import { promptClaude } from "@/lib/ai/client";
import { getActiveLessons } from "@/lib/supabase/queries";
import type { Opportunity, Lesson, SpreadsheetSpec, SheetSpec } from "@/types";

export interface GeneratedProduct {
  product_type: string;
  title: string;
  description: string;
  content: SpreadsheetSpec;
  tags: string[];
  price_cents: number;
  currency: string;
  thumbnail_prompt: string;
  preview_prompts: string[];
  taxonomy_id: number;
}

// Phase 1 output: product metadata + sheet plan
interface ProductBlueprint {
  product_type: string;
  title: string;
  description: string;
  tags: string[];
  price_cents: number;
  currency: string;
  taxonomy_id: number;
  thumbnail_prompt: string;
  preview_prompts: string[];
  sheets: {
    name: string;
    purpose: string;
    column_plan: string;
    formula_plan: string;
  }[];
  color_scheme: {
    primary: string;
    secondary: string;
    accent: string;
    header_bg: string;
    header_text: string;
    alt_row_bg: string;
  };
}

function formatLessonsBlock(lessons: Lesson[]): string {
  if (lessons.length === 0) return "";
  const lines = lessons.map(
    (l, i) => `${i + 1}. [severity ${l.severity}] ${l.lesson}`,
  );
  return `\n\nLESSONS FROM PREVIOUS PRODUCTS (follow these strictly):\n${lines.join("\n")}`;
}

async function generateBlueprint(params: {
  opportunity: Opportunity;
  attempt: number;
  previousFeedback?: string;
  lessonsBlock: string;
  marketIntelligence?: string;
}): Promise<ProductBlueprint> {
  const feedbackContext = params.previousFeedback
    ? `\n\nIMPORTANT — PREVIOUS ATTEMPT FEEDBACK (attempt ${params.attempt - 1}):\n${params.previousFeedback}\n\nAddress every issue mentioned above.`
    : "";

  const system = `You are an expert spreadsheet template designer and Etsy listing copywriter. You create professional Excel/Google Sheets templates that sell on Etsy.

Create a product BLUEPRINT — the metadata, listing copy, and sheet structure plan. The actual sheet data will be generated separately.

Requirements:

1. TITLE: Etsy SEO-optimized, keywords FIRST, under 140 characters. Include terms buyers search for.
   - Good: "Monthly Budget Tracker Spreadsheet Template Excel Google Sheets Financial Planner"
   - Bad: "Beautiful Budget Tracker" (keywords not first)

2. DESCRIPTION: Full Etsy listing description. Must include:
   - What You Get section (list all tabs/sheets and what each does)
   - Who It's For section (target buyer personas)
   - How to Use section (quick start guide)
   - Features section (formulas, auto-calculations, etc.)
   - Software requirements: "Works with Microsoft Excel (2016+) and Google Sheets"
   - AI DISCLOSURE (required): "Designed with AI assistance. Template structure and formulas created using AI tools."
   - 300-600 words, scannable with bullet points

3. TAGS: Exactly 13 long-tail Etsy tags. No plurals of title words. Each tag max 20 chars.

4. PRICE: In cents. $10-40 range based on complexity. Multi-tab solutions: $15-40. Simple trackers: $10-15.

5. TAXONOMY_ID: Etsy category ID (2078 for Templates, or find more specific)

6. SHEETS: Plan 3-7 sheets. FIRST sheet MUST be "Instructions".
   - Each sheet needs: name, purpose, column plan (what columns), formula plan (what calculations)
   - Design for Google Sheets compatibility: NO data validation dropdowns, NO macros, NO VBA, NO pivot tables
   - Use standard formulas ONLY: SUM, AVERAGE, IF, SUMIF, SUMIFS, VLOOKUP, COUNTIF, MAX, MIN, TODAY, TEXT, CONCATENATE
   - Include 5-10 rows of realistic sample data per data sheet
   - Protect formula cells from accidental editing
   - Use alternating row colors for readability

7. COLOR_SCHEME: Professional hex colors. Not garish.

8. IMAGE PROMPTS: 5 total (1 main cover + 4 previews):
   - thumbnail_prompt: Main product cover — bold title text, professional background, "Spreadsheet Template" callout
   - preview_prompts[0]: Laptop mockup showing the spreadsheet in use
   - preview_prompts[1]: Feature callouts with checkmarks (automated calculations, multiple tabs, etc.)
   - preview_prompts[2]: Sheet overview — what each tab contains
   - preview_prompts[3]: Compatibility graphic — "Works in Excel + Google Sheets"${params.lessonsBlock}${params.marketIntelligence ? `\n\nMARKET INTELLIGENCE FROM RESEARCH:\n${params.marketIntelligence}\n\nUse the market analysis above to craft a listing that competes with the best-performing templates.` : ""}

Return ONLY valid JSON:
{
  "product_type": "spreadsheet_template",
  "title": "string (Etsy SEO title, keywords first, under 140 chars)",
  "description": "string (full Etsy listing description with markdown)",
  "tags": ["string", ... exactly 13 tags],
  "price_cents": number,
  "currency": "usd",
  "taxonomy_id": number,
  "thumbnail_prompt": "string",
  "preview_prompts": ["string", "string", "string", "string"],
  "sheets": [
    {"name": "string", "purpose": "string", "column_plan": "string", "formula_plan": "string"}
  ],
  "color_scheme": {
    "primary": "#hex", "secondary": "#hex", "accent": "#hex",
    "header_bg": "#hex", "header_text": "#hex", "alt_row_bg": "#hex"
  }
}`;

  const prompt = `Create a spreadsheet template blueprint for this opportunity:

Niche: ${params.opportunity.niche}
Description: ${params.opportunity.description}
Rationale: ${params.opportunity.rationale}
Suggested price: $${(params.opportunity.suggested_price_cents / 100).toFixed(2)}
Competitor prices: ${params.opportunity.competitor_prices.map((p) => `$${(p / 100).toFixed(2)}`).join(", ")}

This is generation attempt ${params.attempt} of 3.${feedbackContext}`;

  return promptClaude<ProductBlueprint>({
    model: "opus",
    system,
    prompt,
    maxTokens: 8192,
    thinking: true,
  });
}

async function generateSheet(params: {
  sheetPlan: { name: string; purpose: string; column_plan: string; formula_plan: string };
  sheetIndex: number;
  totalSheets: number;
  productTitle: string;
  niche: string;
  allSheetNames: string[];
  colorScheme: ProductBlueprint["color_scheme"];
  lessonsBlock: string;
}): Promise<SheetSpec> {
  const system = `You are an expert spreadsheet designer creating a specific sheet for a professional template called "${params.productTitle}".

You are designing Sheet ${params.sheetIndex + 1} of ${params.totalSheets}: "${params.sheetPlan.name}"

All sheets in this template:
${params.allSheetNames.map((n, i) => `${i + 1}. ${n}${i === params.sheetIndex ? " ← YOU ARE DESIGNING THIS ONE" : ""}`).join("\n")}

Sheet purpose: ${params.sheetPlan.purpose}
Column plan: ${params.sheetPlan.column_plan}
Formula plan: ${params.sheetPlan.formula_plan}

Color scheme:
- Header background: ${params.colorScheme.header_bg}
- Header text: ${params.colorScheme.header_text}
- Alternating row background: ${params.colorScheme.alt_row_bg}
- Accent: ${params.colorScheme.accent}

DESIGN RULES:
- Use standard formulas ONLY: SUM, AVERAGE, IF, SUMIF, SUMIFS, VLOOKUP, COUNTIF, MAX, MIN, TODAY, TEXT, CONCATENATE
- NO data validation dropdowns, NO macros, NO VBA, NO pivot tables (must work in Google Sheets)
- For row-relative formulas, use {row} as placeholder (e.g., "=B{row}*C{row}" — the builder replaces {row} with actual row numbers)
- Include 5-10 rows of realistic sample data showing the template in action
- Header row should be bold with background color
- Data rows alternate white and alt_row_bg
- Total/summary rows should be bold with top border
- Freeze header rows and any label columns
- Mark formula cells as protected_ranges so users don't accidentally edit them
- Column widths should be reasonable (8-30 depending on content type)
- If this is the Instructions sheet: use merged cells for a welcome header, list all tabs with descriptions, include "How to Use" steps${params.lessonsBlock}

Return ONLY valid JSON matching this exact SheetSpec structure:
{
  "name": "string",
  "purpose": "string",
  "is_instructions": boolean,
  "columns": [
    {"letter": "A", "header": "string", "width": number, "type": "text|number|currency|date|percentage|formula", "number_format": "optional string"}
  ],
  "rows": [
    {
      "row": number (1-based),
      "is_header": boolean,
      "is_total": boolean,
      "is_sample": boolean,
      "cells": {
        "A": {"value": "string or number or null", "formula": "optional string", "style": {"bold": boolean, "font_color": "#hex", "bg_color": "#hex", "h_align": "left|center|right", "border": "thin|medium"}}
      }
    }
  ],
  "frozen": {"rows": number, "cols": number},
  "merged_cells": ["A1:D1"],
  "protected_ranges": ["E2:E50"],
  "conditional_formats": []
}`;

  const prompt = `Design the complete sheet specification for "${params.sheetPlan.name}" in the ${params.niche} spreadsheet template.

Include:
- Complete column definitions with appropriate widths and types
- Header row with styled headers
- 5-10 sample data rows with realistic values
- Summary/total rows with formulas where appropriate
- Frozen panes for headers
- Protected ranges for formula cells
- Merged cells where useful (e.g., section headers)

Make this sheet professional, intuitive, and immediately useful to a non-technical buyer.`;

  return promptClaude<SheetSpec>({
    model: "opus",
    system,
    prompt,
    maxTokens: 8192,
  });
}

export async function generateProduct(params: {
  opportunity: Opportunity;
  attempt: number;
  previousFeedback?: string;
  marketIntelligence?: string;
  onProgress?: (pct: number) => void;
}): Promise<GeneratedProduct> {
  // Fetch lessons learned from previous QA cycles
  let lessons: Lesson[] = [];
  try {
    lessons = await getActiveLessons("generation", 5);
    if (lessons.length > 0) {
      console.log(`[generator] Injecting ${lessons.length} lessons into system prompt`);
    }
  } catch (e) {
    console.error("[generator] Failed to fetch lessons, continuing without:", e);
  }
  const lessonsBlock = formatLessonsBlock(lessons);

  // Phase 1: Generate blueprint (0-20%)
  console.log(`[generator] Phase 1: Generating spreadsheet blueprint with Opus...`);
  params.onProgress?.(5);

  const blueprint = await generateBlueprint({
    opportunity: params.opportunity,
    attempt: params.attempt,
    previousFeedback: params.previousFeedback,
    lessonsBlock,
    marketIntelligence: params.marketIntelligence,
  });

  console.log(`[generator] Blueprint: "${blueprint.title}" — ${blueprint.sheets.length} sheets planned`);
  params.onProgress?.(20);

  // Phase 2: Generate all sheets in parallel (20-90%)
  console.log(`[generator] Phase 2: Generating ${blueprint.sheets.length} sheet specs in parallel with Opus...`);

  let completedSheets = 0;
  const sheetPromises = blueprint.sheets.map((sheetPlan, i) =>
    generateSheet({
      sheetPlan,
      sheetIndex: i,
      totalSheets: blueprint.sheets.length,
      productTitle: blueprint.title,
      niche: params.opportunity.niche,
      allSheetNames: blueprint.sheets.map((s) => s.name),
      colorScheme: blueprint.color_scheme,
      lessonsBlock,
    }).then((sheet) => {
      completedSheets++;
      const pct = 20 + Math.round((completedSheets / blueprint.sheets.length) * 70);
      console.log(`[generator] Sheet ${completedSheets}/${blueprint.sheets.length} done: "${sheet.name}" (${sheet.rows.length} rows)`);
      params.onProgress?.(pct);
      return sheet;
    }),
  );

  const sheets = await Promise.all(sheetPromises);

  // Phase 3: Assemble final product (90-100%)
  console.log(`[generator] Phase 3: Assembling final product...`);
  params.onProgress?.(95);

  const product: GeneratedProduct = {
    product_type: blueprint.product_type,
    title: blueprint.title,
    description: blueprint.description,
    content: {
      sheets,
      color_scheme: blueprint.color_scheme,
    },
    tags: blueprint.tags,
    price_cents: blueprint.price_cents,
    currency: blueprint.currency,
    thumbnail_prompt: blueprint.thumbnail_prompt,
    preview_prompts: blueprint.preview_prompts,
    taxonomy_id: blueprint.taxonomy_id,
  };

  console.log(`[generator] Complete: "${product.title}" — ${sheets.length} sheets`);
  params.onProgress?.(100);

  return product;
}
