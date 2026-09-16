import { describe, expect, it } from "vitest";
import { summarizeSleep, summarizeSleepSchedule } from "./calculations";
import type { SleepSession, SleepStage } from "./models";

function stage(type: number, minutes: number): SleepStage {
  return { start: 0, end: minutes * 60000, localStart: 0, localEnd: minutes * 60000, type, name: "", durationMinutes: minutes };
}

describe("summarizeSleep", () => {
  it("separates recorded awake time from asleep stages", () => {
    const result = summarizeSleep([stage(1, 10), stage(4, 180), stage(5, 70), stage(6, 100), stage(1, 20)], 380);
    expect(result.asleepMinutes).toBe(350);
    expect(result.awakeMinutes).toBe(30);
    expect(result.efficiency).toBeCloseTo(92.1, 1);
    expect(result.awakenings).toBe(1);
    expect(result.transitions).toBe(4);
    expect(result.stageTotals.find((item) => item.name === "REM")?.minutes).toBe(100);
  });

  it("uses session duration when no stage records exist", () => {
    expect(summarizeSleep([], 420)).toMatchObject({ asleepMinutes: 420, awakeMinutes: 0, efficiency: 100, awakenings: 0, transitions: 0 });
  });

  it("treats out-of-bed and awake-in-bed stages as awake", () => {
    const result = summarizeSleep([stage(4, 60), stage(3, 5), stage(4, 30), stage(7, 5)], 100);
    expect(result.awakeMinutes).toBe(10);
    expect(result.asleepMinutes).toBe(90);
    expect(result.awakenings).toBe(2);
  });

  it("derives sleep latency, WASO, and stage composition when stages are recorded", () => {
    const result = summarizeSleep([stage(1, 10), stage(4, 180), stage(1, 15), stage(5, 70), stage(6, 100), stage(1, 20)], 395);
    expect(result.detailed.hasStageData).toBe(true);
    expect(result.detailed.sleepLatencyMinutes).toBe(10);
    expect(result.detailed.wakeAfterSleepOnsetMinutes).toBe(15);
    expect(result.detailed.longestAwakeStretchMinutes).toBe(15);
    expect(result.detailed.remMinutes).toBe(100);
    expect(result.detailed.deepMinutes).toBe(70);
    expect(result.detailed.lightMinutes).toBe(180);
    expect(result.detailed.remPercentOfSleep).toBeCloseTo(28.57, 1);
    expect(result.detailed.fragmentationPerHour).toBeGreaterThan(0);
  });

  it("marks latency and WASO as not derivable when there is no stage data", () => {
    const result = summarizeSleep([], 420);
    expect(result.detailed.hasStageData).toBe(false);
    expect(result.detailed.sleepLatencyMinutes).toBeNull();
    expect(result.detailed.wakeAfterSleepOnsetMinutes).toBeNull();
    expect(result.detailed.longestAwakeStretchMinutes).toBeNull();
    expect(result.detailed.remMinutes).toBeNull();
  });

  it("marks latency as not derivable when the session never records sleep", () => {
    const result = summarizeSleep([stage(1, 30), stage(7, 10)], 40);
    expect(result.detailed.hasStageData).toBe(true);
    expect(result.detailed.sleepLatencyMinutes).toBeNull();
    expect(result.detailed.wakeAfterSleepOnsetMinutes).toBeNull();
  });

  it("reports zero latency when the first recorded stage is already asleep", () => {
    const result = summarizeSleep([stage(4, 60)], 60);
    expect(result.detailed.sleepLatencyMinutes).toBe(0);
  });
});

function session(localStart: number, localEnd: number): SleepSession {
  return {
    id: 1, start: localStart, end: localEnd, localStart, localEnd, durationMinutes: (localEnd - localStart) / 60000,
    asleepMinutes: 0, awakeMinutes: 0, efficiency: 0, awakenings: 0, transitions: 0, title: "", source: "",
    stages: [], stageTotals: [],
    detailed: {
      hasStageData: false, sleepLatencyMinutes: null, wakeAfterSleepOnsetMinutes: null, longestAwakeStretchMinutes: null,
      fragmentationPerHour: null, remMinutes: null, remPercentOfSleep: null, deepMinutes: null, deepPercentOfSleep: null,
      lightMinutes: null, lightPercentOfSleep: null,
    },
    heartRate: [], minimum: null, average: null, maximum: null, hrv: null, restingHeartRate: null, respiratoryRate: null, skinTemperatureDelta: null,
  };
}

function atClock(day: number, hour: number, minute: number): number {
  return day * 86400000 + hour * 3600000 + minute * 60000;
}

describe("summarizeSleepSchedule", () => {
  it("returns null consistency values with fewer than two nights", () => {
    const result = summarizeSleepSchedule([session(atClock(0, 23, 0), atClock(1, 7, 0))]);
    expect(result.bedtimeConsistencyMinutes).toBeNull();
    expect(result.wakeConsistencyMinutes).toBeNull();
  });

  it("reports low variance for consistent bed and wake clock times", () => {
    const sessions = [
      session(atClock(0, 23, 0), atClock(1, 7, 0)),
      session(atClock(1, 23, 5), atClock(2, 7, 5)),
      session(atClock(2, 22, 55), atClock(3, 6, 55)),
    ];
    const result = summarizeSleepSchedule(sessions);
    expect(result.bedtimeConsistencyMinutes).not.toBeNull();
    expect(result.bedtimeConsistencyMinutes!).toBeLessThan(10);
    expect(result.wakeConsistencyMinutes!).toBeLessThan(10);
  });

  it("reports higher variance for irregular bedtimes", () => {
    const sessions = [
      session(atClock(0, 22, 0), atClock(1, 6, 0)),
      session(atClock(1, 1, 0), atClock(2, 9, 0)),
      session(atClock(2, 23, 30), atClock(3, 7, 30)),
    ];
    const result = summarizeSleepSchedule(sessions);
    expect(result.bedtimeConsistencyMinutes!).toBeGreaterThan(60);
  });
});
