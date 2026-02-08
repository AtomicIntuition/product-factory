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

// Phase 1 output: product metadata + section plan
interface ProductBlueprint {
  product_type: string;
  title: string;
  description: string;
  section_titles: string[];
  tags: string[];
  price_cents: number;
  currency: string;
  thumbnail_prompt: string;
}

// Phase 2 output: a single section's prompts
interface SectionOutput {
  title: string;
  prompts: string[];
}

function formatLessonsBlock(lessons: Lesson[]): string {
  if (lessons.length === 0) return "";
  const lines = lessons.map(
    (l, i) => `${i + 1}. [severity ${l.severity}] ${l.lesson}`,
  );
  return `\n\nLESSONS FROM PREVIOUS PRODUCTS (follow these strictly):\n${lines.join("\n")}`;
}

async function generateBlueprint(params: {
  opportunity: Opportunity;
  attempt: number;
  previousFeedback?: string;
  lessonsBlock: string;
  marketIntelligence?: string;
}): Promise<ProductBlueprint> {
  const feedbackContext = params.previousFeedback
    ? `\n\nIMPORTANT — PREVIOUS ATTEMPT FEEDBACK (attempt ${params.attempt - 1}):\n${params.previousFeedback}\n\nAddress every issue mentioned above.`
    : "";

  const system = `You are an expert digital product creator and copywriter specializing in high-converting prompt packs for Gumroad.

Create a product BLUEPRINT — the metadata and structure only. The actual prompts will be generated separately for each section, so do NOT write any prompts here.

Requirements:

1. TITLE: SEO-optimized for Gumroad search. Include the key search terms buyers would use. Under 80 characters. Use power words and make it clear what the buyer gets.
   - CRITICAL: The title MUST say "30" prompts because the pack contains exactly 30 prompts (5 sections × 6 prompts). NEVER claim a higher number like 50, 100, 200, 500, or 600+. That is false advertising.
   - Good example: "30 Expert AI Prompts for Shopify & DTC Ecommerce"
   - Bad example: "600+ ChatGPT Prompts for Shopify" (WRONG — we only have 30)

2. DESCRIPTION: This is the most important part — it's your sales page. Write a full, high-converting Gumroad listing description using markdown. Study what top-selling Gumroad products do:
   - Start with a bold hook or pain point that grabs attention
   - Use emojis strategically as visual anchors (🎯 ✨ 💡 🚀 ⚡ etc.)
   - Break content into scannable sections with bold headers
   - List exactly what's included with a "What You Get" section naming all 5 sections
   - Include a "Who This Is For" section targeting the ideal buyer
   - Add a "Why This Pack?" section with 3-4 compelling differentiators
   - Use bullet points extensively — walls of text don't sell
   - End with a clear call-to-action
   - Be specific about the value (e.g. "Save 10+ hours per week" not "save time")
   - 300-500 words is the sweet spot for Gumroad descriptions
   - CRITICAL: Do NOT inflate numbers. The product contains EXACTLY 30 prompts (5 sections × 6 prompts). Never claim more. Say "30" in both the title and description. False advertising destroys trust and triggers refunds.

3. SECTION TITLES: Exactly 5 themed section titles that comprehensively cover the niche. Each section will contain 6 detailed prompts (30 total). Make section titles compelling and specific.

4. TAGS: 5-8 relevant tags for Gumroad discoverability.

5. PRICE: In cents. Competitive based on opportunity data. Typically $7-12 for 30 expert prompts.

6. THUMBNAIL PROMPT: A prompt for generating a square (1:1) product cover image. Bold text overlay with the product title, clean modern background, vibrant colors. Gumroad product card style, NOT a photo.${params.lessonsBlock}${params.marketIntelligence ? `\n\nMARKET INTELLIGENCE FROM RESEARCH:\n${params.marketIntelligence}\n\nUse the market analysis and top seller patterns above to craft a listing that competes with or exceeds the best-performing products in this space. Apply their winning strategies to your title, description, pricing, and section structure.` : ""}

Return ONLY valid JSON:
{
  "product_type": "prompt_pack",
  "title": "string",
  "description": "string (full Gumroad listing description with markdown)",
  "section_titles": ["string", "string", "string", "string", "string"],
  "tags": ["string"],
  "price_cents": number,
  "currency": "usd",
  "thumbnail_prompt": "string"
}`;

  const prompt = `Create a product blueprint for this opportunity:

Niche: ${params.opportunity.niche}
Product type: ${params.opportunity.product_type}
Description: ${params.opportunity.description}
Rationale: ${params.opportunity.rationale}
Suggested price: $${(params.opportunity.suggested_price_cents / 100).toFixed(2)}
Competitor prices: ${params.opportunity.competitor_prices.map((p) => `$${(p / 100).toFixed(2)}`).join(", ")}

This is generation attempt ${params.attempt} of 3.${feedbackContext}`;

  return promptClaude<ProductBlueprint>({
    model: "opus",
    system,
    prompt,
    maxTokens: 4096,
  });
}

