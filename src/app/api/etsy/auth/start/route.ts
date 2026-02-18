import { NextRequest, NextResponse } from "next/server";
import { generateCodeVerifier, generateCodeChallenge, generateAuthUrl } from "@/lib/etsy/oauth";
import crypto from "crypto";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/etsy/auth/callback`;

    const authUrl = generateAuthUrl({ state, codeChallenge, redirectUri });

    const response = NextResponse.redirect(authUrl);

    // Store state and verifier in cookies for validation in callback
    response.cookies.set("etsy_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });
    response.cookies.set("etsy_code_verifier", codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
