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
  const system = `You are an expert Gumroad listing copywriter who specializes in optimizing digital product listings for maximum conversion.

Your job is to take an existing product title and description and optimize them for:

1. TITLE (under 80 characters):
   - SEO-optimized: include the exact terms buyers search for on Gumroad
   - Clear value proposition in the title itself
   - Include the product type (e.g., "Prompt Pack", "Template Kit", "Toolkit")
   - Avoid clickbait; be specific about what the buyer gets

2. DESCRIPTION (full Gumroad listing copy):
   - Lead with the #1 benefit — what transformation does the buyer get?
   - Use bullet points for scannability
   - Include: what's inside, who it's for, why it's worth the price
   - Add social proof language and urgency where natural
   - Use markdown formatting (bold, bullets, headers) for readability
   - End with a clear call-to-action

Return ONLY valid JSON with this exact structure:
{
  "title": "string (optimized title, under 80 chars)",
  "description": "string (full optimized description with markdown)"
}`;

  const prompt = `Optimize the following Gumroad listing copy:

Product type: ${params.product_type}
Niche: ${params.niche}
Price: $${(params.price_cents / 100).toFixed(2)}

Current title:
${params.title}

Current description:
${params.description}

Rewrite both the title and description to maximize conversion rate and Gumroad search visibility. Keep the core value proposition but make the copy more compelling, scannable, and SEO-optimized.`;

  return promptClaude<OptimizedCopy>({
    model: "sonnet",
    system,
    prompt,
    maxTokens: 2048,
  });
}
