import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies
const mockInsertPipelineRun = vi.fn();
const mockUpdatePipelineRun = vi.fn();
const mockInsertResearchRaw = vi.fn();
const mockGetResearchRawByRunId = vi.fn();
const mockInsertReport = vi.fn();
const mockGetReportById = vi.fn();
const mockInsertProduct = vi.fn();
const mockUpdateProduct = vi.fn();
const mockGetProductById = vi.fn();
const mockInsertLesson = vi.fn();
const mockLogPipelineError = vi.fn();

vi.mock("@/lib/supabase/queries", () => ({
  insertPipelineRun: (...args: unknown[]) => mockInsertPipelineRun(...args),
  updatePipelineRun: (...args: unknown[]) => mockUpdatePipelineRun(...args),
  insertResearchRaw: (...args: unknown[]) => mockInsertResearchRaw(...args),
  getResearchRawByRunId: (...args: unknown[]) => mockGetResearchRawByRunId(...args),
  insertReport: (...args: unknown[]) => mockInsertReport(...args),
  getReportById: (...args: unknown[]) => mockGetReportById(...args),
  insertProduct: (...args: unknown[]) => mockInsertProduct(...args),
  updateProduct: (...args: unknown[]) => mockUpdateProduct(...args),
  getProductById: (...args: unknown[]) => mockGetProductById(...args),
  insertLesson: (...args: unknown[]) => mockInsertLesson(...args),
  logPipelineError: (...args: unknown[]) => mockLogPipelineError(...args),
}));

const mockRunResearch = vi.fn();
vi.mock("@/lib/ai/researcher", () => ({
  runResearch: (...args: unknown[]) => mockRunResearch(...args),
}));

const mockAnalyzeOpportunities = vi.fn();
vi.mock("@/lib/ai/analyzer", () => ({
  analyzeOpportunities: (...args: unknown[]) => mockAnalyzeOpportunities(...args),
}));

const mockGenerateProduct = vi.fn();
vi.mock("@/lib/ai/generator", () => ({
  generateProduct: (...args: unknown[]) => mockGenerateProduct(...args),
}));

const mockEvaluateProduct = vi.fn();
vi.mock("@/lib/ai/evaluator", () => ({
  evaluateProduct: (...args: unknown[]) => mockEvaluateProduct(...args),
}));

const mockExtractLessons = vi.fn();
vi.mock("@/lib/ai/lesson-extractor", () => ({
  extractLessons: (...args: unknown[]) => mockExtractLessons(...args),
}));

const mockBuildSpreadsheet = vi.fn();
vi.mock("@/lib/spreadsheet/builder", () => ({
  buildSpreadsheet: (...args: unknown[]) => mockBuildSpreadsheet(...args),
}));

const mockGenerateProductImages = vi.fn();
vi.mock("@/lib/ai/images", () => ({
  generateProductImages: (...args: unknown[]) => mockGenerateProductImages(...args),
}));

const mockUploadFile = vi.fn();
vi.mock("@/lib/supabase/storage", () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
}));

vi.mock("@/config/env", () => ({
  getEnv: () => ({
    OPENAI_API_KEY: "sk-test-openai-key",
  }),
}));

import { executeResearch, executeGeneration, executePostGeneration } from "@/lib/pipeline/orchestrator";
import { makeSpreadsheetSpec } from "../../fixtures/spreadsheet-spec";
import type { Opportunity } from "@/types";

describe("executeResearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertPipelineRun.mockResolvedValue({ id: "run-001", metadata: {} });
    mockUpdatePipelineRun.mockResolvedValue(undefined);
  });

  it("happy path: run created, report saved, run completed", async () => {
    mockRunResearch.mockResolvedValue({
      products: [{ tags: ["budget"], listing_id: 1, title: "Test" }],
      categories_analyzed: ["budgets"],
      top_seller_patterns: "Patterns here",
    });
    mockInsertResearchRaw.mockResolvedValue(undefined);
    mockGetResearchRawByRunId.mockResolvedValue([
      { product_data: { listing_id: 1, title: "Test", tags: ["budget"] } },
    ]);
    mockAnalyzeOpportunities.mockResolvedValue({
      opportunities: [{ niche: "budget", description: "test" }],
      summary: "Good opportunities",
    });
    mockInsertReport.mockResolvedValue({ id: "rpt-001" });

    const result = await executeResearch({ niche: "budgets" });
    expect(result.reportId).toBe("rpt-001");
    expect(mockInsertPipelineRun).toHaveBeenCalled();
    expect(mockUpdatePipelineRun).toHaveBeenCalledWith("run-001", expect.objectContaining({
      status: "completed",
    }));
  });

  it("failure: run marked failed", async () => {
    mockRunResearch.mockRejectedValue(new Error("Research API down"));

    await expect(executeResearch({ niche: "test" })).rejects.toThrow("Research API down");
    expect(mockUpdatePipelineRun).toHaveBeenCalledWith("run-001", expect.objectContaining({
      status: "failed",
    }));
  });
});

