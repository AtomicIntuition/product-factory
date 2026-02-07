import { promptClaude } from "@/lib/ai/client";
import type { QAResult } from "@/types";
import type { GeneratedProduct } from "@/lib/ai/generator";

export async function evaluateProduct(product: GeneratedProduct): Promise<QAResult> {
  const system = `You are a harsh but fair quality assurance evaluator for digital products sold on Gumroad. Your job is to determine whether a product meets the minimum quality bar for publication.

Score each dimension from 1-10:
- content_length: Does the product have enough content to justify its price? Consider total number of prompts, depth of each prompt, and variety across sections. 10 = exceptional volume and depth.
- uniqueness: How unique and differentiated is this product? Would a buyer find similar content freely available online? 10 = highly original, cannot be found elsewhere.
- relevance: How relevant and well-targeted is the content for the stated niche? Are the prompts specific to the use case? 10 = perfectly targeted.
- quality: How high quality are the individual prompts? Are they specific, actionable, and well-crafted? 10 = expert-level, immediately usable.
- listing_copy: How effective is the title and description for converting Gumroad browsers into buyers? Is it SEO-optimized, benefit-driven, and scannable? 10 = compelling, professional copy.

PASS CRITERIA: The product passes ONLY if ALL scores are >= 6 AND the average of all scores is >= 7.

If the product fails, provide specific, actionable feedback explaining exactly what needs to be improved. Be concrete — say "Section 3 prompts are too generic, they need specific parameters like tone, word count, and target audience" not "improve quality."

Return ONLY valid JSON with this exact structure:
{
  "passed": boolean,
  "scores": {
    "content_length": number,
    "uniqueness": number,
    "relevance": number,
    "quality": number,
    "listing_copy": number
  },
  "feedback": "string (specific actionable feedback, especially if failing)",
  "attempt": number
}

Be harsh. This product needs to be something people would pay money for and not request a refund. Mediocre products damage seller reputation.`;

  const totalPrompts = product.content.sections.reduce(
    (sum, section) => sum + section.prompts.length,
    0,
  );

  const prompt = `Evaluate the following digital product for Gumroad publication:

TITLE: ${product.title}
TYPE: ${product.product_type}
PRICE: $${(product.price_cents / 100).toFixed(2)}
TAGS: ${product.tags.join(", ")}

DESCRIPTION:
${product.description}

CONTENT STRUCTURE:
- Format: ${product.content.format}
- Sections: ${product.content.sections.length}
- Total prompts: ${totalPrompts} (claimed: ${product.content.total_prompts})

FULL CONTENT:
${product.content.sections
  .map(
    (section, i) =>
      `\n--- Section ${i + 1}: ${section.title} ---\n${section.prompts.map((p, j) => `${j + 1}. ${p}`).join("\n")}`,
  )
  .join("\n")}

THUMBNAIL PROMPT: ${product.thumbnail_prompt}

Evaluate this product rigorously. Would YOU pay $${(product.price_cents / 100).toFixed(2)} for this?`;

  const result = await promptClaude<QAResult>({
    model: "opus",
    system,
    prompt,
    maxTokens: 4096,
  });

  return result;
}
