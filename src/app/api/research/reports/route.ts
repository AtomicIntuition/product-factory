import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getReports } from "@/lib/supabase/queries";

const QuerySchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const raw = {
      status: searchParams.get("status") ?? undefined,
    };

    const parsed = QuerySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const reports = await getReports(parsed.data.status);
    return NextResponse.json(reports);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
