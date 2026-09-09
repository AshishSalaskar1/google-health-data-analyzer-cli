import type { CoachChart, CoachChartPoint, CoachChartType, CoachEvidence } from "../src/coach/models.ts";

export const CHART_METRICS = [
  "sleep_duration", "sleep_efficiency", "sleep_awakenings", "steps", "distance",
  "heart_rate", "resting_heart_rate", "exercise_duration", "hrv", "weight",
  "respiratory_rate", "oxygen",
] as const;

export type CoachChartMetric = typeof CHART_METRICS[number];

export interface CoachChartIntent {
  show?: boolean;
  evidenceId?: string;
  metric?: string;
  type?: CoachChartType;
  title?: string;
}

type ObjectValue = Record<string, unknown>;

function object(value: unknown): ObjectValue | null {
  return value && typeof value === "object" ? value as ObjectValue : null;
}

function records(value: unknown): ObjectValue[] {
  return Array.isArray(value) ? value.map(object).filter((item): item is ObjectValue => item !== null) : [];
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateLabel(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const timestamp = number(value);
  if (timestamp === null) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function point(label: string | null, key: string, value: number | null, divisor = 1): CoachChartPoint | null {
  return label && value !== null ? { label, values: { [key]: Math.round(value / divisor * 10) / 10 } } : null;
}

function validPoints(values: Array<CoachChartPoint | null>): CoachChartPoint[] {
  return values.filter((item): item is CoachChartPoint => item !== null).sort((a, b) => a.label.localeCompare(b.label)).slice(-60);
}

function seriesChart(intent: CoachChartIntent, evidence: CoachEvidence, key: string, label: string, unit: string, points: CoachChartPoint[], defaultType: CoachChartType): CoachChart | undefined {
  if (points.length < 2) return undefined;
  return {
    type: intent.type === "bar" || intent.type === "line" ? intent.type : defaultType,
    title: String(intent.title || label),
    subtitle: `${evidence.period || "Selected period"} · ${evidence.id}`,
    evidenceId: evidence.id,
    series: [{ key, label, unit }],
    points,
  };
}

export function buildGroundedChart(intent: CoachChartIntent | undefined, evidence: CoachEvidence[]): CoachChart | undefined {
  if (!intent?.show || !intent.evidenceId || !CHART_METRICS.includes(intent.metric as CoachChartMetric)) return undefined;
  const source = evidence.find((item) => item.kind === "health" && item.id === intent.evidenceId);
  const data = object(source?.data);
  if (!source || !data) return undefined;
  const metric = intent.metric as CoachChartMetric;

  if (metric.startsWith("sleep_")) {
    const sessions = records(data.sessions);
    const config = metric === "sleep_duration" ? ["asleep", "Sleep duration", " hours", "asleepMinutes", 60] as const
      : metric === "sleep_efficiency" ? ["efficiency", "Sleep efficiency", "%", "efficiency", 1] as const
        : ["awakenings", "Awakenings", "", "awakenings", 1] as const;
    return seriesChart(intent, source, config[0], config[1], config[2], validPoints(sessions.map((item) => point(dateLabel(item.end), config[0], number(item[config[3]]), config[4]))), "bar");
  }

  if (metric === "steps" || metric === "distance") {
    const daily = records(data.daily);
    const config = metric === "steps" ? ["steps", "Daily steps", " steps", "steps", 1] as const : ["distance", "Daily distance", " km", "distanceMeters", 1000] as const;
    return seriesChart(intent, source, config[0], config[1], config[2], validPoints(daily.map((item) => point(dateLabel(item.date), config[0], number(item[config[3]]), config[4]))), "bar");
  }

  if (metric === "exercise_duration") {
    const sessions = records(data.sessions);
    return seriesChart(intent, source, "minutes", "Exercise duration", " min", validPoints(sessions.map((item) => point(dateLabel(item.start), "minutes", number(item.durationMinutes)))), "bar");
  }

  const metricConfig: Record<string, { collection: string; key: string; label: string; unit: string; divisor?: number }> = {
    heart_rate: { collection: "trace", key: "heartRate", label: "Heart rate", unit: " bpm" },
    resting_heart_rate: { collection: data.resting ? "resting" : "restingHeartRate", key: "restingHeartRate", label: "Resting heart rate", unit: " bpm" },
    hrv: { collection: "hrvRmssd", key: "hrv", label: "Heart-rate variability", unit: " ms" },
    weight: { collection: "weightGrams", key: "weight", label: "Weight", unit: " kg", divisor: 1000 },
    respiratory_rate: { collection: "respiratoryRate", key: "respiratoryRate", label: "Respiratory rate", unit: "/min" },
    oxygen: { collection: "oxygenSaturation", key: "oxygen", label: "Oxygen saturation", unit: "%" },
  };
  const config = metricConfig[metric];
  if (!config) return undefined;
  const values = records(data[config.collection]);
  return seriesChart(intent, source, config.key, config.label, config.unit, validPoints(values.map((item) => point(dateLabel(item.at), config.key, number(item.value), config.divisor))), "line");
}
