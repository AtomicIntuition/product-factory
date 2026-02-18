import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateDraftListing = vi.fn();
const mockUploadListingImage = vi.fn();
const mockUploadListingFile = vi.fn();
const mockUpdateListing = vi.fn();

vi.mock("@/lib/etsy/client", () => ({
  etsy: {
    createDraftListing: (...args: unknown[]) => mockCreateDraftListing(...args),
    uploadListingImage: (...args: unknown[]) => mockUploadListingImage(...args),
    uploadListingFile: (...args: unknown[]) => mockUploadListingFile(...args),
    updateListing: (...args: unknown[]) => mockUpdateListing(...args),
  },
}));

const mockGetProductById = vi.fn();
const mockUpdateProduct = vi.fn();

vi.mock("@/lib/supabase/queries", () => ({
  getProductById: (...args: unknown[]) => mockGetProductById(...args),
  updateProduct: (...args: unknown[]) => mockUpdateProduct(...args),
}));

vi.mock("@/config/env", () => ({
  getEnv: () => ({
    ETSY_SHOP_ID: "shop-123",
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { publishToEtsy } from "@/lib/etsy/publisher";
import { makeProduct } from "../../fixtures/product";

describe("publishToEtsy", () => {
  beforeEach(() => {
    mockCreateDraftListing.mockReset();
    mockUploadListingImage.mockReset();
    mockUploadListingFile.mockReset();
    mockUpdateListing.mockReset();
    mockGetProductById.mockReset();
    mockUpdateProduct.mockReset();
    mockFetch.mockReset();
  });

  function setupHappyPath() {
    const product = makeProduct();
    mockGetProductById.mockResolvedValue(product);
    mockCreateDraftListing.mockResolvedValue({ listing_id: 12345, url: "", state: "draft" });
    mockUploadListingImage.mockResolvedValue({ listing_image_id: 1 });
    mockUploadListingFile.mockResolvedValue({ listing_file_id: 1 });
    mockUpdateListing.mockResolvedValue({ listing_id: 12345, url: "https://etsy.com/listing/12345", state: "active" });
    mockUpdateProduct.mockResolvedValue(undefined);

    // Mock fetch for image downloads and file download
    mockFetch.mockImplementation(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    }));

    return product;
  }

  it("happy path: all 4 steps succeed, status = published", async () => {
    setupHappyPath();

    const result = await publishToEtsy("prod-001");
    expect(result.listingId).toBe(12345);
    expect(result.url).toBe("https://etsy.com/listing/12345");

    // Verify status updated to published
    expect(mockUpdateProduct).toHaveBeenCalledWith("prod-001", expect.objectContaining({
      status: "published",
      etsy_listing_id: 12345,
    }));
  });

  it("Step 1 failure → status = publish_failed", async () => {
    const product = makeProduct();
    mockGetProductById.mockResolvedValue(product);
    mockCreateDraftListing.mockRejectedValue(new Error("API error"));
    mockUpdateProduct.mockResolvedValue(undefined);

    await expect(publishToEtsy("prod-001")).rejects.toThrow("Step 1");
    expect(mockUpdateProduct).toHaveBeenCalledWith("prod-001", { status: "publish_failed" });
  });

  it("Step 2: ALL images fail → throws (Bug 4 regression)", async () => {
    const product = makeProduct();
    mockGetProductById.mockResolvedValue(product);
    mockCreateDraftListing.mockResolvedValue({ listing_id: 12345, url: "", state: "draft" });
    mockUpdateProduct.mockResolvedValue(undefined);

    // All image fetches fail
    mockFetch.mockImplementation(async () => ({
      ok: false,
      status: 500,
    }));

    await expect(publishToEtsy("prod-001")).rejects.toThrow("All image uploads failed");
    expect(mockUpdateProduct).toHaveBeenCalledWith("prod-001", { status: "publish_failed" });
  });

  it("Step 2: partial failure → remaining uploaded", async () => {
    const product = makeProduct({ image_urls: ["url1", "url2", "url3"] });
    mockGetProductById.mockResolvedValue(product);
    mockCreateDraftListing.mockResolvedValue({ listing_id: 12345, url: "", state: "draft" });
    mockUploadListingImage.mockResolvedValue({ listing_image_id: 1 });
    mockUploadListingFile.mockResolvedValue({ listing_file_id: 1 });
    mockUpdateListing.mockResolvedValue({ listing_id: 12345, url: "https://etsy.com/listing/12345", state: "active" });
    mockUpdateProduct.mockResolvedValue(undefined);

    // First image fails, rest succeed
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(100) }); // file download

    const result = await publishToEtsy("prod-001");
    expect(result.listingId).toBe(12345);
    // 2 images uploaded (first failed)
    expect(mockUploadListingImage).toHaveBeenCalledTimes(2);
  });

  it("Step 3: no content_file_url → descriptive error", async () => {
    const product = makeProduct({ content_file_url: null, image_urls: [] });
    mockGetProductById.mockResolvedValue(product);
    mockCreateDraftListing.mockResolvedValue({ listing_id: 12345, url: "", state: "draft" });
    mockUpdateProduct.mockResolvedValue(undefined);

    await expect(publishToEtsy("prod-001")).rejects.toThrow("No .xlsx file URL");
  });

  it("Step 3: download fails → error", async () => {
    const product = makeProduct({ image_urls: [] });
    mockGetProductById.mockResolvedValue(product);
    mockCreateDraftListing.mockResolvedValue({ listing_id: 12345, url: "", state: "draft" });
    mockUpdateProduct.mockResolvedValue(undefined);

    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(publishToEtsy("prod-001")).rejects.toThrow("Failed to download .xlsx");
  });

  it("Step 4 failure → status = publish_failed", async () => {
    const product = makeProduct({ image_urls: [] });
    mockGetProductById.mockResolvedValue(product);
    mockCreateDraftListing.mockResolvedValue({ listing_id: 12345, url: "", state: "draft" });
    mockUploadListingFile.mockResolvedValue({ listing_file_id: 1 });
    mockUpdateListing.mockRejectedValue(new Error("Activation failed"));
    mockUpdateProduct.mockResolvedValue(undefined);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    await expect(publishToEtsy("prod-001")).rejects.toThrow("Step 4");
    expect(mockUpdateProduct).toHaveBeenCalledWith("prod-001", { status: "publish_failed" });
  });

  it("throws clear error when product is null (Bug 6 regression)", async () => {
    mockGetProductById.mockResolvedValue(null);

    await expect(publishToEtsy("nonexistent")).rejects.toThrow("Product not found");
  });

  it("appends AI disclosure when missing", async () => {
    const product = makeProduct({ description: "Simple description without disclosure" });
    mockGetProductById.mockResolvedValue(product);
    mockCreateDraftListing.mockResolvedValue({ listing_id: 12345, url: "", state: "draft" });
    mockUploadListingImage.mockResolvedValue({ listing_image_id: 1 });
    mockUploadListingFile.mockResolvedValue({ listing_file_id: 1 });
    mockUpdateListing.mockResolvedValue({ listing_id: 12345, url: "https://etsy.com/listing/12345", state: "active" });
    mockUpdateProduct.mockResolvedValue(undefined);
    mockFetch.mockImplementation(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    }));

    await publishToEtsy("prod-001");

    const draftCall = mockCreateDraftListing.mock.calls[0];
    const description = draftCall[1].description;
    expect(description).toContain("AI assistance");
  });

  it("does not duplicate AI disclosure when already present", async () => {
    const product = makeProduct({
      description: "Product with AI assistance already mentioned",
    });
    mockGetProductById.mockResolvedValue(product);
    mockCreateDraftListing.mockResolvedValue({ listing_id: 12345, url: "", state: "draft" });
    mockUploadListingImage.mockResolvedValue({ listing_image_id: 1 });
    mockUploadListingFile.mockResolvedValue({ listing_file_id: 1 });
    mockUpdateListing.mockResolvedValue({ listing_id: 12345, url: "https://etsy.com/listing/12345", state: "active" });
    mockUpdateProduct.mockResolvedValue(undefined);
    mockFetch.mockImplementation(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    }));

    await publishToEtsy("prod-001");

    const draftCall = mockCreateDraftListing.mock.calls[0];
    const description = draftCall[1].description;
    // Count occurrences of "AI assistance"
    const matches = description.match(/AI assistance/g);
    expect(matches).toHaveLength(1);
  });
});
