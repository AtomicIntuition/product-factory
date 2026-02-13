import { promptClaude } from "@/lib/ai/client";
import type { GumroadProductData } from "@/types";

interface ResearchResult {
  products: GumroadProductData[];
  categories_analyzed: string[];
  raw_analysis: string;
  top_seller_patterns: string;
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

  const system = `You are an expert market researcher specializing in AI prompt packs on the Gumroad digital products marketplace. Your job is to conduct deep competitive analysis of existing prompt packs — their pricing, positioning, listing quality, sales performance, and what makes the best ones succeed.

IMPORTANT: Focus ONLY on prompt packs (ChatGPT prompts, Midjourney prompts, AI art prompts, business prompts, writing prompts, coding prompts, etc.). Do NOT research templates, courses, guides, software, or other product types. We only sell prompt packs.

You must return ONLY valid JSON with this exact structure:
{
  "products": [
    {
      "title": "string (exact product title as it appears on Gumroad)",
      "description": "string (detailed summary of the listing — what it promises, how it's structured, key selling points, description length and format quality)",
      "price_cents": number,
      "currency": "usd",
      "rating": number | null,
      "review_count": number,
      "seller_name": "string",
      "seller_id": "string",
      "url": "string",
      "tags": ["string"],
      "category": "string",
      "sales_estimate": "string (low/medium/high/very_high — based on review count, visibility, and social proof signals)",
      "listing_quality": "string (poor/average/good/excellent — rate their title SEO, description persuasiveness, formatting, visual presentation, and overall conversion potential)"
    }
  ],
  "categories_analyzed": ["string"],
  "raw_analysis": "string (comprehensive market analysis: which niches have highest demand, pricing sweet spots by niche, quality distribution, underserved markets, emerging trends, and where the biggest opportunities lie)",
  "top_seller_patterns": "string (DETAILED breakdown of what the top 5 best-selling prompt packs do differently. Specifically analyze: 1) Description structure and length 2) Emoji and formatting usage 3) How they frame the value proposition 4) Their hook/opening line 5) How they list what's included 6) Call-to-action strategy 7) Pricing psychology 8) Title SEO patterns 9) How they handle social proof 10) What makes a buyer click 'I want this' vs scrolling past)"
}

SCOPE: Analyze 25-30 prompt pack products across different niches, price points, and popularity levels. Include:
- 8-10 top performers (high reviews, established sellers)
- 10-12 mid-tier products (moderate success)
- 5-8 newer or underperforming products (to understand what NOT to do)

This gives us a complete picture of the competitive landscape from top to bottom.

Ensure price_cents is the price in cents (e.g., $9.99 = 999). For ratings, use a 1-5 scale or null if unknown. Be specific and data-driven in your analysis — vague observations are useless.`;

  const prompt = `Conduct a deep competitive analysis of AI prompt packs on the Gumroad marketplace.

${nicheContext}${seedContext}

For each product, provide detailed market data:
- Exact title and accurate pricing in cents
- Estimated ratings and review counts based on market positioning
- Relevant tags and categorization
- Seller information and their market presence
- Sales estimate based on review count and visibility signals
- Honest listing quality assessment — what works and what doesn't in their listing

For the raw_analysis, go deep: which niches are saturated vs underserved, what price points convert best, what quality level is table stakes vs premium, and where a new entrant could win.

For top_seller_patterns, study the best performers like a copywriter would: break down their exact listing structure, how they use formatting, what psychological triggers they pull, and what specifically makes their listings convert better than the rest. This intelligence directly shapes our product listings.`;

  return promptClaude<ResearchResult>({
    model: "opus",
    system,
    prompt,
    maxTokens: 16384,
    thinking: true,
  });
}
