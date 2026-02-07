import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/config/env";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  _client = new Anthropic({
    apiKey: getEnv().ANTHROPIC_API_KEY,
    timeout: 10 * 60 * 1000, // 10 minute timeout per request
  });
  return _client;
}

export type ModelTier = "opus" | "sonnet";

const MODEL_MAP: Record<ModelTier, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5-20250929",
};

export async function promptClaude<T>(params: {
  model: ModelTier;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: MODEL_MAP[params.model],
    max_tokens: params.maxTokens || 4096,
    system: params.system,
    messages: [{ role: "user", content: params.prompt }],
  });

  // Detect truncated responses (maxTokens hit)
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `Claude response was truncated (hit max_tokens limit of ${params.maxTokens || 4096}). Increase maxTokens or reduce expected output size.`,
    );
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Extract JSON from the response (handle markdown code blocks)
  let jsonStr = textBlock.text.trim();

  // Try multiple fence patterns
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // If still not valid JSON, try to find the outermost { ... } or [ ... ]
  if (!jsonStr.startsWith("{") && !jsonStr.startsWith("[")) {
    const braceStart = jsonStr.indexOf("{");
    const bracketStart = jsonStr.indexOf("[");
    const start = braceStart === -1 ? bracketStart : bracketStart === -1 ? braceStart : Math.min(braceStart, bracketStart);
    if (start !== -1) {
      const isArray = jsonStr[start] === "[";
      const closeChar = isArray ? "]" : "}";
      const lastClose = jsonStr.lastIndexOf(closeChar);
      if (lastClose > start) {
        jsonStr = jsonStr.slice(start, lastClose + 1);
      }
    }
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${textBlock.text.slice(0, 500)}`);
  }
}
