import { promptClaude } from "@/lib/ai/client";
import type { EtsyListingData } from "@/types";

interface AnalysisOpportunity {
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
}

interface AnalysisResult {
  opportunities: AnalysisOpportunity[];
  summary: string;
}

export async function analyzeOpportunities(params: {
  researchData: EtsyListingData[];
  categories: string[];
  topSellerPatterns?: string;
}): Promise<AnalysisResult> {
  const system = `You are an expert market analyst specializing in spreadsheet template opportunities on Etsy. Your job is to analyze real Etsy listing data and identify gaps where a new spreadsheet template could succeed.

IMPORTANT: All opportunities MUST be spreadsheet templates (product_type = "spreadsheet_template"). We create Excel/Google Sheets compatible .xlsx files with formulas, formatting, and multiple tabs. We do NOT create prompt packs, guides, courses, PDFs, or any other product type.

FEASIBILITY CONSTRAINTS: Consider what can be built with ExcelJS (JavaScript library):
- Standard formulas: SUM, AVERAGE, IF, SUMIF, SUMIFS, VLOOKUP, COUNTIF, MAX, MIN, TODAY, TEXT, CONCATENATE
- NO macros, VBA, pivot tables, or data validation dropdowns (Google Sheets compatibility)
- Professional formatting: colors, borders, merged cells, frozen panes, conditional formatting
- Multiple tabs/sheets with cross-references

For each opportunity you identify, score it on four dimensions (each 1-10):
- demand_score (1-10): How much demand exists based on favorites, views, search volume signals. 10 = extremely high demand.
- competition_score (1-10, INVERSE): How little competition exists. 10 = very LOW competition (good). 1 = extremely crowded (bad).
- gap_score (1-10): How big the gap is between existing templates and what buyers want. 10 = massive unmet need.
- feasibility_score (1-10): How feasible it is to create with ExcelJS + Claude designing formulas. 10 = very achievable.

Calculate composite_score as: demand * 0.3 + gap_score * 0.3 + feasibility * 0.25 + competition * 0.15

Return ONLY valid JSON with this exact structure:
{
  "opportunities": [
    {
      "niche": "string (specific niche like 'monthly household budget tracker' not just 'budgeting')",
      "product_type": "spreadsheet_template",
      "description": "string (detailed description: what tabs it has, what formulas, what problems it solves, how it's better than existing ones)",
      "demand_score": number,
      "competition_score": number,
      "gap_score": number,
      "feasibility_score": number,
      "composite_score": number,
      "rationale": "string (why this opportunity is good, what listing copy strategy to use, Etsy tag suggestions, pricing justification)",
      "competitor_prices": [number],
      "suggested_price_cents": number
    }
  ],
  "summary": "string (overall Etsy spreadsheet template market analysis summary)"
}

PRICING: Spreadsheet templates on Etsy typically sell for $10-40. Multi-tab solutions with automated calculations command $15-40. Simple single-sheet trackers are $5-15.

Return the top 5 opportunities sorted by composite_score descending. All prices in cents. Include 13 Etsy tag suggestions in each rationale.`;

  const prompt = `Analyze the following Etsy market data and identify the top 5 spreadsheet template opportunities.

Categories analyzed: ${params.categories.join(", ")}

Product data (${params.researchData.length} listings):
${JSON.stringify(params.researchData, null, 2)}

Identify gaps where buyer demand is underserved, where existing templates are low quality or overpriced, and where a new spreadsheet template could deliver genuine value.

For competitor_prices, list the actual prices (in cents) of the most relevant competing listings.${params.topSellerPatterns ? `\n\nTOP SELLER PATTERNS FROM RESEARCH:\n${params.topSellerPatterns}\n\nUse these patterns to inform your opportunity descriptions and rationale. Include specific Etsy listing copy advice, tag strategies, and pricing psychology.` : ""}`;

  return promptClaude<AnalysisResult>({
    model: "opus",
    system,
    prompt,
    maxTokens: 8192,
    thinking: true,
  });
}
