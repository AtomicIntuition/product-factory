import { getEnv } from "@/config/env";
import { getEtsyTokens, upsertEtsyTokens } from "@/lib/supabase/queries";
import { refreshAccessToken } from "@/lib/etsy/oauth";

const ETSY_API_BASE = "https://openapi.etsy.com/v3";
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getValidAccessToken(): Promise<string> {
  // First check DB for stored tokens
  const stored = await getEtsyTokens();
  if (stored) {
    const expiresAt = new Date(stored.expires_at);
    const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresAt > fiveMinFromNow) {
      return stored.access_token;
    }

    // Token is expiring soon, refresh it
    const refreshed = await refreshAccessToken(stored.refresh_token);
    await upsertEtsyTokens({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      scopes: stored.scopes,
    });
    return refreshed.access_token;
  }

  // Fall back to env vars
  const env = getEnv();
  if (env.ETSY_ACCESS_TOKEN) {
    return env.ETSY_ACCESS_TOKEN;
  }

  throw new Error("No Etsy access token available. Connect your Etsy shop in Settings.");
}

async function publicRequest<T = unknown>(
  method: string,
  path: string,
  query?: Record<string, string | number>,
): Promise<T> {
  const env = getEnv();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const url = new URL(`${ETSY_API_BASE}${path}`);
    if (query) {
      for (const [key, val] of Object.entries(query)) {
        url.searchParams.set(key, String(val));
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        "x-api-key": env.ETSY_API_KEY,
      },
    });

    if (res.status === 429 || res.status >= 500) {
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      console.log(`Etsy API ${res.status}, retrying in ${Math.round(jitter)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(jitter);
      lastError = new Error(`Etsy API returned ${res.status}`);
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Etsy API error (${res.status}): ${text.slice(0, 500)}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Etsy API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
  }

  throw lastError || new Error("Etsy API request failed after retries");
}

async function oauthRequest<T = unknown>(
  method: string,
  path: string,
  body?: Record<string, unknown> | FormData,
  query?: Record<string, string | number>,
): Promise<T> {
  const env = getEnv();
  const accessToken = await getValidAccessToken();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const isFormData = body instanceof FormData;
    const headers: Record<string, string> = {
      "x-api-key": env.ETSY_API_KEY,
      Authorization: `Bearer ${accessToken}`,
    };
    if (!isFormData && body) {
      headers["Content-Type"] = "application/json";
    }

    const url = new URL(`${ETSY_API_BASE}${path}`);
    if (query) {
      for (const [key, val] of Object.entries(query)) {
        url.searchParams.set(key, String(val));
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429 || res.status >= 500) {
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      console.log(`Etsy API ${res.status}, retrying in ${Math.round(jitter)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(jitter);
      lastError = new Error(`Etsy API returned ${res.status}`);
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Etsy API error (${res.status}): ${text.slice(0, 500)}`);
    }

    if (!text.trim()) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Etsy API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
  }

  throw lastError || new Error("Etsy API request failed after retries");
}

// --- Types for Etsy API responses ---

interface EtsySearchResult {
  count: number;
  results: {
    listing_id: number;
    title: string;
    description: string;
    price: { amount: number; divisor: number; currency_code: string };
    num_favorers: number;
    views: number;
    tags: string[];
    taxonomy_id: number;
    url: string;
    shop_id: number;
    is_digital: boolean;
    review_count?: number;
    rating?: number;
  }[];
}

interface EtsyTaxonomyNode {
  id: number;
  name: string;
  parent_id: number | null;
  children: EtsyTaxonomyNode[];
}

interface EtsyListingResponse {
  listing_id: number;
  url: string;
  state: string;
}

interface EtsyShopReceipt {
  receipt_id: number;
  buyer_email: string;
  grandtotal: { amount: number; divisor: number; currency_code: string };
  create_timestamp: number;
  transactions: { listing_id: number; price: { amount: number; divisor: number } }[];
}

// --- Public API methods (no OAuth needed) ---

export const etsy = {
  async searchListings(params: {
    keywords: string;
    limit?: number;
    offset?: number;
    sort_on?: "created" | "price" | "updated" | "score";
  }): Promise<EtsySearchResult> {
    return publicRequest<EtsySearchResult>("GET", "/application/listings/active", {
      keywords: params.keywords,
      limit: params.limit ?? 25,
      offset: params.offset ?? 0,
      sort_on: params.sort_on ?? "score",
    });
  },

  async getSellerTaxonomyNodes(): Promise<{ results: EtsyTaxonomyNode[] }> {
    return publicRequest<{ results: EtsyTaxonomyNode[] }>("GET", "/application/seller-taxonomy/nodes");
  },

  // --- OAuth API methods ---

  async createDraftListing(
    shopId: string,
    params: {
      title: string;
      description: string;
      price: number;
      quantity: number;
      taxonomy_id: number;
      tags: string[];
      who_made: string;
      when_made: string;
      is_digital: boolean;
      type: string;
      is_supply: boolean;
    },
  ): Promise<EtsyListingResponse> {
    return oauthRequest<EtsyListingResponse>(
      "POST",
      `/application/shops/${shopId}/listings`,
      params,
    );
  },

  async uploadListingImage(
    shopId: string,
    listingId: number,
    imageBuffer: Buffer,
    rank?: number,
  ): Promise<{ listing_image_id: number }> {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "image.png");
    if (rank !== undefined) {
      form.append("rank", String(rank));
    }
    return oauthRequest<{ listing_image_id: number }>(
      "POST",
      `/application/shops/${shopId}/listings/${listingId}/images`,
      form,
    );
  },

  async uploadListingFile(
    shopId: string,
    listingId: number,
    fileBuffer: Buffer,
    filename: string,
  ): Promise<{ listing_file_id: number }> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(fileBuffer)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      filename,
    );
    return oauthRequest<{ listing_file_id: number }>(
      "POST",
      `/application/shops/${shopId}/listings/${listingId}/files`,
      form,
    );
  },

  async updateListing(
    shopId: string,
    listingId: number,
    params: Record<string, unknown>,
  ): Promise<EtsyListingResponse> {
    return oauthRequest<EtsyListingResponse>(
      "PATCH",
      `/application/shops/${shopId}/listings/${listingId}`,
      params,
    );
  },

  async getShopReceipts(
    shopId: string,
    params?: { min_created?: number; max_created?: number; limit?: number; offset?: number },
  ): Promise<{ count: number; results: EtsyShopReceipt[] }> {
    const query: Record<string, string | number> = {};
    if (params?.min_created) query.min_created = params.min_created;
    if (params?.max_created) query.max_created = params.max_created;
    if (params?.limit) query.limit = params.limit;
    if (params?.offset) query.offset = params.offset;

    return oauthRequest<{ count: number; results: EtsyShopReceipt[] }>(
      "GET",
      `/application/shops/${shopId}/receipts`,
      undefined,
      query,
    );
  },
};
