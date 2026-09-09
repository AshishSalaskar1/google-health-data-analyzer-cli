import { describe, expect, it } from "vitest";
import type { ServerConfig } from "./config.ts";
import { completionUrl, usesResponsesApi } from "./foundry.ts";

function config(endpoint: string): ServerConfig {
  return { endpoint, apiKey: "test", deployment: "gpt-5", apiVersion: "2025-08-07", port: 3000 };
}

describe("Foundry endpoint routing", () => {
  it("uses Responses API for an OpenAI v1 base URL", () => {
    const value = config("https://example.openai.azure.com/openai/v1");
    expect(usesResponsesApi(value)).toBe(true);
    expect(completionUrl(value)).toBe("https://example.openai.azure.com/openai/v1/responses");
  });

  it("retains legacy deployment-scoped chat completions", () => {
    const value = config("https://example.openai.azure.com");
    expect(usesResponsesApi(value)).toBe(false);
    expect(completionUrl(value)).toContain("/openai/deployments/gpt-5/chat/completions");
  });
});
