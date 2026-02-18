import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPromptClaude = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  promptClaude: (...args: unknown[]) => mockPromptClaude(...args),
}));

import { evaluateProduct } from "@/lib/ai/evaluator";
import { makeGeneratedProduct } from "../../fixtures/generated-product";

describe("evaluateProduct", () => {
  beforeEach(() => {
    mockPromptClaude.mockReset();
  });

  it("returns passed: true when all scores meet threshold", async () => {
    mockPromptClaude.mockResolvedValueOnce({
      passed: true,
      scores: {
        structure_quality: 8,
        formula_correctness: 9,
        visual_design: 7,
        usability: 8,
        listing_copy: 7,
      },
      feedback: "Good template.",
      attempt: 1,
    });

    const product = makeGeneratedProduct();
    const result = await evaluateProduct(product);
    expect(result.passed).toBe(true);
    expect(result.scores.structure_quality).toBe(8);
  });

  it("returns passed: false when scores are low", async () => {
    mockPromptClaude.mockResolvedValueOnce({
      passed: false,
      scores: {
        structure_quality: 4,
        formula_correctness: 5,
        visual_design: 3,
        usability: 4,
        listing_copy: 5,
      },
      feedback: "Template needs significant improvement.",
      attempt: 1,
    });

    const product = makeGeneratedProduct();
    const result = await evaluateProduct(product);
    expect(result.passed).toBe(false);
  });

  it("preserves response shape (scores, feedback, passed)", async () => {
    const qaResult = {
      passed: true,
      scores: {
        structure_quality: 8,
        formula_correctness: 9,
        visual_design: 7,
        usability: 8,
        listing_copy: 7,
      },
      feedback: "Specific feedback here.",
      attempt: 1,
    };
    mockPromptClaude.mockResolvedValueOnce(qaResult);

    const result = await evaluateProduct(makeGeneratedProduct());
    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("scores");
    expect(result).toHaveProperty("feedback");
    expect(result.feedback).toBe("Specific feedback here.");
  });

  it("passes SpreadsheetSpec content correctly in prompt", async () => {
    mockPromptClaude.mockResolvedValueOnce({
      passed: true,
      scores: { structure_quality: 8, formula_correctness: 8, visual_design: 8, usability: 8, listing_copy: 8 },
      feedback: "ok",
      attempt: 1,
    });

    const product = makeGeneratedProduct();
    await evaluateProduct(product);

    const callArgs = mockPromptClaude.mock.calls[0][0];
    expect(callArgs.prompt).toContain("Budget");
    expect(callArgs.prompt).toContain("Instructions");
    expect(callArgs.model).toBe("opus");
  });

  it("propagates error when promptClaude throws (truncation)", async () => {
    mockPromptClaude.mockRejectedValueOnce(new Error("Response truncated"));

    await expect(evaluateProduct(makeGeneratedProduct())).rejects.toThrow(
      "Response truncated",
    );
  });
});