describe("executeGeneration", () => {
  const opportunity: Opportunity = {
    id: "opp-001",
    niche: "budget tracker",
    product_type: "spreadsheet_template",
    description: "Monthly budget tracker",
    demand_score: 8,
    competition_score: 5,
    gap_score: 7,
    feasibility_score: 9,
    composite_score: 7.5,
    rationale: "High demand",
    competitor_prices: [999, 1499],
    suggested_price_cents: 1499,
    built: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertPipelineRun.mockResolvedValue({ id: "run-002", metadata: {} });
    mockUpdatePipelineRun.mockResolvedValue(undefined);
    mockGetReportById.mockResolvedValue({ summary: "Market intelligence data" });
  });

  it("happy path: product saved, status qa_pending", async () => {
    const spec = makeSpreadsheetSpec();
    mockGenerateProduct.mockResolvedValue({
      product_type: "spreadsheet_template",
      title: "Budget Tracker",
      description: "A tracker",
      content: spec,
      tags: ["tag1"],
      price_cents: 1499,
      currency: "usd",
      thumbnail_prompt: "Cover",
      preview_prompts: ["P1", "P2", "P3", "P4"],
      taxonomy_id: 2078,
    });
    mockInsertProduct.mockResolvedValue({ id: "prod-001" });

    const result = await executeGeneration("opp-001", "rpt-001", opportunity);
    expect(result.productId).toBe("prod-001");

    // Verify content includes preview_prompts (Bug 1 fix)
    const insertCall = mockInsertProduct.mock.calls[0][0];
    const content = insertCall.content as Record<string, unknown>;
    expect(content.preview_prompts).toEqual(["P1", "P2", "P3", "P4"]);
    expect(insertCall.status).toBe("qa_pending");
  });

  it("stores preview_prompts in content (Bug 1 regression)", async () => {
    const spec = makeSpreadsheetSpec();
    mockGenerateProduct.mockResolvedValue({
      product_type: "spreadsheet_template",
      title: "Test",
      description: "Test",
      content: spec,
      tags: [],
      price_cents: 999,
      currency: "usd",
      thumbnail_prompt: "thumb",
      preview_prompts: ["A", "B", "C", "D"],
      taxonomy_id: 2078,
    });
    mockInsertProduct.mockResolvedValue({ id: "prod-002" });

    await executeGeneration("opp-001", "rpt-001", opportunity);

    const insertCall = mockInsertProduct.mock.calls[0][0];
    expect(insertCall.content.preview_prompts).toEqual(["A", "B", "C", "D"]);
  });
});

