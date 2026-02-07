import OpenAI from "openai";
import { getEnv } from "@/config/env";

export async function generateThumbnail(prompt: string): Promise<Buffer> {
  const env = getEnv();

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured — cannot generate thumbnail");
  }

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: 120_000, // 2 minute timeout for image generation
  });

  console.log(`[thumbnail] Calling gpt-image-1 with prompt: ${prompt.slice(0, 80)}...`);

  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "medium",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("gpt-image-1 did not return image data (b64_json is empty)");
  }

  console.log(`[thumbnail] Got image data, ${b64.length} chars base64`);
  return Buffer.from(b64, "base64");
}
