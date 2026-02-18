import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/config/env", () => ({
  getEnv: () => ({
    OPENAI_API_KEY: "sk-test-openai-key",
  }),
}));

const mockGenerate = vi.fn();
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      images = { generate: mockGenerate };
    },
  };
});

// For sharp, we need to define the mock instance outside BUT the factory must
// return a function with the static property. We use vi.hoisted to lift the vars.
const { mockToBuffer, mockResize, mockPng } = vi.hoisted(() => ({
  mockToBuffer: vi.fn(),
  mockResize: vi.fn(),
  mockPng: vi.fn(),
}));

vi.mock("sharp", () => {
  mockResize.mockReturnThis();
  mockPng.mockReturnThis();
  const fn = vi.fn().mockImplementation(() => ({
    resize: mockResize,
    png: mockPng,
    toBuffer: mockToBuffer,
  }));
  (fn as unknown as Record<string, unknown>).kernel = { lanczos3: "lanczos3" };
  return { default: fn };
});

import { generateProductImages } from "@/lib/ai/images";

describe("generateProductImages", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockResize.mockClear().mockReturnThis();
    mockPng.mockClear().mockReturnThis();
    mockToBuffer.mockReset();
  });

  it("happy path: returns array of N buffers", async () => {
    const fakeB64 = Buffer.from("fake-image-data").toString("base64");
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: fakeB64 }],
    });
    mockToBuffer.mockResolvedValue(Buffer.from("upscaled-image"));

    const result = await generateProductImages(["prompt1", "prompt2"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(Buffer);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it("throws when no b64_json in response", async () => {
    mockGenerate.mockResolvedValue({
      data: [{ url: "https://example.com/image.png" }],
    });

    await expect(generateProductImages(["prompt1"])).rejects.toThrow(
      "did not return image data",
    );
  });

  it("calls sharp with resize(2000, 2000) and fill fit", async () => {
    const fakeB64 = Buffer.from("fake-image").toString("base64");
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: fakeB64 }],
    });
    mockToBuffer.mockResolvedValue(Buffer.from("upscaled"));

    await generateProductImages(["prompt1"]);

    expect(mockResize).toHaveBeenCalledWith(2000, 2000, expect.objectContaining({
      fit: "fill",
    }));
    expect(mockPng).toHaveBeenCalled();
  });

  it("generates multiple images in parallel", async () => {
    const fakeB64 = Buffer.from("fake").toString("base64");
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: fakeB64 }],
    });
    mockToBuffer.mockResolvedValue(Buffer.from("upscaled"));

    const prompts = ["p1", "p2", "p3"];
    const result = await generateProductImages(prompts);
    expect(result).toHaveLength(3);
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it("passes correct parameters to OpenAI", async () => {
    const fakeB64 = Buffer.from("fake").toString("base64");
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: fakeB64 }],
    });
    mockToBuffer.mockResolvedValue(Buffer.from("upscaled"));

    await generateProductImages(["my prompt"]);

    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-image-1",
      prompt: "my prompt",
      n: 1,
      size: "1024x1024",
    }));
  });
});
