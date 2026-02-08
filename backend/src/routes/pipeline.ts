import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  executeResearch,
  executeGeneration,
  executePostGeneration,
} from "@/lib/pipeline/orchestrator";
import type { Opportunity } from "@/types";

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
]);

export const pipelineRouter = Router();

pipelineRouter.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = PipelineActionSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const { action, params } = parsed.data;

    switch (action) {
      case "research": {
        const result = await executeResearch(params);
        res.status(201).json(result);
        return;
      }

      case "generate": {
        // Return 202 immediately, then run generation + post-generation sequentially
        res.status(202).json({ status: "started" });

        // Run both phases in-process — no timeout limit on Railway
        executeGeneration(
          params.opportunityId,
          params.reportId,
          params.opportunity as Opportunity,
        )
          .then(({ productId }) => {
            console.log(
              `[pipeline] Generation done, running post-generation for ${productId}`,
            );
            return executePostGeneration(productId);
          })
          .then(() => {
            console.log("[pipeline] Full generation pipeline completed");
          })
          .catch((err) => {
            console.error("[pipeline] Generation pipeline failed:", err);
          });
        return;
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[pipeline] Error:", error);
    res.status(500).json({ error: message });
  }
});
