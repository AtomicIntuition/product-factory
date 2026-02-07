import {
  insertResearchRaw,
  insertReport,
  getResearchRawByRunId,
  insertProduct,
  updateProduct,
  getProductById,
  insertPipelineRun,
  updatePipelineRun,
} from "@/lib/supabase/queries";
import { runResearch } from "@/lib/ai/researcher";
import { analyzeOpportunities } from "@/lib/ai/analyzer";
import { generateProduct } from "@/lib/ai/generator";
import { evaluateProduct } from "@/lib/ai/evaluator";
import { gumroad } from "@/lib/gumroad/client";
import type { Opportunity, GumroadProductData } from "@/types";

export async function executeResearch(params: {
  niche?: string;
  seedUrls?: string[];
}): Promise<{ runId: string; reportId: string }> {
  const runId = crypto.randomUUID();

  const pipelineRun = await insertPipelineRun({
    phase: "research",
    status: "running",
    metadata: { niche: params.niche ?? null, seedUrls: params.seedUrls ?? [] },
    started_at: new Date().toISOString(),
    completed_at: null,
  });

  try {
    // Phase 1: Run research
    const researchResult = await runResearch(params);

    // Save raw research data
    const researchRows = researchResult.products.map((product) => ({
      run_id: runId,
      source: "web_search" as const,
      category: product.category,
      product_data: product,
    }));
    await insertResearchRaw(researchRows);

    // Phase 2: Analyze opportunities
    const rawData = await getResearchRawByRunId(runId);
    const productData: GumroadProductData[] = rawData.map((r) => r.product_data);

    const analysisResult = await analyzeOpportunities({
      researchData: productData,
      categories: researchResult.categories_analyzed,
    });

    // Save report
    const report = await insertReport({
      run_id: runId,
      opportunities: analysisResult.opportunities.map((opp) => ({
        ...opp,
        id: crypto.randomUUID(),
        built: false,
      })),
      summary: analysisResult.summary,
      status: "active",
    });

    // Update pipeline run to completed
    await updatePipelineRun(pipelineRun.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      metadata: {
        ...pipelineRun.metadata,
        products_found: researchResult.products.length,
        opportunities_identified: analysisResult.opportunities.length,
      },
    });

    return { runId, reportId: report.id };
  } catch (error) {
    await updatePipelineRun(pipelineRun.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      metadata: {
        ...pipelineRun.metadata,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function executeGeneration(
  opportunityId: string,
  reportId: string,
  opportunity: Opportunity,
): Promise<{ productId: string }> {
  const pipelineRun = await insertPipelineRun({
    phase: "generate",
    status: "running",
    metadata: { opportunityId, reportId },
    started_at: new Date().toISOString(),
    completed_at: null,
  });

  try {
    // Generate product with streaming progress
    console.log(`[pipeline] Generating product for opportunity: ${opportunity.niche}`);
    let lastSavedPct = 0;
    const lastGenerated = await generateProduct({
      opportunity,
      attempt: 1,
      onProgress: (pct) => {
        // Throttle DB writes: save every 5% change
        if (pct - lastSavedPct >= 5 || pct === 100) {
          lastSavedPct = pct;
          updatePipelineRun(pipelineRun.id, {
            metadata: { ...pipelineRun.metadata, progress: pct },
          }).catch(() => {});
        }
      },
    });
    console.log(`[pipeline] Generated product: "${lastGenerated.title}" (${lastGenerated.content.total_prompts} prompts)`);

    const finalStatus = "ready_for_review" as const;

    // Save product to DB
    const product = await insertProduct({
      opportunity_id: opportunityId,
      report_id: reportId,
      product_type: lastGenerated.product_type,
      title: lastGenerated.title,
      description: lastGenerated.description,
      content: lastGenerated.content as unknown as Record<string, unknown>,
      content_file_url: null,
      tags: lastGenerated.tags,
      price_cents: lastGenerated.price_cents,
      currency: lastGenerated.currency,
      thumbnail_prompt: lastGenerated.thumbnail_prompt,
      qa_score: null,
      qa_attempts: 0,
      gumroad_id: null,
      gumroad_url: null,
      status: finalStatus,
    });

    // Update pipeline run
    await updatePipelineRun(pipelineRun.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      metadata: {
        ...pipelineRun.metadata,
        productId: product.id,

      },
    });

    return { productId: product.id };
  } catch (error) {
    await updatePipelineRun(pipelineRun.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      metadata: {
        ...pipelineRun.metadata,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function executePublish(
  productId: string,
): Promise<{ gumroadUrl: string }> {
  // Get product from DB
  const product = await getProductById(productId);

  // Validate required fields
  if (!product.title || !product.description || !product.price_cents || !product.tags?.length) {
    throw new Error(
      `Product ${productId} is missing required fields for publishing: ` +
        [
          !product.title && "title",
          !product.description && "description",
          !product.price_cents && "price_cents",
          !product.tags?.length && "tags",
        ]
          .filter(Boolean)
          .join(", "),
    );
  }

  const pipelineRun = await insertPipelineRun({
    phase: "publish",
    status: "running",
    metadata: { productId },
    started_at: new Date().toISOString(),
    completed_at: null,
  });

  try {
    // Update product status to publishing
    await updateProduct(productId, { status: "publishing" });

    // Create product on Gumroad
    const createResponse = await gumroad.createProduct({
      name: product.title,
      description: product.description,
      price: product.price_cents,
      tags: product.tags,
    });

    const gumroadProduct = createResponse.product as
      | { id: string; short_url: string }
      | undefined;

    if (!gumroadProduct?.id) {
      throw new Error("Gumroad createProduct did not return a product ID");
    }

    // Enable the product (make it live)
    await gumroad.enableProduct(gumroadProduct.id);

    const gumroadUrl = gumroadProduct.short_url || `https://gumroad.com/l/${gumroadProduct.id}`;

    // Update product with Gumroad info
    await updateProduct(productId, {
      gumroad_id: gumroadProduct.id,
      gumroad_url: gumroadUrl,
      status: "published",
    });

    // Update pipeline run
    await updatePipelineRun(pipelineRun.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      metadata: {
        ...pipelineRun.metadata,
        gumroad_id: gumroadProduct.id,
        gumroad_url: gumroadUrl,
      },
    });

    return { gumroadUrl };
  } catch (error) {
    // Update product status to failed
    await updateProduct(productId, { status: "publish_failed" }).catch(() => {
      // Swallow update error to preserve original error
    });

    await updatePipelineRun(pipelineRun.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      metadata: {
        ...pipelineRun.metadata,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}
