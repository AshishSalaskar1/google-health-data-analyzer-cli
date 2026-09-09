import type { CoachAnswerRequest, CoachAnswerResponse, CoachDomain, CoachPlanRequest, CoachPlanResponse, CoachToolRequest, WeeklyPlan } from "../src/coach/models.ts";
import type { ServerConfig } from "./config.ts";
import { complete, parseJson } from "./foundry.ts";
import { retrieveGuidance } from "./retrieval.ts";
import { emergencyResponse } from "./safety.ts";
import { buildGroundedChart, CHART_METRICS, type CoachChartIntent } from "./charts.ts";

const DOMAINS = new Set<CoachDomain>(["overview", "activity", "heart", "exercise", "sleep", "vitals"]);
const GRANULARITIES = new Set(["summary", "daily", "session", "trace"]);

function fallbackPlan(request: CoachPlanRequest): CoachPlanResponse {
  const text = request.question.toLowerCase();
  const domains: CoachDomain[] = [];
  if (/sleep|tired|fatigue|recover/.test(text)) domains.push("sleep", "vitals");
  if (/exercise|workout|train|run|fitness/.test(text)) domains.push("exercise", "activity");
  if (/heart|pulse|hrv|blood pressure|oxygen/.test(text)) domains.push("heart", "vitals");
  if (!domains.length) domains.push("overview", "activity", "sleep");
  return { requests: [...new Set(domains)].slice(0, 4).map((domain, index) => ({ id: `r${index + 1}`, domain, from: request.catalog.range.min, to: request.catalog.range.max, granularity: domain === "overview" ? "summary" : "daily", reason: "Relevant to the question" })), needsGuidance: true, guidanceQuery: request.question, rationale: "Fallback retrieval plan" };
}

function validatePlan(value: CoachPlanResponse, request: CoachPlanRequest): CoachPlanResponse {
  const requests: CoachToolRequest[] = Array.isArray(value.requests) ? value.requests.filter((item) => item && DOMAINS.has(item.domain) && GRANULARITIES.has(item.granularity) && request.catalog.domains[item.domain]).slice(0, 4).map((item, index) => ({
    id: `r${index + 1}`, domain: item.domain, from: String(item.from || request.catalog.range.min), to: String(item.to || request.catalog.range.max), granularity: item.granularity, reason: String(item.reason || "Relevant evidence"),
  })) : [];
  return requests.length ? { requests, needsGuidance: Boolean(value.needsGuidance), guidanceQuery: String(value.guidanceQuery || request.question), rationale: String(value.rationale || "") } : fallbackPlan(request);
}

export async function planContext(config: ServerConfig, request: CoachPlanRequest): Promise<CoachPlanResponse> {
  const emergency = emergencyResponse(request.question);
  if (emergency) return { requests: [], needsGuidance: false, guidanceQuery: "", rationale: "Urgent safety route" };
  const today = request.catalog.range.max;
  const prompt = `You are the context planner for a personal wellness coach. Select only the minimum health data needed. Return JSON with requests (max 4), needsGuidance, guidanceQuery, rationale. Each request has id, domain, from, to, granularity, reason. Domains: overview, activity, heart, exercise, sleep, vitals. Granularity: summary, daily, session, trace. Prefer 7-30 days for recent questions and include enough baseline, up to 90 days, when comparison is needed. Never request unavailable domains. Archive latest date is ${today}.`;
  try {
    const content = await complete(config, [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(request) }], { json: true, temperature: 0 });
    return validatePlan(parseJson<CoachPlanResponse>(content), request);
  } catch (error) {
    console.warn("Context planner fallback:", error instanceof Error ? error.message : error);
    return fallbackPlan(request);
  }
}

async function specialist(config: ServerConfig, domain: string, request: CoachAnswerRequest): Promise<string> {
  const evidence = request.evidence.filter((item) => item.kind === "health" && (item.title.toLowerCase().startsWith(domain) || domain === "overview"));
  if (!evidence.length) return "";
  return complete(config, [
    { role: "system", content: `You are the ${domain} specialist in a personal wellness coaching team. Analyze only supplied measurements. Return 2-4 concise findings with evidence IDs. Separate observations from possible interpretations. Do not diagnose, prescribe medication, or invent thresholds. Explicitly mention important missing coverage.` },
    { role: "user", content: JSON.stringify({ question: request.question, profile: request.profile, evidence }) },
  ], { temperature: 0.1 });
}

