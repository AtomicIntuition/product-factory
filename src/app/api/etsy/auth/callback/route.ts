import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/etsy/oauth";
import { upsertEtsyTokens } from "@/lib/supabase/queries";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=missing_params", request.url),
      );
    }

    // Validate state matches
    const storedState = request.cookies.get("etsy_oauth_state")?.value;
    const codeVerifier = request.cookies.get("etsy_code_verifier")?.value;

    if (!storedState || storedState !== state) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=invalid_state", request.url),
      );
    }

    if (!codeVerifier) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?error=missing_verifier", request.url),
      );
    }

    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/etsy/auth/callback`;

    // Exchange code for tokens
    const tokenData = await exchangeCodeForToken({
      code,
      codeVerifier,
      redirectUri,
    });

    // Store tokens in database
    await upsertEtsyTokens({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      scopes: "listings_w listings_r shops_r transactions_r",
    });

    // Clear OAuth cookies
    const response = NextResponse.redirect(
      new URL("/dashboard/settings?connected=true", request.url),
    );
    response.cookies.delete("etsy_oauth_state");
    response.cookies.delete("etsy_code_verifier");

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[etsy/auth/callback] Error:", message);
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=${encodeURIComponent(message)}`, request.url),
    );
  }
}
