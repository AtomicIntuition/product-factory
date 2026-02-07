import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { insertResearchRaw } from "@/lib/supabase/queries";

const SeedUrlsSchema = z.object({
  urls: z
    .array(z.string().url("Each entry must be a valid URL"))
    .min(1, "At least one URL is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SeedUrlsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const run_id = randomUUID();

    const rows = parsed.data.urls.map((url) => ({
      run_id,
      source: "manual_seed" as const,
      category: "seed",
      product_data: {
        title: "",
        description: "",
        price_cents: 0,
        currency: "usd",
        rating: null,
        review_count: 0,
        seller_name: "",
        seller_id: "",
        url,
        tags: [],
        category: "seed",
      },
    }));

    await insertResearchRaw(rows);

    return NextResponse.json({ run_id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
