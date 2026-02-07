import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/supabase/queries";
import type { ProductStatus } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as ProductStatus | null;
    const product_type = searchParams.get("product_type");

    const filters: { status?: ProductStatus; product_type?: string } = {};
    if (status) filters.status = status;
    if (product_type) filters.product_type = product_type;

    const products = await getProducts(Object.keys(filters).length > 0 ? filters : undefined);
    return NextResponse.json(products);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
