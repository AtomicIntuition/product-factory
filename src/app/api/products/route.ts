import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProducts } from "@/lib/supabase/queries";
import type { ProductStatus } from "@/types";

const ProductStatusEnum = z.enum([
  "researched", "analyzed", "generating", "qa_pending", "qa_pass",
  "qa_fail", "ready_for_review", "approved", "publishing", "published", "publish_failed",
]);

const QuerySchema = z.object({
  status: ProductStatusEnum.optional(),
  product_type: z.string().min(1).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const raw = {
      status: searchParams.get("status") ?? undefined,
      product_type: searchParams.get("product_type") ?? undefined,
    };

    const parsed = QuerySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const filters: { status?: ProductStatus; product_type?: string } = {};
    if (parsed.data.status) filters.status = parsed.data.status;
    if (parsed.data.product_type) filters.product_type = parsed.data.product_type;

    const products = await getProducts(Object.keys(filters).length > 0 ? filters : undefined);
    return NextResponse.json(products);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
