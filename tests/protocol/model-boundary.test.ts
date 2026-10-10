import { describe, it, expect } from "vitest";
import {
  MODEL,
  validateProviderRequest,
} from "../../packages/model-provider/src/agent.js";
describe("provider spending boundary", () => {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  );
  const request = {
    generationConfig: {
      maxOutputTokens: 1536,
      thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false },
    },
    tools: [{ functionDeclarations: [] }],
  };
  it("accepts only the bounded single-candidate text tool request", () =>
    expect(() =>
      validateProviderRequest(url, JSON.stringify(request)),
    ).not.toThrow());
  it("rejects larger outputs, alternate hosts/models, auxiliary billed tools and oversized input", () => {
    for (const body of [
      {
        ...request,
        generationConfig: {
          ...request.generationConfig,
          maxOutputTokens: 65536,
        },
      },
      {
        ...request,
        generationConfig: { ...request.generationConfig, candidateCount: 2 },
      },
      { ...request, tools: [{ googleSearch: {} }] },
      { ...request, contents: "x".repeat(32768) },
    ])
      expect(() => validateProviderRequest(url, JSON.stringify(body))).toThrow(
        "MODEL_REQUEST_BOUNDARY",
      );
    for (const u of [
      "https://example.com/v1beta/models/" + MODEL + ":generateContent",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    ])
      expect(() =>
        validateProviderRequest(new URL(u), JSON.stringify(request)),
      ).toThrow("MODEL_REQUEST_BOUNDARY");
  });
});
