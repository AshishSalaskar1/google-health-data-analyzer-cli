import type { BodyAgeRequest, BodyAgeResponse } from "./models";

export async function requestBodyAge(request: BodyAgeRequest): Promise<BodyAgeResponse> {
  const response = await fetch("/api/overall/body-age", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  const payload = await response.json() as BodyAgeResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Body age request failed (${response.status}). Make sure the AI server is running.`);
  return payload;
}
