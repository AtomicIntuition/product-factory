import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/config/env", () => ({
  getEnv: () => ({
    ETSY_API_KEY: "test-key",
    ETSY_SHARED_SECRET: "test-secret",
    ETSY_SHOP_ID: "shop-123",
    ETSY_ACCESS_TOKEN: "test-access-token",
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
  }),
}));

const mockGetProductByListingId = vi.fn();
const mockSaleExists = vi.fn();
const mockGetLatestSaleTimestamp = vi.fn();
const mockInsertSale = vi.fn();

vi.mock("@/lib/supabase/queries", () => ({
  getProductByListingId: (...args: unknown[]) => mockGetProductByListingId(...args),
  saleExists: (...args: unknown[]) => mockSaleExists(...args),
  getLatestSaleTimestamp: () => mockGetLatestSaleTimestamp(),
  insertSale: (...args: unknown[]) => mockInsertSale(...args),
  getEtsyTokens: vi.fn().mockResolvedValue(null),
  upsertEtsyTokens: vi.fn(),
}));

vi.mock("@/lib/etsy/oauth", () => ({
  refreshAccessToken: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { syncSales } from "@/lib/etsy/sync";

function makeReceipt(id: number, listingId: number, amountCents = 1499) {
  return {
    receipt_id: id,
    buyer_email: `buyer${id}@example.com`,
    grandtotal: { amount: amountCents, divisor: 100, currency_code: "USD" },
    create_timestamp: Math.floor(Date.now() / 1000) - 3600,
    transactions: [
      { listing_id: listingId, price: { amount: amountCents, divisor: 100 } },
    ],
  };
}

function mockEtsyResponse(receipts: ReturnType<typeof makeReceipt>[]) {
  mockFetch.mockResolvedValueOnce({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({ count: receipts.length, results: receipts }),
  });
}

describe("syncSales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLatestSaleTimestamp.mockResolvedValue(null);
    mockSaleExists.mockResolvedValue(false);
    mockInsertSale.mockResolvedValue({ id: "sale-1" });
  });

  it("inserts new sales for matching products", async () => {
    const receipts = [makeReceipt(100, 555)];
    mockEtsyResponse(receipts);

    mockGetProductByListingId.mockResolvedValue({ id: "product-1" });

    const result = await syncSales();

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(mockInsertSale).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: "product-1",
        etsy_receipt_id: "100",
        currency: "USD",
      }),
    );
  });

  it("skips duplicate receipts (idempotency)", async () => {
    const receipts = [makeReceipt(100, 555)];
    mockEtsyResponse(receipts);

    mockSaleExists.mockResolvedValue(true);

    const result = await syncSales();

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockInsertSale).not.toHaveBeenCalled();
  });

  it("skips receipts with unknown listings", async () => {
    const receipts = [makeReceipt(100, 999)];
    mockEtsyResponse(receipts);

    mockGetProductByListingId.mockResolvedValue(null);

    const result = await syncSales();

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(mockInsertSale).not.toHaveBeenCalled();
  });

  it("handles pagination", async () => {
    // First page: 25 receipts (full page, triggers next fetch)
    const page1 = Array.from({ length: 25 }, (_, i) => makeReceipt(i + 1, 555));
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ count: 30, results: page1 }),
    });

    // Second page: 5 receipts (less than limit, stops pagination)
    const page2 = Array.from({ length: 5 }, (_, i) => makeReceipt(i + 26, 555));
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ count: 30, results: page2 }),
    });

    mockGetProductByListingId.mockResolvedValue({ id: "product-1" });

    const result = await syncSales();

    expect(result.inserted).toBe(30);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("increments from latest sale timestamp", async () => {
    const timestamp = "2025-06-01T12:00:00.000Z";
    mockGetLatestSaleTimestamp.mockResolvedValue(timestamp);
    mockEtsyResponse([]);

    await syncSales();

    const [url] = mockFetch.mock.calls[0];
    const parsedUrl = new URL(url);
    const minCreated = Number(parsedUrl.searchParams.get("min_created"));
    // Should be timestamp minus 60 seconds
    const expected = Math.floor(new Date(timestamp).getTime() / 1000) - 60;
    expect(minCreated).toBe(expected);
  });

  it("counts errors but continues processing", async () => {
    const receipts = [makeReceipt(100, 555), makeReceipt(101, 666)];
    mockEtsyResponse(receipts);

    mockSaleExists.mockResolvedValue(false);
    mockGetProductByListingId
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ id: "product-2" });

    const result = await syncSales();

    expect(result.errors).toBe(1);
    expect(result.inserted).toBe(1);
  });
});
