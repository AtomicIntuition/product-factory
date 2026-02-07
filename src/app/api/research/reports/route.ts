import { NextRequest, NextResponse } from "next/server";
import { getReports } from "@/lib/supabase/queries";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as "active" | "archived" | null;

    const reports = await getReports(status ?? undefined);
    return NextResponse.json(reports);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
