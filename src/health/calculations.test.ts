import { describe, expect, it } from "vitest";
import { summarizeSleep } from "./calculations";
import type { SleepStage } from "./models";

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
});
