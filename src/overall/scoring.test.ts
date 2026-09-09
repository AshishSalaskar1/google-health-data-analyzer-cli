import { describe, expect, it } from "vitest";
import type { HealthReport } from "../health/models";
import { assessOverallHealth } from "./scoring";

const report = {
  summary: { trackedDays: 28, averageDailySteps: 8000, exerciseMinutes: 600, averageAsleepMinutes: 480, averageSleepEfficiency: 90 },
  restingHeartRate: [{ timestamp: 1, value: 60 }], sleep: [],
  activity: [{ date: "2026-01-01", steps: 8000, distanceMeters: 0, energyJoules: 0 }], availableTables: ["exercise_session_record_table"],
} as unknown as HealthReport;

describe("assessOverallHealth", () => {
  it("scores an evidence-complete reference profile without changing its age", () => {
    const result = assessOverallHealth({ age: 40, heightCm: 180, weightKg: 75 }, report);
    expect(result.overallScore).toBeGreaterThan(90);
    expect(result.estimatedAge).toBeLessThan(40);
    expect(result.coverage).toBe(1);
  });

  it("treats missing cardio data as uncertainty instead of a zero", () => {
    const result = assessOverallHealth({ age: 40, heightCm: 180, weightKg: 75 }, { ...report, restingHeartRate: [] });
    expect(result.aspects.find((aspect) => aspect.id === "cardio")?.score).toBeNull();
    expect(result.coverage).toBe(.8);
    expect(result.overallScore).toBeGreaterThan(90);
  });

  it("does not penalize absent movement and training tables", () => {
    const result = assessOverallHealth({ age: 40, heightCm: 180, weightKg: 75 }, { ...report, activity: [], availableTables: [] });
    expect(result.aspects.find((aspect) => aspect.id === "movement")?.score).toBeNull();
    expect(result.aspects.find((aspect) => aspect.id === "training")?.score).toBeNull();
    expect(result.overallScore).toBeGreaterThan(90);
  });
});
