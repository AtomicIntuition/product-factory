import OpenAI from "openai";
import { getEnv } from "@/config/env";

export async function generateThumbnail(prompt: string): Promise<Buffer> {
  const env = getEnv();

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured — cannot generate thumbnail");
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const response = await client.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1024x1024",
    response_format: "url",
  });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error("DALL-E did not return an image URL");
  }

  // Download image to Buffer
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to download thumbnail image: ${imageRes.status}`);
  }

  const arrayBuffer = await imageRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
