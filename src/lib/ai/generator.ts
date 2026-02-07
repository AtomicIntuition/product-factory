import { promptClaude } from "@/lib/ai/client";
import type { Opportunity } from "@/types";

interface GeneratedProductSection {
  title: string;
  prompts: string[];
}

interface GeneratedProductContent {
  format: string;
  sections: GeneratedProductSection[];
  total_prompts: number;
}

export interface GeneratedProduct {
  product_type: string;
  title: string;
  description: string;
  content: GeneratedProductContent;
  tags: string[];
  price_cents: number;
  currency: string;
  thumbnail_prompt: string;
}

export async function generateProduct(params: {
  opportunity: Opportunity;
  attempt: number;
  previousFeedback?: string;
}): Promise<GeneratedProduct> {
  const feedbackContext = params.previousFeedback
    ? `\n\nIMPORTANT — PREVIOUS ATTEMPT FEEDBACK (attempt ${params.attempt - 1}):\nThe previous version of this product failed quality review. Here is the specific feedback you MUST address:\n${params.previousFeedback}\n\nFix every issue mentioned above. Do not repeat the same mistakes.`
    : "";

  const system = `You are an expert digital product creator specializing in high-quality prompt packs and digital toolkits for sale on Gumroad. Your products must be genuinely useful — specific, actionable, and worth paying for.

Requirements for the product:
1. Title: SEO-optimized for Gumroad search. Include the key search terms buyers would use. Under 80 characters.
2. Description: Benefit-driven and scannable. Use bullet points. Lead with the value proposition. Include what the buyer gets, who it's for, and why it's better than alternatives.
3. Content: Create a comprehensive prompt pack with 5-8 themed sections. Each section should have 5-10 specific, detailed, ready-to-use prompts (aim for 40-60 total). Prompts must be actionable and specific — not generic filler.
4. Tags: 5-8 relevant tags for Gumroad discoverability.
5. Price: Set in cents. Should be competitive based on the opportunity data.
6. Thumbnail prompt: A DALL-E/Midjourney prompt for generating an attractive product thumbnail.

Return ONLY valid JSON with this exact structure:
{
  "product_type": "string",
  "title": "string",
  "description": "string (full Gumroad listing description with markdown)",
  "content": {
    "format": "prompt_pack",
    "sections": [
      {
        "title": "string (section name)",
        "prompts": ["string (complete, ready-to-use prompt)"]
      }
    ],
    "total_prompts": number
  },
  "tags": ["string"],
  "price_cents": number,
  "currency": "usd",
  "thumbnail_prompt": "string"
}`;

  const prompt = `Create a high-quality digital product for the following opportunity:

Niche: ${params.opportunity.niche}
Product type: ${params.opportunity.product_type}
Description: ${params.opportunity.description}
Rationale: ${params.opportunity.rationale}
Suggested price: $${(params.opportunity.suggested_price_cents / 100).toFixed(2)}
Competitor prices: ${params.opportunity.competitor_prices.map((p) => `$${(p / 100).toFixed(2)}`).join(", ")}

This is generation attempt ${params.attempt} of 3.${feedbackContext}

Create a comprehensive, genuinely valuable product that buyers would recommend to others. Every prompt must be specific, detailed, and immediately usable. No generic filler content.`;

  return promptClaude<GeneratedProduct>({
    model: "sonnet",
    system,
    prompt,
    maxTokens: 16384,
  });
}
