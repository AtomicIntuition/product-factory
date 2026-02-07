import { promptClaude } from "@/lib/ai/client";
import type { GumroadProductData } from "@/types";

interface ResearchResult {
  products: GumroadProductData[];
  categories_analyzed: string[];
  raw_analysis: string;
}

export async function runResearch(params: {
  niche?: string;
  seedUrls?: string[];
}): Promise<ResearchResult> {
  const nicheContext = params.niche
    ? `Focus specifically on the "${params.niche}" niche.`
    : "Analyze a broad cross-section of popular niches on Gumroad.";

  const seedContext =
    params.seedUrls && params.seedUrls.length > 0
      ? `\n\nInclude the following seed URLs in your analysis context as reference points for existing products:\n${params.seedUrls.map((url) => `- ${url}`).join("\n")}`
      : "";

  const system = `You are an expert market researcher specializing in the Gumroad digital products marketplace. Your job is to analyze existing products on Gumroad and return structured data about the competitive landscape including pricing, ratings, categories, and market positioning.

You must return ONLY valid JSON with this exact structure:
{
  "products": [
    {
      "title": "string",
      "description": "string (brief summary)",
      "price_cents": number,
      "currency": "usd",
      "rating": number | null,
      "review_count": number,
      "seller_name": "string",
      "seller_id": "string",
      "url": "string",
      "tags": ["string"],
      "category": "string"
    }
  ],
  "categories_analyzed": ["string"],
  "raw_analysis": "string (your high-level analysis of the market)"
}

Analyze at least 15-20 products across different price points and popularity levels. Include both top performers and mid-tier products to give a complete picture. Ensure price_cents is the price in cents (e.g., $9.99 = 999). For ratings, use a 1-5 scale or null if unknown.`;

  const prompt = `Conduct a thorough market research analysis of the Gumroad digital products marketplace.

${nicheContext}${seedContext}

For each product, provide realistic market data including:
- Accurate pricing in cents
- Estimated ratings and review counts
- Relevant tags and categorization
- Seller information

After listing the products, provide a raw_analysis string summarizing key market trends, pricing patterns, popular categories, and any notable observations about the competitive landscape.`;

  return promptClaude<ResearchResult>({
    model: "opus",
    system,
    prompt,
    maxTokens: 8192,
  });
}