describe("executePostGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertPipelineRun.mockResolvedValue({ id: "run-003", metadata: {} });
    mockUpdatePipelineRun.mockResolvedValue(undefined);
    mockUpdateProduct.mockResolvedValue(undefined);
    mockInsertLesson.mockResolvedValue(undefined);
  });

  function setupProductMock() {
    const spec = makeSpreadsheetSpec();
    mockGetProductById.mockResolvedValue({
      id: "prod-001",
      product_type: "spreadsheet_template",
      title: "Budget Tracker",
      description: "A tracker",
      content: { ...spec, preview_prompts: ["P1", "P2", "P3", "P4"] },
      tags: ["budget"],
      price_cents: 1499,
      currency: "usd",
      thumbnail_prompt: "Cover prompt",
      taxonomy_id: 2078,
    });
  }

  it("happy path (QA passes) → status = ready_for_review", async () => {
    setupProductMock();
    mockEvaluateProduct.mockResolvedValue({
      passed: true,
      scores: { structure_quality: 8, formula_correctness: 9, visual_design: 7, usability: 8, listing_copy: 7 },
      feedback: "Good.",
      attempt: 1,
    });
    mockExtractLessons.mockResolvedValue([]);
    mockBuildSpreadsheet.mockResolvedValue(Buffer.from("xlsx-data"));
    mockUploadFile.mockResolvedValue("https://storage.example.com/file.xlsx");
    mockGenerateProductImages.mockResolvedValue([Buffer.from("img1"), Buffer.from("img2")]);

    await executePostGeneration("prod-001");

    // Should set status to ready_for_review
    const finalUpdate = mockUpdateProduct.mock.calls.find(
      (call) => call[1].status === "ready_for_review",
    );
    expect(finalUpdate).toBeDefined();
  });

  it("QA fails → status = qa_fail", async () => {
    setupProductMock();
    mockEvaluateProduct.mockResolvedValue({
      passed: false,
      scores: { structure_quality: 4, formula_correctness: 5, visual_design: 3, usability: 4, listing_copy: 5 },
      feedback: "Low quality.",
      attempt: 1,
    });
    mockExtractLessons.mockResolvedValue([]);
    mockBuildSpreadsheet.mockResolvedValue(Buffer.from("xlsx-data"));
    mockUploadFile.mockResolvedValue("https://storage.example.com/file.xlsx");
    mockGenerateProductImages.mockResolvedValue([Buffer.from("img")]);

    await executePostGeneration("prod-001");

    const finalUpdate = mockUpdateProduct.mock.calls.find(
      (call) => call[1].status === "qa_fail",
    );
    expect(finalUpdate).toBeDefined();
  });

  it("spreadsheet build fails → throws, qa_fail (Bug 2 regression)", async () => {
    setupProductMock();
    mockEvaluateProduct.mockResolvedValue({
      passed: true,
      scores: { structure_quality: 8, formula_correctness: 8, visual_design: 8, usability: 8, listing_copy: 8 },
      feedback: "Good.",
      attempt: 1,
    });
    mockExtractLessons.mockResolvedValue([]);
    mockBuildSpreadsheet.mockRejectedValue(new Error("ExcelJS crash"));

    await expect(executePostGeneration("prod-001")).rejects.toThrow("Spreadsheet build failed");
    // Product should be marked qa_fail via outer catch
    expect(mockUpdateProduct).toHaveBeenCalledWith("prod-001", { status: "qa_fail" });
  });

  it("image generation fails → throws, qa_fail (Bug 3 regression)", async () => {
    setupProductMock();
    mockEvaluateProduct.mockResolvedValue({
      passed: true,
      scores: { structure_quality: 8, formula_correctness: 8, visual_design: 8, usability: 8, listing_copy: 8 },
      feedback: "Good.",
      attempt: 1,
    });
    mockExtractLessons.mockResolvedValue([]);
    mockBuildSpreadsheet.mockResolvedValue(Buffer.from("xlsx-data"));
    mockUploadFile.mockResolvedValue("https://storage.example.com/file.xlsx");
    mockGenerateProductImages.mockRejectedValue(new Error("OpenAI down"));

    await expect(executePostGeneration("prod-001")).rejects.toThrow("Image generation failed");
    expect(mockUpdateProduct).toHaveBeenCalledWith("prod-001", { status: "qa_fail" });
  });

  it("lesson extraction fails → continues (non-blocking)", async () => {
    setupProductMock();
    mockEvaluateProduct.mockResolvedValue({
      passed: true,
      scores: { structure_quality: 8, formula_correctness: 8, visual_design: 8, usability: 8, listing_copy: 8 },
      feedback: "Good.",
      attempt: 1,
    });
    mockExtractLessons.mockRejectedValue(new Error("Lesson extraction failed"));
    mockBuildSpreadsheet.mockResolvedValue(Buffer.from("xlsx-data"));
    mockUploadFile.mockResolvedValue("https://storage.example.com/file.xlsx");
    mockGenerateProductImages.mockResolvedValue([Buffer.from("img")]);

    // Should not throw
    await executePostGeneration("prod-001");

    const finalUpdate = mockUpdateProduct.mock.calls.find(
      (call) => call[1].status === "ready_for_review",
    );
    expect(finalUpdate).toBeDefined();
  });

  it("preview_prompts round-trip from content JSON", async () => {
    setupProductMock();
    mockEvaluateProduct.mockImplementation(async (product) => {
      // Verify preview_prompts were recovered from content
      expect(product.preview_prompts).toEqual(["P1", "P2", "P3", "P4"]);
      return {
        passed: true,
        scores: { structure_quality: 8, formula_correctness: 8, visual_design: 8, usability: 8, listing_copy: 8 },
        feedback: "ok",
        attempt: 1,
      };
    });
    mockExtractLessons.mockResolvedValue([]);
    mockBuildSpreadsheet.mockResolvedValue(Buffer.from("xlsx"));
    mockUploadFile.mockResolvedValue("https://storage.example.com/file.xlsx");
    mockGenerateProductImages.mockResolvedValue([Buffer.from("img")]);

    await executePostGeneration("prod-001");
  });

  it("progress callbacks fire (logged on error per Bug 7 fix)", async () => {
    setupProductMock();
    mockEvaluateProduct.mockResolvedValue({
      passed: true,
      scores: { structure_quality: 8, formula_correctness: 8, visual_design: 8, usability: 8, listing_copy: 8 },
      feedback: "ok",
      attempt: 1,
    });
    mockExtractLessons.mockResolvedValue([]);
    mockBuildSpreadsheet.mockResolvedValue(Buffer.from("xlsx"));
    mockUploadFile.mockResolvedValue("https://storage.example.com/file.xlsx");
    mockGenerateProductImages.mockResolvedValue([Buffer.from("img")]);

    // Track updatePipelineRun calls to verify progress
    const progressCalls: unknown[] = [];
    mockUpdatePipelineRun.mockImplementation(async (_id: unknown, update: unknown) => {
      progressCalls.push(update);
    });

    await executePostGeneration("prod-001");

    // Should have been called multiple times for progress updates
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it("throws when product not found (Bug 6 regression)", async () => {
    mockGetProductById.mockResolvedValue(null);

    await expect(executePostGeneration("nonexistent")).rejects.toThrow("Product not found");
  });
});
