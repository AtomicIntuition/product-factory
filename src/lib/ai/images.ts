import OpenAI from "openai";
import sharp from "sharp";
import { getEnv } from "@/config/env";

export async function generateProductImages(prompts: string[]): Promise<Buffer[]> {
  const env = getEnv();

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured — cannot generate images");
  }

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: 120_000,
  });

  console.log(`[images] Generating ${prompts.length} images with gpt-image-1...`);

  // Generate all images in parallel
  const imagePromises = prompts.map(async (prompt, i) => {
    console.log(`[images] Image ${i + 1}/${prompts.length}: ${prompt.slice(0, 60)}...`);

    const response = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "medium",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error(`gpt-image-1 did not return image data for image ${i + 1}`);
    }

    const rawBuffer = Buffer.from(b64, "base64");
    console.log(`[images] Image ${i + 1}: got ${rawBuffer.length} bytes, upscaling to 2000x2000...`);

    // Upscale from 1024x1024 to 2000x2000 for Etsy's recommended dimensions
    const upscaledBuffer = await sharp(rawBuffer)
      .resize(2000, 2000, {
        kernel: sharp.kernel.lanczos3,
        fit: "fill",
      })
      .png()
      .toBuffer();

    console.log(`[images] Image ${i + 1}: upscaled to ${upscaledBuffer.length} bytes`);
    return upscaledBuffer;
  });

  return Promise.all(imagePromises);
}
