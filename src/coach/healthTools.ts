import type { DataPoint, HealthReport } from "../health/models";
import type { CoachDataCatalog, CoachDataSource, CoachDomain, CoachEvidence, CoachToolRequest } from "./models";

const MAX_DAYS = 366;
const MAX_SERIES = 120;
const MAX_SESSIONS = 24;

function sample<T>(values: T[], maximum = MAX_SERIES): T[] {
  if (values.length <= maximum) return values;
  const step = values.length / maximum;
  return Array.from({ length: maximum }, (_, index) => values[Math.floor(index * step)]);
}

function points(values: DataPoint[]): Array<{ at: number; value: number; samples?: number }> {
  return sample(values).map((point) => ({ at: point.timestamp, value: point.value, samples: point.secondary }));
}

function clampRange(request: CoachToolRequest, min: string, max: string): CoachToolRequest {
  const to = request.to > max ? max : request.to < min ? min : request.to;
  let from = request.from < min ? min : request.from > to ? to : request.from;
  const earliest = new Date(`${to}T00:00:00Z`).getTime() - (MAX_DAYS - 1) * 86400000;
  if (Date.parse(from) < earliest) from = new Date(earliest).toISOString().slice(0, 10);
  return { ...request, from, to };
}

export function buildCoachCatalog(report: HealthReport): CoachDataCatalog {
  return {
    range: { min: report.range.min, max: report.range.max },
    domains: {
      overview: true,
      activity: report.activity.length > 0,
      heart: report.heartRate.length > 0 || report.restingHeartRate.length > 0,
      exercise: report.exercises.length > 0,
      sleep: report.sleep.length > 0,
      vitals: [report.weight, report.hrv, report.respiratoryRate, report.oxygen, report.bloodPressure].some((values) => values.length > 0),
    },
    sources: report.sources.map((source) => source.name),
    warnings: report.warnings,
  };
}

function project(domain: CoachDomain, report: HealthReport, granularity: CoachToolRequest["granularity"]): unknown {
  if (domain === "overview") return { summary: report.summary, warnings: report.warnings };
  if (domain === "activity") return {
    totalSteps: report.summary.totalSteps,
    averageDailySteps: report.summary.averageDailySteps,
    trackedDays: report.summary.trackedDays,
    totalDistanceMeters: report.summary.totalDistanceMeters,
    totalEnergyJoules: report.summary.totalEnergyJoules,
    daily: granularity === "summary" ? undefined : sample(report.activity),
  };
  if (domain === "heart") return {
    minimum: report.summary.heartRateMin,
    average: report.summary.heartRateAverage,
    maximum: report.summary.heartRateMax,
    bucketMinutes: report.heartRateBucketMinutes,
    trace: granularity === "summary" ? undefined : points(report.heartRate),
    resting: points(report.restingHeartRate),
  };
  if (domain === "exercise") return {
    count: report.summary.exerciseCount,
    minutes: report.summary.exerciseMinutes,
    sessions: granularity === "summary" ? undefined : report.exercises.slice(0, MAX_SESSIONS).map((session) => ({
      start: session.localStart, durationMinutes: session.durationMinutes, type: session.typeName,
      averageHeartRate: session.average, perceivedExertion: session.perceivedExertion,
      estimatedSteps: session.estimatedSteps, estimatedDistanceMeters: session.estimatedDistanceMeters,
    })),
  };
  if (domain === "sleep") return {
    averageSessionMinutes: report.summary.averageSleepMinutes,
    averageAsleepMinutes: report.summary.averageAsleepMinutes,
    averageEfficiency: report.summary.averageSleepEfficiency,
    sessions: granularity === "summary" ? undefined : report.sleep.slice(0, MAX_SESSIONS).map((session) => ({
      end: session.localEnd, durationMinutes: session.durationMinutes, asleepMinutes: session.asleepMinutes,
      awakeMinutes: session.awakeMinutes, efficiency: session.efficiency, awakenings: session.awakenings,
      hrv: session.hrv, restingHeartRate: session.restingHeartRate, respiratoryRate: session.respiratoryRate,
      skinTemperatureDelta: session.skinTemperatureDelta,
    })),
  };
  return {
    weightGrams: points(report.weight), restingHeartRate: points(report.restingHeartRate), hrvRmssd: points(report.hrv),
    respiratoryRate: points(report.respiratoryRate), skinTemperatureDelta: points(report.skinTemperature),
    oxygenSaturation: points(report.oxygen), bloodPressure: points(report.bloodPressure), hydrationLiters: points(report.hydration),
  };
}

export async function executeCoachTools(source: CoachDataSource, requests: CoachToolRequest[]): Promise<CoachEvidence[]> {
  return Promise.all(requests.slice(0, 4).map(async (unsafeRequest, index) => {
    const request = clampRange(unsafeRequest, source.info.minDate, source.info.maxDate);
    const report = await source.analyze({ from: request.from, to: request.to, sourceId: null });
    return {
      id: `H${index + 1}`,
      title: `${request.domain[0].toUpperCase()}${request.domain.slice(1)} data`,
      kind: "health" as const,
      source: "Health Connect archive",
      period: `${request.from} to ${request.to}`,
      coverage: `${report.summary.trackedDays} activity days, ${report.sleep.length} sleep sessions, ${report.exercises.length} exercise sessions`,
      data: project(request.domain, report, request.granularity),
    };
  }));
}
