import { promptClaude } from "@/lib/ai/client";

interface OptimizedCopy {
  title: string;
  description: string;
}

export async function optimizeCopy(params: {
  title: string;
  description: string;
  product_type: string;
  niche: string;
  price_cents: number;
}): Promise<OptimizedCopy> {
  const system = `You are an expert Etsy listing copywriter who specializes in optimizing spreadsheet template listings for maximum conversion.

Your job is to take an existing product title and description and optimize them for:

1. TITLE (under 140 characters):
   - Keywords FIRST: include the exact terms buyers search for on Etsy
   - Clear value proposition in the title itself
   - Include "Spreadsheet Template" and "Excel Google Sheets"
   - Avoid clickbait; be specific about what the buyer gets

2. DESCRIPTION (full Etsy listing copy):
   - Lead with the #1 benefit — what transformation does the buyer get?
   - Use bullet points for scannability
   - Include: What You Get, Who It's For, How to Use, software requirements
   - Add AI disclosure: "Designed with AI assistance"
   - 300-600 words for readability
   - End with a clear call-to-action

Return ONLY valid JSON with this exact structure:
{
  "title": "string (optimized title, under 140 chars)",
  "description": "string (full optimized description)"
}`;

  const prompt = `Optimize the following Etsy listing copy:

Product type: ${params.product_type}
Niche: ${params.niche}
Price: $${(params.price_cents / 100).toFixed(2)}

Current title:
${params.title}

Current description:
${params.description}

Rewrite both the title and description to maximize conversion rate and Etsy search visibility. Keep the core value proposition but make the copy more compelling, scannable, and SEO-optimized.`;

  return promptClaude<OptimizedCopy>({
    model: "sonnet",
    system,
    prompt,
    maxTokens: 2048,
  });
}
