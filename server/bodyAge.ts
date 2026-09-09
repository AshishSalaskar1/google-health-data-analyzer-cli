import type { BodyAgeRequest, BodyAgeResponse, HealthAspectId } from "../src/overall/models.ts";
import type { ServerConfig } from "./config.ts";
import { complete, parseJson } from "./foundry.ts";

const ASPECTS = new Set<HealthAspectId>(["movement", "training", "sleep", "cardio", "body"]);

export async function explainBodyAge(config: ServerConfig, request: BodyAgeRequest): Promise<BodyAgeResponse> {
  if (!request?.profile || !request?.assessment || !Number.isFinite(request.assessment.estimatedAge)) throw new Error("A valid profile and assessment are required.");
  const evidence = request.assessment.aspects.map(({ id, label, score, value, ageImpact, evidence }) => ({ id, label, score, value, ageImpact: Number(ageImpact.toFixed(1)), evidence }));
  const content = await complete(config, [
    { role: "system", content: "You explain a precomputed personal wellness age estimate. The number is fixed and must never be changed. Rank the supplied factors by absolute ageImpact and explain the top 3 in plain language. Positive impact adds years; negative impact reduces years. Do not diagnose, infer unprovided facts, or imply biological/clinical validation. Mention missing data and limited confidence when present. Return JSON: {summary:string, topFactors:[{aspectId,direction,years,explanation}], methodology:string}. Keep the summary to 2 sentences, each explanation to 1 sentence, and methodology to 2 sentences." },
    { role: "user", content: JSON.stringify({ chronologicalAge: request.profile.age, fixedEstimatedAge: request.assessment.estimatedAge, confidence: request.assessment.confidence, coverage: request.assessment.coverage, period: request.period, evidence }) },
  ], { json: true, temperature: 0.1 });
  const draft = parseJson<Omit<BodyAgeResponse, "estimatedAge">>(content);
  const explanations = new Map((Array.isArray(draft.topFactors) ? draft.topFactors : []).filter((factor) => factor && ASPECTS.has(factor.aspectId)).map((factor) => [factor.aspectId, factor.explanation]));
  const topFactors = [...request.assessment.aspects].filter((aspect) => aspect.score !== null).sort((a, b) => Math.abs(b.ageImpact) - Math.abs(a.ageImpact)).slice(0, 3).map((aspect) => ({
    aspectId: aspect.id,
    direction: aspect.ageImpact > 0 ? "adds" as const : "reduces" as const,
    years: Math.abs(Number(aspect.ageImpact.toFixed(1))),
    explanation: String(explanations.get(aspect.id) || aspect.evidence),
  }));
  return {
    estimatedAge: request.assessment.estimatedAge,
    summary: String(draft.summary || "This estimate compares your available wellness signals with transparent reference ranges."),
    topFactors,
    methodology: String(draft.methodology || "The displayed age is calculated locally from the visible factor scores. AI explains the result but does not calculate or change it."),
  };
}
