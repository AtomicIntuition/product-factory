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
  topSellerPatterns?: string;
}): Promise<AnalysisResult> {
  const system = `You are an expert market analyst specializing in AI prompt pack opportunities on Gumroad. Your job is to analyze market research data and identify gaps and underserved opportunities where a new prompt pack could succeed.

IMPORTANT: All opportunities MUST be prompt packs (product_type = "prompt_pack"). We do NOT create templates, guides, courses, software, or any other product type. Only prompt packs.

For each opportunity you identify, score it on four dimensions (each 1-10):
- demand_score (1-10): How much demand exists for this type of prompt pack. 10 = extremely high demand.
- competition_score (1-10, INVERSE): How little competition exists. 10 = very LOW competition (good). 1 = extremely crowded market (bad).
- gap_score (1-10): How big the gap is between existing prompt packs and what buyers want. 10 = massive unmet need.
- feasibility_score (1-10): How feasible it is to create this prompt pack with AI. 10 = very easy to produce high quality output.

Calculate composite_score as: demand * 0.3 + gap_score * 0.3 + feasibility * 0.25 + competition * 0.15

Return ONLY valid JSON with this exact structure:
{
  "opportunities": [
    {
      "niche": "string",
      "product_type": "prompt_pack",
      "description": "string (detailed description of the prompt pack opportunity)",
      "demand_score": number,
      "competition_score": number,
      "gap_score": number,
      "feasibility_score": number,
      "composite_score": number,
      "rationale": "string (why this prompt pack opportunity is good)",
      "competitor_prices": [number],
      "suggested_price_cents": number
    }
  ],
  "summary": "string (overall prompt pack market analysis summary)"
}

Return the top 5 prompt pack opportunities sorted by composite_score descending. All prices should be in cents. Be specific and actionable in your descriptions — vague opportunities are useless.`;

  const prompt = `Analyze the following market research data from Gumroad and identify the top 5 product opportunities with the highest potential for success.

Categories analyzed: ${params.categories.join(", ")}

Product data (${params.researchData.length} products):
${JSON.stringify(params.researchData, null, 2)}

Identify gaps where buyer demand for prompt packs is underserved, where existing prompt packs are low quality or overpriced, and where a new prompt pack could deliver genuine value.

For competitor_prices, list the actual prices (in cents) of the most relevant competing prompt packs from the data above.${params.topSellerPatterns ? `\n\nTOP SELLER PATTERNS FROM RESEARCH:\n${params.topSellerPatterns}\n\nUse these patterns to inform your opportunity descriptions and rationale. Include specific listing copy advice in each opportunity's rationale (e.g., what hooks to use, what pain points to address, pricing psychology).` : ""}`;

  return promptClaude<AnalysisResult>({
    model: "opus",
    system,
    prompt,
    maxTokens: 8192,
  });
}
