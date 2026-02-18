import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/config/env", () => ({
  getEnv: () => ({
    ETSY_API_KEY: "test-etsy-key",
    ETSY_SHARED_SECRET: "test-secret",
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
} from "@/lib/etsy/oauth";

describe("Etsy OAuth", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("generateCodeVerifier returns a 43+ char base64url string", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    // base64url: alphanumeric + - and _
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generateCodeVerifier produces unique values", () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });

  it("generateCodeChallenge returns a SHA256 base64url hash", () => {
    const verifier = "test-verifier-string";
    const challenge = generateCodeChallenge(verifier);
    expect(challenge.length).toBeGreaterThan(0);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);

    // Same input should produce same output
    expect(generateCodeChallenge(verifier)).toBe(challenge);
  });

  it("generateAuthUrl includes all required query params", () => {
    const url = generateAuthUrl({
      state: "test-state",
      codeChallenge: "test-challenge",
      redirectUri: "https://example.com/callback",
    });

    expect(url).toContain("response_type=code");
    expect(url).toContain("client_id=test-etsy-key");
    expect(url).toContain("state=test-state");
    expect(url).toContain("code_challenge=test-challenge");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("redirect_uri=");
  });

  it("exchangeCodeForToken sends correct POST body on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "at-123",
        refresh_token: "rt-456",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    });

    const result = await exchangeCodeForToken({
      code: "auth-code",
      codeVerifier: "verifier",
      redirectUri: "https://example.com/callback",
    });

    expect(result.access_token).toBe("at-123");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("oauth/token");
    expect(opts.method).toBe("POST");
    expect(opts.body).toContain("grant_type=authorization_code");
    expect(opts.body).toContain("code=auth-code");
  });

  it("exchangeCodeForToken throws on error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Invalid code",
    });

    await expect(
      exchangeCodeForToken({
        code: "bad-code",
        codeVerifier: "verifier",
        redirectUri: "https://example.com/callback",
      }),
    ).rejects.toThrow("Etsy token exchange failed");
  });

  it("refreshAccessToken sends correct body and throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Token expired",
    });

    await expect(refreshAccessToken("old-refresh-token")).rejects.toThrow(
      "Etsy token refresh failed",
    );

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.body).toContain("grant_type=refresh_token");
    expect(opts.body).toContain("refresh_token=old-refresh-token");
  });
});
