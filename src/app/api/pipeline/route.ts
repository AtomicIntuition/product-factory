import { NextRequest, NextResponse } from "next/server";
import { getLatestPipelineRuns, deletePipelineRun } from "@/lib/supabase/queries";

export async function GET(): Promise<NextResponse> {
  try {
    const runs = await getLatestPipelineRuns();
    return NextResponse.json(runs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }
    await deletePipelineRun(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const backendUrl = process.env.BACKEND_URL;
  const backendSecret = process.env.BACKEND_SECRET;

  if (!backendUrl || !backendSecret) {
    return NextResponse.json(
      { error: "Backend not configured (BACKEND_URL or BACKEND_SECRET missing)" },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(`${backendUrl}/api/pipeline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-backend-secret": backendSecret,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[pipeline proxy] Failed to reach backend:", message);
    return NextResponse.json({ error: `Backend unreachable: ${message}` }, { status: 502 });
  }
}
