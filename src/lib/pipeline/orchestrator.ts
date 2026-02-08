import {
  insertResearchRaw,
  insertReport,
  getResearchRawByRunId,
  insertProduct,
  updateProduct,
  getProductById,
  insertPipelineRun,
  updatePipelineRun,
  insertLesson,
} from "@/lib/supabase/queries";
import { runResearch } from "@/lib/ai/researcher";
import { analyzeOpportunities } from "@/lib/ai/analyzer";
import { generateProduct } from "@/lib/ai/generator";
import { evaluateProduct } from "@/lib/ai/evaluator";
import { extractLessons } from "@/lib/ai/lesson-extractor";
import { gumroad } from "@/lib/gumroad/client";
import { generateProductPdf } from "@/lib/pdf/generator";
import { generateThumbnail } from "@/lib/ai/thumbnail";
import { uploadFile } from "@/lib/supabase/storage";
import { getEnv } from "@/config/env";
import type { Opportunity, GumroadProductData } from "@/types";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return JSON.stringify(error);
}

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
      topSellerPatterns: researchResult.top_seller_patterns,
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
        error: errorMessage(error),
      },
    });
    throw error;
  }
}

// Phase 1 of generation: create product content with Claude and save to DB.
// QA, lessons, and thumbnail happen in a separate function call (executePostGeneration)
// so each gets its own 300s Vercel timeout.
export async function executeGeneration(
  opportunityId: string,
  reportId: string,
  opportunity: Opportunity,
): Promise<{ productId: string; pipelineRunId: string }> {
  const pipelineRun = await insertPipelineRun({
    phase: "generate",
    status: "running",
    metadata: { opportunityId, reportId },
    started_at: new Date().toISOString(),
    completed_at: null,
  });

  try {
    // Generate product with streaming progress (0-90%)
    console.log(`[generate] Generating product for opportunity: ${opportunity.niche}`);
    let lastSavedPct = 0;
    const generated = await generateProduct({
      opportunity,
      attempt: 1,
      onProgress: (pct) => {
        const scaledPct = Math.round(pct * 0.9);
        if (scaledPct - lastSavedPct >= 5 || pct === 100) {
          lastSavedPct = scaledPct;
          updatePipelineRun(pipelineRun.id, {
            metadata: { ...pipelineRun.metadata, progress: scaledPct },
          }).catch(() => {});
        }
      },
    });
    console.log(`[generate] Generated product: "${generated.title}" (${generated.content.total_prompts} prompts)`);

    // Save product to DB (90-100%)
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
      qa_score: null,
      qa_attempts: 0,
      gumroad_id: null,
      gumroad_url: null,
      status: "qa_pending",
    });

    // Mark generation as completed
    await updatePipelineRun(pipelineRun.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      metadata: {
        ...pipelineRun.metadata,
        productId: product.id,
        progress: 100,
      },
    });

    console.log(`[generate] Product saved: ${product.id}, triggering QA phase...`);
    return { productId: product.id, pipelineRunId: pipelineRun.id };
  } catch (error) {
    await updatePipelineRun(pipelineRun.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      metadata: {
        ...pipelineRun.metadata,
        error: errorMessage(error),
      },
    });
    throw error;
  }
}

