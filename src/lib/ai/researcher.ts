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

  const system = `You are an expert market researcher specializing in AI prompt packs on the Gumroad digital products marketplace. Your job is to analyze existing PROMPT PACK products on Gumroad and return structured data about the competitive landscape including pricing, ratings, categories, and market positioning.

IMPORTANT: Focus ONLY on prompt packs (ChatGPT prompts, Midjourney prompts, AI art prompts, business prompts, writing prompts, coding prompts, etc.). Do NOT research templates, courses, guides, software, or other product types. We only sell prompt packs.

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
  "raw_analysis": "string (your high-level analysis of the prompt pack market)"
}

Analyze at least 15-20 prompt pack products across different niches, price points, and popularity levels. Include both top performers and mid-tier products to give a complete picture. Ensure price_cents is the price in cents (e.g., $9.99 = 999). For ratings, use a 1-5 scale or null if unknown.`;

  const prompt = `Conduct a thorough market research analysis of AI prompt packs on the Gumroad marketplace.

${nicheContext}${seedContext}

Focus exclusively on prompt pack products (ChatGPT, Midjourney, DALL-E, Claude, Stable Diffusion, business AI prompts, etc.). For each product, provide realistic market data including:
- Accurate pricing in cents
- Estimated ratings and review counts
- Relevant tags and categorization
- Seller information

After listing the products, provide a raw_analysis string summarizing key trends in the prompt pack market: which niches sell best, pricing sweet spots, what differentiates top sellers, and where there are gaps.`;

  return promptClaude<ResearchResult>({
    model: "opus",
    system,
    prompt,
    maxTokens: 8192,
  });
}
