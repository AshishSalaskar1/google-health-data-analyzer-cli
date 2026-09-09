import { describe, expect, it } from "vitest";
import { buildCoachCatalog, executeCoachTools } from "./healthTools";
import type { HealthReport } from "../health/models";

const report = {
  range: { min: "2025-01-01", max: "2025-12-31", selectedFrom: "2025-01-01", selectedTo: "2025-12-31" },
  summary: { totalSteps: 3000, averageDailySteps: 1500, trackedDays: 2, totalDistanceMeters: 2000, totalEnergyJoules: 1000, exerciseCount: 0, exerciseMinutes: 0, heartRateMin: null, heartRateAverage: null, heartRateMax: null, latestWeightGrams: null, averageSleepMinutes: null, averageAsleepMinutes: null, averageSleepEfficiency: null },
  activity: [{ date: "2025-12-30", steps: 1000, distanceMeters: 700, energyJoules: 400 }, { date: "2025-12-31", steps: 2000, distanceMeters: 1300, energyJoules: 600 }],
  heartRate: [], restingHeartRate: [], exercises: [], sleep: [], weight: [], hrv: [], respiratoryRate: [], skinTemperature: [], oxygen: [], bloodPressure: [], hydration: [], hourlySteps: [], heartRateBucketMinutes: 60,
  sources: [{ id: 1, name: "Watch", packageName: "watch", records: 2 }], warnings: [], availableTables: [], fileName: "test.db", schemaVersion: 26, generatedAt: 0,
} satisfies HealthReport;

describe("coach health tools", () => {
  it("advertises only available domains", () => expect(buildCoachCatalog(report).domains.activity).toBe(true));
  it("clamps model-selected ranges and returns evidence", async () => {
    let filters: unknown;
    const evidence = await executeCoachTools({ info: { fileName: "test.db", schemaVersion: 26, minDate: "2025-01-01", maxDate: "2025-12-31", sources: [], availableTables: [] }, analyze: async (next) => { filters = next; return report; } }, [{ id: "x", domain: "activity", from: "2020-01-01", to: "2026-01-01", granularity: "daily", reason: "trend" }]);
    expect(filters).toEqual({ from: "2025-01-01", to: "2025-12-31", sourceId: null });
    expect(evidence[0].id).toBe("H1");
  });
});
