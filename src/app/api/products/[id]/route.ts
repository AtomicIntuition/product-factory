import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getProductById,
  updateProduct,
  deleteProduct,
} from "@/lib/supabase/queries";

const UpdateProductSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    price_cents: z.number().int().positive().optional(),
    etsy_listing_id: z.number().optional(),
    etsy_url: z.string().optional(),
    taxonomy_id: z.number().optional(),
    status: z
      .enum([
        "researched",
        "analyzed",
        "generating",
        "qa_pending",
        "qa_pass",
        "qa_fail",
        "ready_for_review",
        "approved",
        "publishing",
        "published",
        "publish_failed",
      ])
      .optional(),
  })
  .strict();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const product = await getProductById(id);
    return NextResponse.json(product);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("No rows found") || message.includes("PGRST116")) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateProductSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updated = await updateProduct(id, parsed.data);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("No rows found") || message.includes("PGRST116")) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteProduct(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("No rows found") || message.includes("PGRST116")) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
