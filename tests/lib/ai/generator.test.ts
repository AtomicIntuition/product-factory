import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPromptClaude = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  promptClaude: (...args: unknown[]) => mockPromptClaude(...args),
}));

const mockGetActiveLessons = vi.fn();
vi.mock("@/lib/supabase/queries", () => ({
  getActiveLessons: (...args: unknown[]) => mockGetActiveLessons(...args),
}));

import { generateProduct } from "@/lib/ai/generator";
import type { Opportunity } from "@/types";

const opportunity: Opportunity = {
  id: "opp-001",
  niche: "budget tracker",
  product_type: "spreadsheet_template",
  description: "Monthly budget tracker for households",
  demand_score: 8,
  competition_score: 5,
  gap_score: 7,
  feasibility_score: 9,
  composite_score: 7.5,
  rationale: "High demand, moderate competition",
  competitor_prices: [999, 1499, 1999],
  suggested_price_cents: 1499,
  built: false,
};

function makeBlueprintResponse() {
  return {
    product_type: "spreadsheet_template",
    title: "Budget Tracker Template",
    description: "A great budget tracker.",
    tags: ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10", "tag11", "tag12", "tag13"],
    price_cents: 1499,
    currency: "usd",
    taxonomy_id: 2078,
    thumbnail_prompt: "Cover image prompt",
    preview_prompts: ["Preview 1", "Preview 2", "Preview 3", "Preview 4"],
    sheets: [
      { name: "Instructions", purpose: "Guide", column_plan: "A", formula_plan: "none" },
      { name: "Budget", purpose: "Track spending", column_plan: "A,B,C", formula_plan: "SUM" },
    ],
    color_scheme: {
      primary: "#2B579A", secondary: "#5B9BD5", accent: "#ED7D31",
      header_bg: "#2B579A", header_text: "#FFFFFF", alt_row_bg: "#F0F4FA",
    },
  };
}

function makeSheetResponse(name: string) {
  return {
    name,
    purpose: "Test",
    is_instructions: name === "Instructions",
    columns: [{ letter: "A", header: "Col", width: 20, type: "text" }],
    rows: [{ row: 1, is_header: true, is_total: false, is_sample: false, cells: { A: { value: "Header" } } }],
    frozen: { rows: 1, cols: 0 },
    merged_cells: [],
    protected_ranges: [],
    conditional_formats: [],
  };
}

describe("generateProduct", () => {
  beforeEach(() => {
    mockPromptClaude.mockReset();
    mockGetActiveLessons.mockReset();
    mockGetActiveLessons.mockResolvedValue([]);
  });

  it("assembles blueprint + sheets into a correct GeneratedProduct", async () => {
    mockPromptClaude
      .mockResolvedValueOnce(makeBlueprintResponse()) // blueprint call
      .mockResolvedValueOnce(makeSheetResponse("Instructions")) // sheet 1
      .mockResolvedValueOnce(makeSheetResponse("Budget")); // sheet 2

    const result = await generateProduct({ opportunity, attempt: 1 });
    expect(result.title).toBe("Budget Tracker Template");
    expect(result.content.sheets).toHaveLength(2);
    expect(result.content.sheets[0].name).toBe("Instructions");
    expect(result.content.sheets[1].name).toBe("Budget");
    expect(result.content.color_scheme.primary).toBe("#2B579A");
  });

  it("populates preview_prompts from blueprint", async () => {
    mockPromptClaude
      .mockResolvedValueOnce(makeBlueprintResponse())
      .mockResolvedValueOnce(makeSheetResponse("Instructions"))
      .mockResolvedValueOnce(makeSheetResponse("Budget"));

    const result = await generateProduct({ opportunity, attempt: 1 });
    expect(result.preview_prompts).toHaveLength(4);
    expect(result.preview_prompts[0]).toBe("Preview 1");
    expect(result.thumbnail_prompt).toBe("Cover image prompt");
  });

  it("calls progress callback with increasing percentages", async () => {
    mockPromptClaude
      .mockResolvedValueOnce(makeBlueprintResponse())
      .mockResolvedValueOnce(makeSheetResponse("Instructions"))
      .mockResolvedValueOnce(makeSheetResponse("Budget"));

    const progressValues: number[] = [];
    await generateProduct({
      opportunity,
      attempt: 1,
      onProgress: (pct) => progressValues.push(pct),
    });

    expect(progressValues.length).toBeGreaterThan(0);
    // Should end at 100
    expect(progressValues[progressValues.length - 1]).toBe(100);
    // Should be non-decreasing
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
  });

  it("injects lessons into system prompt when available", async () => {
    mockGetActiveLessons.mockResolvedValueOnce([
      { id: "l1", product_id: null, phase: "generation", lesson: "Use alternating rows", dimension: "visual_design", severity: 3, source_feedback: null, status: "active", created_at: "" },
    ]);
    mockPromptClaude
      .mockResolvedValueOnce(makeBlueprintResponse())
      .mockResolvedValueOnce(makeSheetResponse("Instructions"))
      .mockResolvedValueOnce(makeSheetResponse("Budget"));

    await generateProduct({ opportunity, attempt: 1 });

    // The blueprint call (first promptClaude) should include lessons
    const blueprintCall = mockPromptClaude.mock.calls[0][0];
    expect(blueprintCall.system).toContain("LESSONS FROM PREVIOUS PRODUCTS");
    expect(blueprintCall.system).toContain("Use alternating rows");
  });

  it("continues generation when lessons fetch fails", async () => {
    mockGetActiveLessons.mockRejectedValueOnce(new Error("DB down"));
    mockPromptClaude
      .mockResolvedValueOnce(makeBlueprintResponse())
      .mockResolvedValueOnce(makeSheetResponse("Instructions"))
      .mockResolvedValueOnce(makeSheetResponse("Budget"));

    const result = await generateProduct({ opportunity, attempt: 1 });
    expect(result.title).toBe("Budget Tracker Template");
  });

  it("forwards market intelligence to blueprint prompt", async () => {
    mockPromptClaude
      .mockResolvedValueOnce(makeBlueprintResponse())
      .mockResolvedValueOnce(makeSheetResponse("Instructions"))
      .mockResolvedValueOnce(makeSheetResponse("Budget"));

    await generateProduct({
      opportunity,
      attempt: 1,
      marketIntelligence: "Top sellers use color coding and charts",
    });

    const blueprintCall = mockPromptClaude.mock.calls[0][0];
    expect(blueprintCall.system).toContain("Top sellers use color coding and charts");
  });
});
