import type { AnalyzeFilters, DatabaseInfo, HealthReport } from "../health/models";

export type CoachDomain = "overview" | "activity" | "heart" | "exercise" | "sleep" | "vitals";
export type CoachGranularity = "summary" | "daily" | "session" | "trace";

export interface CoachProfile {
  name: string;
  goals: string;
  preferences: string;
  constraints: string;
}

export interface CoachMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  evidence?: CoachEvidence[];
  chart?: CoachChart;
  urgent?: boolean;
}

export type CoachChartType = "line" | "bar";

export interface CoachChartSeries {
  key: string;
  label: string;
  unit: string;
}

export interface CoachChartPoint {
  label: string;
  values: Record<string, number>;
}

export interface CoachChart {
  type: CoachChartType;
  title: string;
  subtitle: string;
  evidenceId: string;
  series: CoachChartSeries[];
  points: CoachChartPoint[];
}

export interface WeeklyPlanItem {
  day: string;
  focus: string;
  action: string;
  target: string;
}

export interface WeeklyPlan {
  title: string;
  rationale: string;
  items: WeeklyPlanItem[];
  adjustment: string;
  generatedAt: number;
}

export interface CoachDataCatalog {
  range: { min: string; max: string };
  domains: Record<CoachDomain, boolean>;
  sources: string[];
  warnings: string[];
}

export interface CoachToolRequest {
  id: string;
  domain: CoachDomain;
  from: string;
  to: string;
  granularity: CoachGranularity;
  reason: string;
}

export interface CoachPlanResponse {
  requests: CoachToolRequest[];
  needsGuidance: boolean;
  guidanceQuery: string;
  rationale: string;
}

export interface CoachEvidence {
  id: string;
  title: string;
  kind: "health" | "guidance";
  source: string;
  period?: string;
  coverage?: string;
  data: unknown;
  url?: string;
}

export interface CoachAnswerResponse {
  answer: string;
  evidence: CoachEvidence[];
  chart?: CoachChart;
  weeklyPlan?: WeeklyPlan;
  urgent?: boolean;
}

export interface CoachPlanRequest {
  question: string;
  profile: CoachProfile;
  catalog: CoachDataCatalog;
  history: Array<Pick<CoachMessage, "role" | "content">>;
  wantsWeeklyPlan?: boolean;
}

export interface CoachAnswerRequest extends CoachPlanRequest {
  evidence: CoachEvidence[];
}

export interface CoachDataSource {
  info: DatabaseInfo;
  analyze(filters: AnalyzeFilters): Promise<HealthReport>;
}
