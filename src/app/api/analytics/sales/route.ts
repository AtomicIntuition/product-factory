import { NextRequest, NextResponse } from "next/server";
import { getSales } from "@/lib/supabase/queries";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const product_id = searchParams.get("product_id");

    const filters: { from?: string; to?: string; product_id?: string } = {};
    if (from) filters.from = from;
    if (to) filters.to = to;
    if (product_id) filters.product_id = product_id;

    const sales = await getSales(Object.keys(filters).length > 0 ? filters : undefined);
    return NextResponse.json(sales);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
