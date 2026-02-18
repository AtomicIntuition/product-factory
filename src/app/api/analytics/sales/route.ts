import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSales } from "@/lib/supabase/queries";

const QuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  product_id: z.string().uuid().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const raw = {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      product_id: searchParams.get("product_id") ?? undefined,
    };

    const parsed = QuerySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const filters: { from?: string; to?: string; product_id?: string } = {};
    if (parsed.data.from) filters.from = parsed.data.from;
    if (parsed.data.to) filters.to = parsed.data.to;
    if (parsed.data.product_id) filters.product_id = parsed.data.product_id;

    const sales = await getSales(Object.keys(filters).length > 0 ? filters : undefined);
    return NextResponse.json(sales);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
