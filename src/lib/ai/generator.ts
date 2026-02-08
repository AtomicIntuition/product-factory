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
    lessons = await getActiveLessons("generation", 5);
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
3. Content: Create a prompt pack with 5 themed sections, each with 5 prompts (25 total). Each prompt MUST be 1-2 sentences and under 40 words. No preamble, no explanation — just the ready-to-use prompt text.
4. Tags: 5-8 relevant tags for Gumroad discoverability.
5. Price: Set in cents. Should be competitive based on the opportunity data. Price appropriately for 25 prompts — typically $5-9.
6. Thumbnail prompt: A prompt for generating a square (1:1) product cover image. Design it as a digital product thumbnail — bold text overlay with the product title, clean modern background, vibrant colors. Think Gumroad product card, NOT a landscape photo. Always specify "square format, 1:1 aspect ratio" in the prompt.

CRITICAL RULES FOR THE DESCRIPTION:
- The description MUST accurately reflect the ACTUAL content you generate. Do NOT inflate numbers.
- Count your prompts as you write them. The number in the description MUST match total_prompts exactly.
- Do NOT promise bonus materials, PDFs, guides, matrices, cheat sheets, or any deliverables beyond the prompt pack itself. The buyer receives ONLY the prompts you write in the sections array.
- Do NOT claim per-section counts that exceed what you actually wrote. If a section has 8 prompts, say "8 prompts" not "80 prompts."
- Honesty builds trust and prevents refunds. A well-described 35-prompt pack at $7 outsells a misleading "800+ prompt" pack at $29 that gets refunded.

CRITICAL OUTPUT SIZE LIMIT — YOU WILL BE CUT OFF IF YOU EXCEED THIS:
- Total output must be under 6000 tokens. This is a HARD LIMIT.
- Each prompt: 1-2 sentences, max 40 words. No introductions, no explanations.
- Description: 100 words max. Bullet points only.
- Thumbnail prompt: 1 sentence.
- Exactly 5 sections × 5 prompts = 25 prompts. No more.
- No extra whitespace, no markdown formatting in JSON values.
- Return ONLY the JSON object. No text before or after it.${lessonsBlock}

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

  const result = await promptClaude<GeneratedProduct>({
    model: "sonnet",
    system,
    prompt,
    maxTokens: 16384,
    onProgress: params.onProgress,
  });

  // Fix total_prompts to match actual content (important if JSON was truncated)
  const actualCount = result.content.sections.reduce(
    (sum, s) => sum + (s.prompts?.length ?? 0),
    0,
  );
  if (actualCount !== result.content.total_prompts) {
    console.warn(
      `[generator] Fixing total_prompts: claimed ${result.content.total_prompts}, actual ${actualCount}`,
    );
    result.content.total_prompts = actualCount;
  }

  return result;
}