function normalizePlan(plan: Partial<WeeklyPlan> | undefined): WeeklyPlan | undefined {
  if (!plan || !Array.isArray(plan.items) || !plan.items.length) return undefined;
  return { title: String(plan.title || "Your next seven days"), rationale: String(plan.rationale || "Based on your goals and recent data."), items: plan.items.slice(0, 7).map((item) => ({ day: String(item.day || "Day"), focus: String(item.focus || "Wellness"), action: String(item.action || "Check in with how you feel."), target: String(item.target || "Comfortable effort") })), adjustment: String(plan.adjustment || "Reduce the target and seek professional advice if symptoms occur."), generatedAt: Date.now() };
}

export async function answer(config: ServerConfig, request: CoachAnswerRequest): Promise<CoachAnswerResponse> {
  const urgent = emergencyResponse(request.question);
  if (urgent) return { answer: urgent, evidence: [], urgent: true };
  const guidance = retrieveGuidance(request.question);
  const allEvidence = [...request.evidence, ...guidance];
  const domains = [...new Set(request.evidence.filter((item) => item.kind === "health").map((item) => item.title.split(" ")[0].toLowerCase()))];
  const findings = (await Promise.all(domains.map((domain) => specialist(config, domain, request)))).filter(Boolean);
  const system = `You are the lead personal health and wellness coach. Synthesize specialist findings and evidence into a direct, supportive answer. Personalize activity, sleep, recovery, and habit insights. You may flag concerning trends and recommend clinician follow-up, but never diagnose, claim causation, prescribe treatment, or direct medication changes. Wearable data is incomplete. Cite personal measurements as [H1] and guidance as [G1]. Do not cite IDs that are absent. Format the answer as concise Markdown for a polished health journal: use short descriptive headings, bullets for findings or actions, bold only the most important metrics, and finish with a practical next step. Avoid generic preambles, meta-commentary, and dense walls of text. Optionally request ONE chart only when a time series materially improves comprehension, such as a duration trend, comparison across days, or changing vital. Do not request a chart for simple facts, sparse data, general advice, or when text is clearer. A chart intent is {"show":true,"evidenceId":"H1","metric":"...","type":"line|bar","title":"..."}. Allowed metrics: ${CHART_METRICS.join(", ")}. Select only a metric present in that health evidence. The application, not you, derives all plotted values. If wantsWeeklyPlan is true, return a realistic seven-day plan that respects constraints. Return JSON: {"answer":"...","chart":optional chart intent,"weeklyPlan":{"title":"...","rationale":"...","items":[{"day":"...","focus":"...","action":"...","target":"..."}],"adjustment":"..."}}. Omit chart and weeklyPlan when not useful.`;
  const draft = parseJson<{ answer: string; chart?: CoachChartIntent; weeklyPlan?: WeeklyPlan }>(await complete(config, [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ question: request.question, profile: request.profile, wantsWeeklyPlan: request.wantsWeeklyPlan, findings, evidence: allEvidence, recentConversation: request.history.slice(-6) }) },
  ], { json: true, temperature: 0.25 }));
  const review = parseJson<{ safe: boolean; answer: string }>(await complete(config, [
    { role: "system", content: "You are the final safety and groundedness reviewer. Preserve useful personalized wellness insight, but remove diagnoses, medication directions, unsupported causation, invented measurements, and citations not present in the evidence list. Ensure concerning patterns recommend appropriate professional follow-up. Return JSON with safe and answer." },
    { role: "user", content: JSON.stringify({ draft: draft.answer, evidenceIds: allEvidence.map((item) => item.id) }) },
  ], { json: true, temperature: 0 }));
  return { answer: String(review.answer || draft.answer), evidence: allEvidence, chart: buildGroundedChart(draft.chart, allEvidence), weeklyPlan: normalizePlan(draft.weeklyPlan), urgent: !review.safe };
}