// Phase 2: QA evaluation, lesson extraction, and thumbnail generation.
// Runs in its own serverless function invocation with its own 300s timeout.
export async function executePostGeneration(
  productId: string,
): Promise<void> {
  const product = await getProductById(productId);

  const pipelineRun = await insertPipelineRun({
    phase: "qa",
    status: "running",
    metadata: { productId },
    started_at: new Date().toISOString(),
    completed_at: null,
  });

  try {
    // Reconstruct the generated product shape for the evaluator
    const content = product.content as {
      format: string;
      sections: { title: string; prompts: string[] }[];
      total_prompts: number;
    };
    const generatedProduct = {
      product_type: product.product_type,
      title: product.title,
      description: product.description,
      content,
      tags: product.tags,
      price_cents: product.price_cents,
      currency: product.currency,
      thumbnail_prompt: product.thumbnail_prompt,
    };

    // QA evaluation (0-50%)
    console.log(`[qa] Running QA evaluation for "${product.title}"...`);
    await updatePipelineRun(pipelineRun.id, {
      metadata: { ...pipelineRun.metadata, progress: 10 },
    }).catch(() => {});

    const qaResult = await evaluateProduct(generatedProduct);
    qaResult.attempt = 1;

    console.log(`[qa] QA result: ${qaResult.passed ? "PASSED" : "FAILED"} (scores: ${JSON.stringify(qaResult.scores)})`);

    await updatePipelineRun(pipelineRun.id, {
      metadata: { ...pipelineRun.metadata, progress: 50 },
    }).catch(() => {});

    // Extract lessons from QA result (50-70%)
    try {
      console.log(`[qa] Extracting lessons from QA result...`);
      const lessons = await extractLessons({
        qaResult,
        productType: product.product_type,
        niche: product.tags[0] ?? "general",
        title: product.title,
      });
      for (const lesson of lessons) {
        await insertLesson({
          product_id: productId,
          phase: "generation",
          lesson: lesson.lesson,
          dimension: lesson.dimension,
          severity: lesson.severity,
          source_feedback: qaResult.feedback,
          status: "active",
        });
      }
      console.log(`[qa] Stored ${lessons.length} lessons`);
    } catch (lessonError) {
      console.error(`[qa] Lesson extraction failed, continuing:`, lessonError);
    }

    await updatePipelineRun(pipelineRun.id, {
      metadata: { ...pipelineRun.metadata, progress: 70 },
    }).catch(() => {});

    // Generate thumbnail (70-95%)
    const env = getEnv();
    if (env.OPENAI_API_KEY && product.thumbnail_prompt) {
      try {
        console.log(`[qa] Generating thumbnail with gpt-image-1...`);
        const thumbnailBuffer = await generateThumbnail(product.thumbnail_prompt);
        console.log(`[qa] Got ${thumbnailBuffer.length} bytes, uploading...`);
        const thumbnailUrl = await uploadFile(
          `products/${productId}/thumbnail.png`,
          thumbnailBuffer,
          "image/png",
        );
        await updateProduct(productId, { thumbnail_url: thumbnailUrl });
        console.log(`[qa] Thumbnail saved: ${thumbnailUrl}`);
      } catch (thumbError) {
        const errMsg = thumbError instanceof Error ? thumbError.message : String(thumbError);
        console.error(`[qa] Thumbnail generation failed: ${errMsg}`);
      }
    } else {
      console.log(`[qa] Skipping thumbnail — OPENAI_API_KEY: ${env.OPENAI_API_KEY ? "set" : "NOT SET"}, thumbnail_prompt: ${product.thumbnail_prompt ? "yes" : "NO"}`);
    }

    await updatePipelineRun(pipelineRun.id, {
      metadata: { ...pipelineRun.metadata, progress: 85 },
    }).catch(() => {});

    // Generate PDF for preview (85-95%)
    try {
      console.log(`[qa] Generating PDF for preview...`);
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
      await updateProduct(productId, { content_file_url: pdfUrl });
      console.log(`[qa] PDF saved: ${pdfUrl}`);
    } catch (pdfError) {
      const errMsg = pdfError instanceof Error ? pdfError.message : String(pdfError);
      console.error(`[qa] PDF generation failed: ${errMsg}`);
    }

    await updatePipelineRun(pipelineRun.id, {
      metadata: { ...pipelineRun.metadata, progress: 95 },
    }).catch(() => {});

    // Update product with QA result and final status
    const finalStatus = qaResult.passed ? "ready_for_review" as const : "qa_fail" as const;
    await updateProduct(productId, {
      qa_score: qaResult,
      qa_attempts: 1,
      status: finalStatus,
    });

    // Complete pipeline run
    await updatePipelineRun(pipelineRun.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      metadata: {
        ...pipelineRun.metadata,
        productId,
        progress: 100,
        qa_passed: qaResult.passed,
        qa_scores: qaResult.scores,
      },
    });

    console.log(`[qa] Post-generation complete. Product status: ${finalStatus}`);
  } catch (error) {
    // Mark product as failed if QA crashes
    await updateProduct(productId, { status: "qa_fail" }).catch(() => {});

    await updatePipelineRun(pipelineRun.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      metadata: {
        ...pipelineRun.metadata,
        error: errorMessage(error),
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

    // Step 2: Use existing thumbnail or generate if missing
    let thumbnailUrl: string | null = product.thumbnail_url;
    if (!thumbnailUrl) {
      const env = getEnv();
      if (env.OPENAI_API_KEY && product.thumbnail_prompt) {
        try {
          console.log(`[publish] Generating thumbnail (wasn't generated earlier)...`);
          const thumbnailBuffer = await generateThumbnail(product.thumbnail_prompt);
          thumbnailUrl = await uploadFile(
            `products/${productId}/thumbnail.png`,
            thumbnailBuffer,
            "image/png",
          );
          console.log(`[publish] Thumbnail uploaded: ${thumbnailUrl}`);
        } catch (thumbError) {
          console.error(`[publish] Thumbnail generation failed, continuing without:`, thumbError);
        }
      }
    } else {
      console.log(`[publish] Using existing thumbnail: ${thumbnailUrl}`);
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
        error: errorMessage(error),
      },
    });

    throw error;
  }
}
