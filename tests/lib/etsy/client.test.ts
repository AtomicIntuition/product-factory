import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/config/env", () => ({
  getEnv: () => ({
    ETSY_API_KEY: "test-etsy-key",
    ETSY_ACCESS_TOKEN: "test-access-token",
  }),
}));

vi.mock("@/lib/supabase/queries", () => ({
  getEtsyTokens: vi.fn().mockResolvedValue(null),
  upsertEtsyTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/etsy/oauth", () => ({
  refreshAccessToken: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { etsy } from "@/lib/etsy/client";

describe("Etsy Client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("retries on 429 (rate limit)", async () => {
    // First 2 calls return 429, third succeeds
    mockFetch
      .mockResolvedValueOnce({ status: 429, ok: false })
      .mockResolvedValueOnce({ status: 429, ok: false })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ count: 0, results: [] }),
      });

    const result = await etsy.searchListings({ keywords: "budget" });
    expect(result.count).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 30000);

  it("retries on 500 server error", async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 500, ok: false })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ count: 1, results: [{ listing_id: 1 }] }),
      });

    const result = await etsy.searchListings({ keywords: "planner" });
    expect(result.count).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 30000);

  it("throws immediately on 403 without retrying", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 403,
      ok: false,
      text: async () => "Forbidden",
    });

    await expect(etsy.searchListings({ keywords: "test" })).rejects.toThrow(
      "Etsy API error (403)",
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries exceeded", async () => {
    // All 5 calls return 429
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce({ status: 429, ok: false });
    }

    await expect(etsy.searchListings({ keywords: "test" })).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(5);
  }, 60000);

  it("searchListings sends correct query params", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ count: 0, results: [] }),
    });

    await etsy.searchListings({ keywords: "budget tracker", limit: 10, offset: 5 });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("keywords=budget+tracker");
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=5");
  });

  it("createDraftListing sends correct JSON body", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ listing_id: 12345, url: "https://etsy.com/listing/12345", state: "draft" }),
    });

    const result = await etsy.createDraftListing("shop-123", {
      title: "Test Product",
      description: "Description",
      price: 14.99,
      quantity: 999,
      taxonomy_id: 2078,
      tags: ["tag1"],
      who_made: "i_did",
      when_made: "made_to_order",
      is_digital: true,
      type: "download",
      is_supply: false,
    });

    expect(result.listing_id).toBe(12345);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/shops/shop-123/listings");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.title).toBe("Test Product");
    expect(body.price).toBe(14.99);
    expect(body.is_digital).toBe(true);
  });

  it("uploadListingImage sends FormData with Blob and rank", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ listing_image_id: 999 }),
    });

    const imageBuffer = Buffer.from("fake-image-data");
    await etsy.uploadListingImage("shop-123", 12345, imageBuffer, 1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/listings/12345/images");
    expect(opts.body).toBeInstanceOf(FormData);
  });

  it("token auto-refresh when stored token expires soon", async () => {
    const { getEtsyTokens } = await import("@/lib/supabase/queries");
    const { refreshAccessToken } = await import("@/lib/etsy/oauth");

    // Token that expires in 1 minute (within 5-min refresh window)
    (getEtsyTokens as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      access_token: "old-token",
      refresh_token: "refresh-token",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      scopes: "listings_w",
    });
    (refreshAccessToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      access_token: "new-token",
      refresh_token: "new-refresh",
      expires_in: 3600,
      token_type: "Bearer",
    });

    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ listing_id: 1, url: "", state: "draft" }),
    });

    await etsy.createDraftListing("shop-123", {
      title: "Test", description: "d", price: 10, quantity: 1,
      taxonomy_id: 2078, tags: [], who_made: "i_did",
      when_made: "made_to_order", is_digital: true, type: "download", is_supply: false,
    });

    expect(refreshAccessToken).toHaveBeenCalledWith("refresh-token");
  });
});
