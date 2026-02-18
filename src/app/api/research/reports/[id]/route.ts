import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getReportById, deleteReport } from "@/lib/supabase/queries";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid id parameter", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const report = await getReportById(parsed.data.id);
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("No rows found") || message.includes("PGRST116")) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid id parameter", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    await deleteReport(parsed.data.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
