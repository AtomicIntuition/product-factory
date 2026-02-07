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
import { generateProductPdf } from "@/lib/pdf/generator";
import { generateThumbnail } from "@/lib/ai/thumbnail";
import { uploadFile } from "@/lib/supabase/storage";
import { getEnv } from "@/config/env";
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
    // Generate product with streaming progress (0-85%)
    console.log(`[pipeline] Generating product for opportunity: ${opportunity.niche}`);
    let lastSavedPct = 0;
    const generated = await generateProduct({
      opportunity,
      attempt: 1,
      onProgress: (pct) => {
        // Scale generation progress to 0-85%
        const scaledPct = Math.round(pct * 0.85);
        if (scaledPct - lastSavedPct >= 5 || pct === 100) {
          lastSavedPct = scaledPct;
          updatePipelineRun(pipelineRun.id, {
            metadata: { ...pipelineRun.metadata, progress: scaledPct },
          }).catch(() => {});
        }
      },
    });
    console.log(`[pipeline] Generated product: "${generated.title}" (${generated.content.total_prompts} prompts)`);

    // QA evaluation (85-95%)
    console.log(`[pipeline] Running QA evaluation...`);
    await updatePipelineRun(pipelineRun.id, {
      metadata: { ...pipelineRun.metadata, progress: 87 },
    }).catch(() => {});

    const qaResult = await evaluateProduct(generated);
    qaResult.attempt = 1;

    console.log(`[pipeline] QA result: ${qaResult.passed ? "PASSED" : "FAILED"} (scores: ${JSON.stringify(qaResult.scores)})`);

    await updatePipelineRun(pipelineRun.id, {
      metadata: { ...pipelineRun.metadata, progress: 95 },
    }).catch(() => {});

    // Determine status based on QA result
    const finalStatus = qaResult.passed ? "ready_for_review" as const : "qa_fail" as const;

    // Save product to DB (95-100%)
    const product = await insertProduct({
      opportunity_id: opportunityId,
      report_id: reportId,
      product_type: generated.product_type,
      title: generated.title,
      description: generated.description,
      content: generated.content as unknown as Record<string, unknown>,
      content_file_url: null,
      thumbnail_url: null,
      tags: generated.tags,
      price_cents: generated.price_cents,
      currency: generated.currency,
      thumbnail_prompt: generated.thumbnail_prompt,
      qa_score: qaResult,
      qa_attempts: 1,
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
        progress: 100,
        qa_passed: qaResult.passed,
        qa_scores: qaResult.scores,
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

    // Step 1: Generate PDF from content
    console.log(`[publish] Generating PDF for product: ${product.title}`);
    const content = product.content as {
      format: string;
      sections: { title: string; prompts: string[] }[];
      total_prompts: number;
    };
    const pdfBuffer = generateProductPdf({
      title: product.title,
      description: product.description,
      content,
      price_cents: product.price_cents,
    });
    const pdfUrl = await uploadFile(
      `products/${productId}/content.pdf`,
      pdfBuffer,
      "application/pdf",
    );
    console.log(`[publish] PDF uploaded: ${pdfUrl}`);

    // Step 2: Generate thumbnail with DALL-E (if API key configured)
    let thumbnailUrl: string | null = null;
    const env = getEnv();
    if (env.OPENAI_API_KEY && product.thumbnail_prompt) {
      try {
        console.log(`[publish] Generating thumbnail with DALL-E...`);
        const thumbnailBuffer = await generateThumbnail(product.thumbnail_prompt);
        thumbnailUrl = await uploadFile(
          `products/${productId}/thumbnail.png`,
          thumbnailBuffer,
          "image/png",
        );
        console.log(`[publish] Thumbnail uploaded: ${thumbnailUrl}`);
      } catch (thumbError) {
        // Non-fatal: publish without thumbnail if DALL-E fails
        console.error(`[publish] Thumbnail generation failed, continuing without:`, thumbError);
      }
    } else {
      console.log(`[publish] Skipping thumbnail (no OPENAI_API_KEY or thumbnail_prompt)`);
    }

    // Step 3: Save asset URLs to product
    await updateProduct(productId, {
      content_file_url: pdfUrl,
      thumbnail_url: thumbnailUrl,
    });

    // Step 4: Create product on Gumroad with asset URLs
    const createResponse = await gumroad.createProduct({
      name: product.title,
      description: product.description,
      price: product.price_cents,
      tags: product.tags,
      url: pdfUrl,
      preview_url: thumbnailUrl ?? undefined,
    });

    const gumroadProduct = createResponse.product as
      | { id: string; short_url: string }
      | undefined;

    if (!gumroadProduct?.id) {
      throw new Error("Gumroad createProduct did not return a product ID");
    }

    // Step 5: Enable the product (make it live)
    await gumroad.enableProduct(gumroadProduct.id);

    const gumroadUrl = gumroadProduct.short_url || `https://gumroad.com/l/${gumroadProduct.id}`;

    // Step 6: Update product with Gumroad info
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
        content_file_url: pdfUrl,
        thumbnail_url: thumbnailUrl,
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
