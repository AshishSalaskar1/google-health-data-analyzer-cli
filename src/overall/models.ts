import type { HealthReport } from "../health/models";

export interface HealthProfile {
  age: number;
  heightCm: number;
  weightKg: number;
  gender?: "female" | "male" | "nonbinary" | "prefer-not-to-say";
}

export type HealthAspectId = "movement" | "training" | "sleep" | "cardio" | "body";

export interface HealthAspect {
  id: HealthAspectId;
  label: string;
  score: number | null;
  value: string;
  detail: string;
  ageImpact: number;
  evidence: string;
  sourceUrl: string;
}

export interface OverallAssessment {
  overallScore: number;
  estimatedAge: number;
  confidence: "limited" | "moderate" | "strong";
  bmi: number;
  aspects: HealthAspect[];
  coverage: number;
}

export interface BodyAgeRequest {
  profile: HealthProfile;
  assessment: OverallAssessment;
  period: HealthReport["range"];
}

export interface BodyAgeResponse {
  estimatedAge: number;
  summary: string;
  topFactors: Array<{ aspectId: HealthAspectId; direction: "adds" | "reduces"; years: number; explanation: string }>;
  methodology: string;
}
