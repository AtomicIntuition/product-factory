import { promptClaude } from "@/lib/ai/client";
import type { GumroadProductData } from "@/types";

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
  researchData: GumroadProductData[];
  categories: string[];
}): Promise<AnalysisResult> {
  const system = `You are an expert market analyst specializing in digital product opportunities on Gumroad. Your job is to analyze market research data and identify gaps and underserved opportunities where a new product could succeed.

For each opportunity you identify, score it on four dimensions (each 1-10):
- demand_score (1-10): How much demand exists for this type of product. 10 = extremely high demand.
- competition_score (1-10, INVERSE): How little competition exists. 10 = very LOW competition (good). 1 = extremely crowded market (bad).
- gap_score (1-10): How big the gap is between what exists and what buyers want. 10 = massive unmet need.
- feasibility_score (1-10): How feasible it is to create this product with AI. 10 = very easy to produce high quality output.

Calculate composite_score as: demand * 0.3 + gap_score * 0.3 + feasibility * 0.25 + competition * 0.15

Return ONLY valid JSON with this exact structure:
{
  "opportunities": [
    {
      "niche": "string",
      "product_type": "string (e.g., prompt_pack, template, guide, toolkit)",
      "description": "string (detailed description of the product opportunity)",
      "demand_score": number,
      "competition_score": number,
      "gap_score": number,
      "feasibility_score": number,
      "composite_score": number,
      "rationale": "string (why this is a good opportunity)",
      "competitor_prices": [number],
      "suggested_price_cents": number
    }
  ],
  "summary": "string (overall market analysis summary)"
}

Return the top 5 opportunities sorted by composite_score descending. All prices should be in cents. Be specific and actionable in your descriptions — vague opportunities are useless.`;

  const prompt = `Analyze the following market research data from Gumroad and identify the top 5 product opportunities with the highest potential for success.

Categories analyzed: ${params.categories.join(", ")}

Product data (${params.researchData.length} products):
${JSON.stringify(params.researchData, null, 2)}

Identify gaps where buyer demand is underserved, where existing products are low quality or overpriced, and where AI-generated content could deliver genuine value. Focus on prompt packs, templates, and digital toolkits that can be created programmatically.

For competitor_prices, list the actual prices (in cents) of the most relevant competing products from the data above.`;

  return promptClaude<AnalysisResult>({
    model: "opus",
    system,
    prompt,
    maxTokens: 8192,
  });
}
