import { promptClaude } from "@/lib/ai/client";
import type { QAResult, SpreadsheetSpec } from "@/types";
import type { GeneratedProduct } from "@/lib/ai/generator";

export async function evaluateProduct(product: GeneratedProduct): Promise<QAResult> {
  const system = `You are a harsh but fair quality assurance evaluator for spreadsheet templates sold on Etsy. Your job is to determine whether a template meets the minimum quality bar for publication.

Score each dimension from 1-10:
- structure_quality: Is the spreadsheet well-organized? Are sheets logically arranged? Is there an Instructions sheet? Are columns properly labeled? Does data flow logically between sheets? 10 = exceptionally well-structured.
- formula_correctness: Do formulas make logical sense? Would SUM/IF/VLOOKUP references work correctly? Are cell references valid? No circular references? Are {row} placeholders used correctly? 10 = all formulas are correct and meaningful.
- visual_design: Professional formatting? Consistent color scheme? Alternating rows? Readable headers? Proper column widths? Clean borders? 10 = publication-ready professional design.
- usability: Can a non-technical user understand this? Are instructions clear? Are formula cells protected? Is navigation intuitive? Are labels self-explanatory? 10 = anyone can use it immediately.
- listing_copy: Is the Etsy title keyword-optimized (keywords first)? Are all 13 tags used effectively? Does the description sell the value? Is AI disclosure included? Does it mention Google Sheets compatibility? 10 = compelling, SEO-optimized listing.

PASS CRITERIA: The product passes ONLY if ALL scores are >= 6 AND the average of all scores is >= 7.

If the product fails, provide specific, actionable feedback explaining exactly what needs to be improved. Be concrete — say "The Instructions sheet is missing a 'How to Use' section" not "improve usability."

Return ONLY valid JSON with this exact structure:
{
  "passed": boolean,
  "scores": {
    "structure_quality": number,
    "formula_correctness": number,
    "visual_design": number,
    "usability": number,
    "listing_copy": number
  },
  "feedback": "string (specific actionable feedback, especially if failing)",
  "attempt": number
}

Be harsh. This template needs to be something people would pay money for on Etsy. Mediocre templates damage seller reputation and get bad reviews.`;

  const spec = product.content as SpreadsheetSpec;
  const totalSheets = spec.sheets.length;
  const totalRows = spec.sheets.reduce((sum, s) => sum + s.rows.length, 0);

  const prompt = `Evaluate the following spreadsheet template for Etsy publication:

TITLE: ${product.title}
TYPE: ${product.product_type}
PRICE: $${(product.price_cents / 100).toFixed(2)}
TAGS (${product.tags.length}): ${product.tags.join(", ")}
TAXONOMY_ID: ${product.taxonomy_id}

DESCRIPTION:
${product.description}

SPREADSHEET STRUCTURE:
- Total sheets: ${totalSheets}
- Total rows across all sheets: ${totalRows}
- Color scheme: ${JSON.stringify(spec.color_scheme)}

SHEET DETAILS:
${spec.sheets.map((sheet, i) => {
  const formulaCells = sheet.rows.flatMap((r) =>
    Object.entries(r.cells)
      .filter(([, c]) => c.formula)
      .map(([col, c]) => `${col}${r.row}: ${c.formula}`),
  );
  return `
--- Sheet ${i + 1}: ${sheet.name} (${sheet.is_instructions ? "Instructions" : "Data"}) ---
Purpose: ${sheet.purpose}
Columns: ${sheet.columns.map((c) => `${c.letter}:${c.header}(${c.type})`).join(", ")}
Rows: ${sheet.rows.length} (headers: ${sheet.rows.filter((r) => r.is_header).length}, sample data: ${sheet.rows.filter((r) => r.is_sample).length}, totals: ${sheet.rows.filter((r) => r.is_total).length})
Frozen: rows=${sheet.frozen.rows}, cols=${sheet.frozen.cols}
Protected ranges: ${sheet.protected_ranges.join(", ") || "none"}
Formulas: ${formulaCells.length > 0 ? formulaCells.slice(0, 10).join("; ") + (formulaCells.length > 10 ? ` ... and ${formulaCells.length - 10} more` : "") : "none"}`;
}).join("\n")}

IMAGE PROMPTS: ${[product.thumbnail_prompt, ...product.preview_prompts].length} total

Evaluate this template rigorously. Would YOU pay $${(product.price_cents / 100).toFixed(2)} for this on Etsy?`;

  const result = await promptClaude<QAResult>({
    model: "opus",
    system,
    prompt,
    maxTokens: 4096,
    thinking: true,
  });

  return result;
}
