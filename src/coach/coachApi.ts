import type { CoachAnswerRequest, CoachAnswerResponse, CoachPlanRequest, CoachPlanResponse } from "./models";

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() as T & { error?: string } : null;
  if (!response.ok) throw new Error(payload?.error || `Coach request failed (${response.status}). Make sure the coach server is running.`);
  if (!payload) throw new Error("Coach server returned an invalid response.");
  return payload;
}

export const requestContextPlan = (request: CoachPlanRequest) => post<CoachPlanResponse>("/api/coach/plan", request);
export const requestCoachAnswer = (request: CoachAnswerRequest) => post<CoachAnswerResponse>("/api/coach/answer", request);