async function generateSection(params: {
  sectionTitle: string;
  sectionIndex: number;
  totalSections: number;
  productTitle: string;
  niche: string;
  productDescription: string;
  allSectionTitles: string[];
  lessonsBlock: string;
}): Promise<SectionOutput> {
  const system = `You are an expert prompt engineer creating a section of a premium AI prompt pack called "${params.productTitle}".

You are writing Section ${params.sectionIndex + 1} of ${params.totalSections}: "${params.sectionTitle}"

The full product has these sections:
${params.allSectionTitles.map((t, i) => `${i + 1}. ${t}${i === params.sectionIndex ? " ← YOU ARE WRITING THIS ONE" : ""}`).join("\n")}

Requirements:
- Write exactly 6 high-quality, ready-to-use AI prompts for this section.
- Each prompt must be specific, actionable, and immediately usable by the buyer.
- Each prompt should be 2-4 sentences. Include specific parameters, context, tone, and desired output format where relevant.
- No generic filler. Every prompt must provide unique, expert-level value that justifies the price.
- Prompts should cover different aspects of the section topic — no overlap.
- Do NOT include numbering, labels, explanations, or preamble. Just the raw prompt text.
- Stay focused on your section. Do NOT duplicate content that belongs in other sections.${params.lessonsBlock}

Return ONLY valid JSON:
{
  "title": "${params.sectionTitle}",
  "prompts": ["prompt 1", "prompt 2", "prompt 3", "prompt 4", "prompt 5", "prompt 6"]
}`;

  const prompt = `Write 6 expert-level prompts for the "${params.sectionTitle}" section.

Product: ${params.productTitle}
Niche: ${params.niche}
Product description: ${params.productDescription}

Make each prompt specific, detailed, and worth paying for. A buyer should feel this section alone justifies part of the price. These prompts should be things a professional in this niche would actually use daily.`;

  return promptClaude<SectionOutput>({
    model: "opus",
    system,
    prompt,
    maxTokens: 4096,
  });
}

export async function generateProduct(params: {
  opportunity: Opportunity;
  attempt: number;
  previousFeedback?: string;
  marketIntelligence?: string;
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

  // Phase 1: Generate blueprint (0-20%)
  console.log(`[generator] Phase 1: Generating product blueprint with Opus...`);
  params.onProgress?.(5);

  const blueprint = await generateBlueprint({
    opportunity: params.opportunity,
    attempt: params.attempt,
    previousFeedback: params.previousFeedback,
    lessonsBlock,
    marketIntelligence: params.marketIntelligence,
  });

  console.log(`[generator] Blueprint: "${blueprint.title}" — sections: ${blueprint.section_titles.join(", ")}`);
  params.onProgress?.(20);

  // Phase 2: Generate all sections in parallel (20-90%)
  console.log(`[generator] Phase 2: Generating ${blueprint.section_titles.length} sections in parallel with Opus...`);

  let completedSections = 0;
  const sectionPromises = blueprint.section_titles.map((title, i) =>
    generateSection({
      sectionTitle: title,
      sectionIndex: i,
      totalSections: blueprint.section_titles.length,
      productTitle: blueprint.title,
      niche: params.opportunity.niche,
      productDescription: blueprint.description,
      allSectionTitles: blueprint.section_titles,
      lessonsBlock,
    }).then((section) => {
      completedSections++;
      const pct = 20 + Math.round((completedSections / blueprint.section_titles.length) * 70);
      console.log(`[generator] Section ${completedSections}/${blueprint.section_titles.length} done: "${title}" (${section.prompts.length} prompts)`);
      params.onProgress?.(pct);
      return section;
    }),
  );

  const sections = await Promise.all(sectionPromises);

  // Phase 3: Assemble final product (90-100%)
  console.log(`[generator] Phase 3: Assembling final product...`);
  params.onProgress?.(95);

  const totalPrompts = sections.reduce((sum, s) => sum + s.prompts.length, 0);

  const product: GeneratedProduct = {
    product_type: blueprint.product_type,
    title: blueprint.title,
    description: blueprint.description,
    content: {
      format: "prompt_pack",
      sections,
      total_prompts: totalPrompts,
    },
    tags: blueprint.tags,
    price_cents: blueprint.price_cents,
    currency: blueprint.currency,
    thumbnail_prompt: blueprint.thumbnail_prompt,
  };

  console.log(`[generator] Complete: "${product.title}" — ${totalPrompts} prompts across ${sections.length} sections`);
  params.onProgress?.(100);

  return product;
}
