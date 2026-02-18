import {
  insertResearchRaw,
  insertReport,
  getReportById,
  getResearchRawByRunId,
  insertProduct,
  updateProduct,
  getProductById,
  insertPipelineRun,
  updatePipelineRun,
  insertLesson,
  logPipelineError,
} from "@/lib/supabase/queries";
import { runResearch } from "@/lib/ai/researcher";
import { analyzeOpportunities } from "@/lib/ai/analyzer";
import { generateProduct } from "@/lib/ai/generator";
import { evaluateProduct } from "@/lib/ai/evaluator";
import { extractLessons } from "@/lib/ai/lesson-extractor";
import { buildSpreadsheet } from "@/lib/spreadsheet/builder";
import { generateProductImages } from "@/lib/ai/images";
import { uploadFile } from "@/lib/supabase/storage";
import { getEnv } from "@/config/env";
import type { Opportunity, EtsyListingData, SpreadsheetSpec } from "@/types";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return JSON.stringify(error);
}

export async function executeResearch(params: {
  niche?: string;
  keywords?: string[];
}): Promise<{ runId: string; reportId: string }> {
  const runId = crypto.randomUUID();

  const pipelineRun = await insertPipelineRun({
    phase: "research",
    status: "running",
    metadata: { niche: params.niche ?? null, keywords: params.keywords ?? [] },
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
      category: product.tags[0] ?? "spreadsheet",
      product_data: product,
    }));
    await insertResearchRaw(researchRows);

    // Phase 2: Analyze opportunities
    const rawData = await getResearchRawByRunId(runId);
    const productData: EtsyListingData[] = rawData.map((r) => r.product_data);

    const analysisResult = await analyzeOpportunities({
      researchData: productData,
      categories: researchResult.categories_analyzed,
      topSellerPatterns: researchResult.top_seller_patterns,
    });

    // Save report (include top seller patterns in summary for downstream use)
    const fullSummary = researchResult.top_seller_patterns
      ? `${analysisResult.summary}\n\n---\n\nTOP SELLER PATTERNS:\n${researchResult.top_seller_patterns}`
      : analysisResult.summary;

    const report = await insertReport({
      run_id: runId,
      opportunities: analysisResult.opportunities.map((opp) => ({
        ...opp,
        id: crypto.randomUUID(),
        built: false,
      })),
      summary: fullSummary,
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
    logPipelineError(error, { runId, niche: params.niche }, "research");
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
// QA, lessons, and images happen in executePostGeneration.
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
    // Fetch report to get market intelligence for the generator
    const report = await getReportById(reportId);
    const marketIntelligence = report.summary;

    // Generate product with streaming progress (0-90%)
    console.log(`[generate] Generating spreadsheet template for opportunity: ${opportunity.niche}`);
    let lastSavedPct = 0;
    const generated = await generateProduct({
      opportunity,
      attempt: 1,
      marketIntelligence,
      onProgress: (pct) => {
        const scaledPct = Math.round(pct * 0.9);
        if (scaledPct - lastSavedPct >= 5 || pct === 100) {
          lastSavedPct = scaledPct;
          updatePipelineRun(pipelineRun.id, {
            metadata: { ...pipelineRun.metadata, progress: scaledPct },
          }).catch((err) => console.error("[pipeline] Progress update failed:", err));
        }
      },
    });
    console.log(`[generate] Generated template: "${generated.title}" (${generated.content.sheets.length} sheets)`);

    // Save product to DB (90-100%)
    const product = await insertProduct({
      opportunity_id: opportunityId,
      report_id: reportId,
      product_type: generated.product_type,
      title: generated.title,
      description: generated.description,
      content: {
        ...generated.content,
        preview_prompts: generated.preview_prompts,
      } as unknown as Record<string, unknown>,
      content_file_url: null,
      thumbnail_url: null,
      image_urls: [],
      tags: generated.tags,
      price_cents: generated.price_cents,
      currency: generated.currency,
      thumbnail_prompt: generated.thumbnail_prompt,
      qa_score: null,
      qa_attempts: 0,
      etsy_listing_id: null,
      etsy_url: null,
      taxonomy_id: generated.taxonomy_id,
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
    logPipelineError(error, { opportunityId, reportId }, "generate");
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

// Phase 2: QA evaluation, lesson extraction, spreadsheet build, and image generation.
export async function executePostGeneration(
  productId: string,
): Promise<void> {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  const pipelineRun = await insertPipelineRun({
    phase: "qa",
    status: "running",
    metadata: { productId },
    started_at: new Date().toISOString(),
    completed_at: null,
  });

  try {
    // Reconstruct the generated product shape for the evaluator
    const spec = product.content as unknown as SpreadsheetSpec;
    const generatedProduct = {
      product_type: product.product_type,
      title: product.title,
      description: product.description,
      content: spec,
      tags: product.tags,
      price_cents: product.price_cents,
      currency: product.currency,
      thumbnail_prompt: product.thumbnail_prompt,
      preview_prompts: (product.content as Record<string, unknown>).preview_prompts as string[] ?? [],
      taxonomy_id: product.taxonomy_id ?? 2078,
    };

    // QA evaluation (0-40%)
    console.log(`[qa] Running QA evaluation for "${product.title}"...`);
    await updatePipelineRun(pipelineRun.id, {
      metadata: { ...pipelineRun.metadata, progress: 10 },
    }).catch((err) => console.error("[pipeline] Progress update failed:", err));

    const qaResult = await evaluateProduct(generatedProduct);
    qaResult.attempt = 1;

    console.log(`[qa] QA result: ${qaResult.passed ? "PASSED" : "FAILED"} (scores: ${JSON.stringify(qaResult.scores)})`);

    await updatePipelineRun(pipelineRun.id, {
      metadata: { ...pipelineRun.metadata, progress: 40 },
    }).catch((err) => console.error("[pipeline] Progress update failed:", err));

    // Extract lessons from QA result (40-55%)
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
      metadata: { ...pipelineRun.metadata, progress: 55 },
    }).catch((err) => console.error("[pipeline] Progress update failed:", err));

    // Build .xlsx spreadsheet (55-70%)
    try {
      console.log(`[qa] Building .xlsx spreadsheet...`);
      const xlsxBuffer = await buildSpreadsheet(spec);
      console.log(`[qa] Built spreadsheet: ${xlsxBuffer.length} bytes`);

      const xlsxUrl = await uploadFile(
        `products/${productId}/template.xlsx`,
        xlsxBuffer,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      await updateProduct(productId, { content_file_url: xlsxUrl });
      console.log(`[qa] Spreadsheet uploaded: ${xlsxUrl}`);
    } catch (xlsxError) {
      const errMsg = xlsxError instanceof Error ? xlsxError.message : String(xlsxError);
      console.error(`[qa] Spreadsheet build failed: ${errMsg}`);
      throw new Error(`Spreadsheet build failed: ${errMsg}`);
    }

    await updatePipelineRun(pipelineRun.id, {
      metadata: { ...pipelineRun.metadata, progress: 70 },
    }).catch((err) => console.error("[pipeline] Progress update failed:", err));

    // Generate listing images (70-95%)
    const env = getEnv();
    if (env.OPENAI_API_KEY && product.thumbnail_prompt) {
      try {
        const allPrompts = [
          product.thumbnail_prompt,
          ...(generatedProduct.preview_prompts || []),
        ].slice(0, 5);

        console.log(`[qa] Generating ${allPrompts.length} listing images with gpt-image-1...`);
        const imageBuffers = await generateProductImages(allPrompts);

        const imageUrls: string[] = [];
        for (let i = 0; i < imageBuffers.length; i++) {
          const url = await uploadFile(
            `products/${productId}/image-${i + 1}.png`,
            imageBuffers[i],
            "image/png",
          );
          imageUrls.push(url);
          console.log(`[qa] Image ${i + 1} uploaded: ${url}`);
        }

        await updateProduct(productId, {
          thumbnail_url: imageUrls[0] ?? null,
          image_urls: imageUrls,
        });
        console.log(`[qa] ${imageUrls.length} images saved`);
      } catch (imgError) {
        const errMsg = imgError instanceof Error ? imgError.message : String(imgError);
        console.error(`[qa] Image generation failed: ${errMsg}`);
        throw new Error(`Image generation failed: ${errMsg}`);
      }
    } else {
      console.log(`[qa] Skipping images — OPENAI_API_KEY: ${env.OPENAI_API_KEY ? "set" : "NOT SET"}, thumbnail_prompt: ${product.thumbnail_prompt ? "yes" : "NO"}`);
    }

    await updatePipelineRun(pipelineRun.id, {
      metadata: { ...pipelineRun.metadata, progress: 95 },
    }).catch((err) => console.error("[pipeline] Progress update failed:", err));

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
    logPipelineError(error, { productId }, "qa");

    // Mark product as failed if QA crashes
    await updateProduct(productId, { status: "qa_fail" }).catch((err) => console.error("[pipeline] Progress update failed:", err));

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
