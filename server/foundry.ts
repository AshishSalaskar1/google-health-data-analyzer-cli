import type { ServerConfig } from "./config.ts";

interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

export function usesResponsesApi(config: ServerConfig): boolean {
  return /\/openai\/v1\/?$/.test(config.endpoint);
}

export function completionUrl(config: ServerConfig): string {
  if (usesResponsesApi(config)) return `${config.endpoint}/responses`;
  if (config.endpoint.includes("/openai/deployments/")) return `${config.endpoint}/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;
  return `${config.endpoint}/openai/deployments/${encodeURIComponent(config.deployment)}/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;
}

function responseText(payload: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }): string | undefined {
  if (payload.output_text) return payload.output_text;
  return payload.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("") || undefined;
}

export async function complete(config: ServerConfig, messages: ChatMessage[], options: { json?: boolean; temperature?: number } = {}): Promise<string> {
  const responsesApi = usesResponsesApi(config);
  const response = await fetch(completionUrl(config), {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": config.apiKey },
    body: JSON.stringify(responsesApi ? {
      model: config.deployment,
      input: messages,
      max_output_tokens: 5000,
      reasoning: { effort: "minimal" },
      store: false,
      ...(options.json ? { text: { format: { type: "json_object" } } } : {}),
    } : {
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: 1800,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Foundry inference failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; choices?: Array<{ message?: { content?: string } }> };
  const content = responsesApi ? responseText(payload) : payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Foundry returned an empty response.");
  return content;
}

export function parseJson<T>(content: string): T {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}
