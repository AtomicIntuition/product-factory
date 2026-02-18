import { promptClaude } from "@/lib/ai/client";
import { etsy } from "@/lib/etsy/client";
import type { EtsyListingData } from "@/types";

interface ResearchResult {
  products: EtsyListingData[];
  categories_analyzed: string[];
  raw_analysis: string;
  top_seller_patterns: string;
}

const SEARCH_QUERIES = [
  "spreadsheet template",
  "excel template",
  "budget tracker spreadsheet",
  "business planner template",
  "inventory tracker excel",
  "financial template google sheets",
  "expense tracker spreadsheet",
  "project management spreadsheet",
  "wedding budget spreadsheet",
  "small business bookkeeping template",
];

export async function runResearch(params: {
  niche?: string;
  keywords?: string[];
}): Promise<ResearchResult> {
  const queries = params.keywords && params.keywords.length > 0
    ? params.keywords
    : params.niche
      ? [params.niche, `${params.niche} spreadsheet`, `${params.niche} template excel`]
      : SEARCH_QUERIES;

  // Collect real Etsy listings from multiple search queries
  const allListings: EtsyListingData[] = [];
  const seenIds = new Set<number>();
  const categoriesAnalyzed: string[] = [];

  console.log(`[researcher] Searching Etsy with ${queries.length} queries...`);

  for (const query of queries) {
    try {
      const result = await etsy.searchListings({
        keywords: query,
        limit: 10,
        sort_on: "score",
      });

      categoriesAnalyzed.push(query);

      for (const listing of result.results) {
        if (seenIds.has(listing.listing_id)) continue;
        seenIds.add(listing.listing_id);

        const priceCents = Math.round(
          (listing.price.amount / listing.price.divisor) * 100,
        );

        allListings.push({
          listing_id: listing.listing_id,
          title: listing.title,
          description: listing.description.slice(0, 500),
          price_cents: priceCents,
          currency: listing.price.currency_code.toLowerCase(),
          num_favorers: listing.num_favorers,
          views: listing.views,
          tags: listing.tags,
          taxonomy_id: listing.taxonomy_id,
          url: listing.url,
          shop_name: `shop_${listing.shop_id}`,
          review_count: listing.review_count ?? 0,
          rating: listing.rating ?? null,
          is_digital: listing.is_digital,
        });
      }
    } catch (err) {
      console.error(`[researcher] Search query "${query}" failed:`, err);
    }
  }

  console.log(`[researcher] Collected ${allListings.length} unique listings from Etsy`);

  // Pass real data to Claude for deep analysis
  const system = `You are an expert market researcher specializing in digital spreadsheet templates on the Etsy marketplace. You have been given real Etsy listing data. Your job is to conduct deep competitive analysis of existing spreadsheet templates — their pricing, positioning, listing quality, sales performance (estimated from favorites/views), and what makes the best ones succeed.

IMPORTANT: Focus ONLY on spreadsheet templates (Excel, Google Sheets). Analyze budget trackers, business planners, inventory systems, financial templates, project management tools, wedding planners, etc. — all as spreadsheet templates.

You must return ONLY valid JSON with this exact structure:
{
  "products": <the exact array of products passed to you — return them unchanged>,
  "categories_analyzed": <the categories array passed to you>,
  "raw_analysis": "string (comprehensive market analysis: which niches have highest demand, pricing sweet spots, quality distribution, underserved markets, emerging trends, what buyers want in spreadsheet templates, Google Sheets vs Excel preference trends)",
  "top_seller_patterns": "string (DETAILED breakdown of what the top-performing spreadsheet template listings do differently. Specifically analyze: 1) Title keyword patterns — what words appear first 2) Tag strategies — which 13-tag combinations drive traffic 3) Description structure and what info converts 4) Pricing psychology in $10-40 range 5) How they showcase multiple sheets/tabs 6) Image strategy — what listing photos show 7) How they handle Excel vs Google Sheets compatibility 8) Number of favorites vs price correlation 9) What makes a buyer click 'Add to cart' vs scrolling past 10) Common weaknesses and gaps in existing listings)"
}`;

  const prompt = `Analyze the following ${allListings.length} real Etsy spreadsheet template listings and provide deep market intelligence.

Categories searched: ${categoriesAnalyzed.join(", ")}

Listing data:
${JSON.stringify(allListings, null, 2)}

Provide comprehensive analysis of the spreadsheet template market on Etsy. Focus on identifying gaps where a new, high-quality spreadsheet template could succeed. What niches are underserved? What quality level is table stakes vs premium? Where are the biggest opportunities?`;

  const result = await promptClaude<ResearchResult>({
    model: "opus",
    system,
    prompt,
    maxTokens: 16384,
    thinking: true,
  });

  // Ensure we use the real listings data regardless of what Claude returns
  result.products = allListings;
  result.categories_analyzed = categoriesAnalyzed;

  return result;
}
