import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/config/env", () => ({
  getEnv: () => ({
    ANTHROPIC_API_KEY: "sk-ant-test-key",
  }),
}));

// Mock the Anthropic SDK with a proper class constructor
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
        stream: vi.fn(),
      };
    },
  };
});

import { promptClaude } from "@/lib/ai/client";

describe("AI Client", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("parses clean JSON response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"key": "value"}' }],
      stop_reason: "end_turn",
    });

    const result = await promptClaude<{ key: string }>({
      model: "haiku",
      system: "test",
      prompt: "test",
    });
    expect(result).toEqual({ key: "value" });
  });

  it("parses JSON wrapped in code fences", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '```json\n{"key": "fenced"}\n```' }],
      stop_reason: "end_turn",
    });

    const result = await promptClaude<{ key: string }>({
      model: "haiku",
      system: "test",
      prompt: "test",
    });
    expect(result).toEqual({ key: "fenced" });
  });

  it("parses JSON with preamble text", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: 'Here is the result:\n{"key": "preamble"}' }],
      stop_reason: "end_turn",
    });

    const result = await promptClaude<{ key: string }>({
      model: "haiku",
      system: "test",
      prompt: "test",
    });
    expect(result).toEqual({ key: "preamble" });
  });

  it("throws on invalid JSON response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "This is not JSON at all" }],
      stop_reason: "end_turn",
    });

    await expect(
      promptClaude({ model: "haiku", system: "test", prompt: "test" }),
    ).rejects.toThrow("Failed to parse Claude response as JSON");
  });

  it("throws on truncation (max_tokens stop reason)", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"partial": true' }],
      stop_reason: "max_tokens",
    });

    await expect(
      promptClaude({ model: "haiku", system: "test", prompt: "test" }),
    ).rejects.toThrow("truncated");
  });

  it("throws when no text block in response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "thinking", thinking: "hmm" }],
      stop_reason: "end_turn",
    });

    await expect(
      promptClaude({ model: "haiku", system: "test", prompt: "test" }),
    ).rejects.toThrow("No text response");
  });

  it("adds thinking budget when thinking is enabled", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"result": true}' }],
      stop_reason: "end_turn",
    });

    await promptClaude({
      model: "opus",
      system: "test",
      prompt: "test",
      thinking: true,
      maxTokens: 4096,
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.max_tokens).toBe(4096 + 8192);
    expect(callArgs.thinking).toEqual({ type: "enabled", budget_tokens: 8192 });
  });
});
