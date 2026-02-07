import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { getLatestPipelineRuns, deletePipelineRun } from "@/lib/supabase/queries";
import {
  executeResearch,
  executeGeneration,
  executePublish,
} from "@/lib/pipeline/orchestrator";
import type { Opportunity } from "@/types";

// Allow long-running pipeline operations (Vercel hobby plan max: 300s)
export const maxDuration = 300;

const OpportunitySchema = z.object({
  id: z.string(),
  niche: z.string(),
  product_type: z.string(),
  description: z.string(),
  demand_score: z.number(),
  competition_score: z.number(),
  gap_score: z.number(),
  feasibility_score: z.number(),
  composite_score: z.number(),
  rationale: z.string(),
  competitor_prices: z.array(z.number()),
  suggested_price_cents: z.number(),
  built: z.boolean(),
});

const PipelineActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("research"),
    params: z.object({
      niche: z.string().optional(),
      seedUrls: z.array(z.string().url()).optional(),
    }),
  }),
  z.object({
    action: z.literal("generate"),
    params: z.object({
      opportunityId: z.string(),
      reportId: z.string(),
      opportunity: OpportunitySchema,
    }),
  }),
  z.object({
    action: z.literal("publish"),
    params: z.object({
      productId: z.string(),
    }),
  }),
]);

export async function GET() {
  try {
    const runs = await getLatestPipelineRuns();
    return NextResponse.json(runs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }
    await deletePipelineRun(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = PipelineActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { action, params } = parsed.data;
    let result: unknown;

    switch (action) {
      case "research":
        result = await executeResearch(params);
        break;
      case "generate":
        // Use after() to keep the serverless function alive on Vercel
        // while returning an immediate response to the client.
        // Progress is tracked via streaming and written to pipeline_runs metadata.
        after(
          executeGeneration(
            params.opportunityId,
            params.reportId,
            params.opportunity as Opportunity,
          ).catch((err) => {
            console.error("[pipeline] Generation failed:", err);
          }),
        );
        return NextResponse.json({ status: "started" }, { status: 202 });
      case "publish":
        result = await executePublish(params.productId);
        break;
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
