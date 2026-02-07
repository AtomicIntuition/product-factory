import { promptClaude } from "@/lib/ai/client";
import type { QAResult } from "@/types";

interface ExtractedLesson {
  lesson: string;
  dimension: string | null;
  severity: number;
}

export async function extractLessons(params: {
  qaResult: QAResult;
  productType: string;
  niche: string;
  title: string;
}): Promise<ExtractedLesson[]> {
  const system = `You are a systems analyst extracting generalizable lessons from product QA results. Your job is to distill specific QA feedback into reusable rules that will prevent future products from making the same mistakes (or reinforce what worked well).

Rules for writing lessons:
1. Lessons must be GENERALIZABLE — not specific to one product or niche. Write rules that apply to ALL future products.
2. BAD: "Add more illustration prompts" → GOOD: "Listing copy must not promise more content than actually delivered"
3. BAD: "The photography section needs work" → GOOD: "Each section must have prompts of comparable depth and specificity"
4. For passing products, extract what made them succeed so it can be replicated.
5. Each lesson should be a single clear imperative sentence.
6. Severity 1-5: 1=minor style preference, 3=meaningful quality issue, 5=critical failure that would cause refunds.

Return ONLY valid JSON array:
[
  {
    "lesson": "string (imperative sentence — a rule to follow)",
    "dimension": "string or null (content_length | uniqueness | relevance | quality | listing_copy | null)",
    "severity": number
  }
]

Return 1-3 lessons. Only extract lessons that are genuinely useful — do not pad with obvious advice.`;

  const prompt = `Extract generalizable lessons from this QA result:

Product: "${params.title}"
Type: ${params.productType}
Niche: ${params.niche}
QA Result: ${params.qaResult.passed ? "PASSED" : "FAILED"}
Scores: ${JSON.stringify(params.qaResult.scores)}
Feedback: ${params.qaResult.feedback}

What reusable rules should the system learn from this result?`;

  return promptClaude<ExtractedLesson[]>({
    model: "opus",
    system,
    prompt,
    maxTokens: 2048,
  });
}
