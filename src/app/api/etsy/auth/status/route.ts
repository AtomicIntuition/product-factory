import { NextResponse } from "next/server";
import { getEtsyTokens } from "@/lib/supabase/queries";

export async function GET(): Promise<NextResponse> {
  try {
    const token = await getEtsyTokens();
    if (!token) {
      return NextResponse.json({ connected: false, expires_at: null, scopes: null });
    }

    return NextResponse.json({
      connected: true,
      expires_at: token.expires_at,
      scopes: token.scopes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
