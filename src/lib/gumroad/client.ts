import { getEnv } from "@/config/env";

const GUMROAD_API_BASE = "https://api.gumroad.com/v2";
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

interface GumroadResponse<T = unknown> {
  success: boolean;
  message?: string;
  [key: string]: unknown;
  data?: T;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: Record<string, unknown> | FormData,
): Promise<GumroadResponse<T>> {
  const env = getEnv();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const isFormData = body instanceof FormData;
    if (isFormData) {
      body.set("access_token", env.GUMROAD_API_TOKEN);
    }

    const headers: Record<string, string> = {};
    if (!isFormData) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${GUMROAD_API_BASE}${path}`, {
      method,
      headers,
      body: isFormData
        ? body
        : body
          ? JSON.stringify({ ...body, access_token: env.GUMROAD_API_TOKEN })
          : undefined,
    });

    if (res.status === 429 || res.status >= 500) {
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      console.log(`Gumroad API ${res.status}, retrying in ${Math.round(jitter)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(jitter);
      lastError = new Error(`Gumroad API returned ${res.status}`);
      continue;
    }

    const json = await res.json() as GumroadResponse<T>;
    if (!json.success) {
      throw new Error(`Gumroad API error: ${json.message || JSON.stringify(json)}`);
    }
    return json;
  }

  throw lastError || new Error("Gumroad API request failed after retries");
}

export const gumroad = {
  async createProduct(params: {
    name: string;
    description: string;
    price: number;
    tags: string[];
  }): Promise<GumroadResponse> {
    const form = new FormData();
    form.set("name", params.name);
    form.set("description", params.description);
    form.set("price", params.price.toString());
    for (const tag of params.tags) {
      form.append("tags[]", tag);
    }
    return request("POST", "/products", form);
  },

  async updateProduct(
    productId: string,
    params: Record<string, unknown>,
  ): Promise<GumroadResponse> {
    return request("PUT", `/products/${productId}`, params);
  },

  async deleteProduct(productId: string): Promise<GumroadResponse> {
    return request("DELETE", `/products/${productId}`);
  },

  async getProduct(productId: string): Promise<GumroadResponse> {
    return request("GET", `/products/${productId}`);
  },

  async listProducts(): Promise<GumroadResponse> {
    return request("GET", "/products");
  },

  async enableProduct(productId: string): Promise<GumroadResponse> {
    return request("PUT", `/products/${productId}`, { published: true });
  },

  async getSales(params?: { after?: string; before?: string; page?: number }): Promise<GumroadResponse> {
    const query = new URLSearchParams();
    query.set("access_token", getEnv().GUMROAD_API_TOKEN);
    if (params?.after) query.set("after", params.after);
    if (params?.before) query.set("before", params.before);
    if (params?.page) query.set("page", params.page.toString());
    const env = getEnv();
    const res = await fetch(`${GUMROAD_API_BASE}/sales?${query.toString()}`, {
      headers: { Authorization: `Bearer ${env.GUMROAD_API_TOKEN}` },
    });
    return res.json();
  },
};
