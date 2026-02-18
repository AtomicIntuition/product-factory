import { getEnv } from "@/config/env";
import crypto from "crypto";

const ETSY_AUTH_URL = "https://www.etsy.com/oauth/connect";
const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function generateAuthUrl(params: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}): string {
  const env = getEnv();
  const url = new URL(ETSY_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.ETSY_API_KEY);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", "listings_w listings_r shops_r transactions_r");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCodeForToken(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}> {
  const env = getEnv();

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", env.ETSY_API_KEY);
  body.set("redirect_uri", params.redirectUri);
  body.set("code", params.code);
  body.set("code_verifier", params.codeVerifier);

  const res = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}> {
  const env = getEnv();

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", env.ETSY_API_KEY);
  body.set("refresh_token", refreshToken);

  const res = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy token refresh failed (${res.status}): ${text}`);
  }

  return res.json();
}
