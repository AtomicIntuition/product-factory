import { promptClaude } from "@/lib/ai/client";
import { getActiveLessons } from "@/lib/supabase/queries";
import type { Opportunity, Lesson } from "@/types";

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

function formatLessonsBlock(lessons: Lesson[]): string {
  if (lessons.length === 0) return "";
  const lines = lessons.map(
    (l, i) => `${i + 1}. [severity ${l.severity}] ${l.lesson}`,
  );
  return `\n\nLESSONS FROM PREVIOUS PRODUCTS (follow these strictly):\n${lines.join("\n")}`;
}

export async function generateProduct(params: {
  opportunity: Opportunity;
  attempt: number;
  previousFeedback?: string;
  onProgress?: (pct: number) => void;
}): Promise<GeneratedProduct> {
  // Fetch lessons learned from previous QA cycles
  let lessons: Lesson[] = [];
  try {
    lessons = await getActiveLessons("generation", 10);
    if (lessons.length > 0) {
      console.log(`[generator] Injecting ${lessons.length} lessons into system prompt`);
    }
  } catch (e) {
    console.error("[generator] Failed to fetch lessons, continuing without:", e);
  }

  const lessonsBlock = formatLessonsBlock(lessons);

  const feedbackContext = params.previousFeedback
    ? `\n\nIMPORTANT — PREVIOUS ATTEMPT FEEDBACK (attempt ${params.attempt - 1}):\nThe previous version of this product failed quality review. Here is the specific feedback you MUST address:\n${params.previousFeedback}\n\nFix every issue mentioned above. Do not repeat the same mistakes.`
    : "";

  const system = `You are an expert digital product creator specializing in high-quality prompt packs and digital toolkits for sale on Gumroad. Your products must be genuinely useful — specific, actionable, and worth paying for.

Requirements for the product:
1. Title: SEO-optimized for Gumroad search. Include the key search terms buyers would use. Under 80 characters.
2. Description: Benefit-driven and scannable. Use bullet points. Lead with the value proposition. Include what the buyer gets, who it's for, and why it's better than alternatives.
3. Content: Create a prompt pack with 5-6 themed sections. Each section should have 5-7 specific, ready-to-use prompts (aim for 30-40 total). Each prompt should be 1-3 sentences — specific and actionable, not padded with filler.
4. Tags: 5-8 relevant tags for Gumroad discoverability.
5. Price: Set in cents. Should be competitive based on the opportunity data. Price appropriately for 30-40 prompts — typically $5-12.
6. Thumbnail prompt: A DALL-E/Midjourney prompt for generating an attractive product thumbnail.

CRITICAL RULES FOR THE DESCRIPTION:
- The description MUST accurately reflect the ACTUAL content you generate. Do NOT inflate numbers.
- Count your prompts as you write them. The number in the description MUST match total_prompts exactly.
- Do NOT promise bonus materials, PDFs, guides, matrices, cheat sheets, or any deliverables beyond the prompt pack itself. The buyer receives ONLY the prompts you write in the sections array.
- Do NOT claim per-section counts that exceed what you actually wrote. If a section has 8 prompts, say "8 prompts" not "80 prompts."
- Honesty builds trust and prevents refunds. A well-described 35-prompt pack at $7 outsells a misleading "800+ prompt" pack at $29 that gets refunded.

IMPORTANT: Be concise. Each prompt should be 1-3 sentences. Do not pad prompts with unnecessary detail. Keep the JSON output compact.${lessonsBlock}

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
    maxTokens: 8192,
    onProgress: params.onProgress,
  });
}
