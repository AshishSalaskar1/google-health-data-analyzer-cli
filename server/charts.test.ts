import { describe, expect, it } from "vitest";
import { buildGroundedChart } from "./charts.ts";
import type { CoachEvidence } from "../src/coach/models.ts";

const evidence: CoachEvidence[] = [{
  id: "H1", title: "Sleep data", kind: "health", source: "Archive", period: "2026-09-01 to 2026-09-05", data: {
    sessions: [
      { end: Date.UTC(2026, 8, 2), asleepMinutes: 360, efficiency: 92 },
      { end: Date.UTC(2026, 8, 3), asleepMinutes: 420, efficiency: 95 },
    ],
  },
}];

describe("grounded coach charts", () => {
  it("builds sleep duration points from evidence", () => {
    const chart = buildGroundedChart({ show: true, evidenceId: "H1", metric: "sleep_duration", type: "bar", title: "Sleep last week" }, evidence);
    expect(chart?.points).toEqual([
      { label: "2026-09-02", values: { asleep: 6 } },
      { label: "2026-09-03", values: { asleep: 7 } },
    ]);
  });

  it("omits charts unless requested and grounded", () => {
    expect(buildGroundedChart(undefined, evidence)).toBeUndefined();
    expect(buildGroundedChart({ show: true, evidenceId: "H9", metric: "sleep_duration" }, evidence)).toBeUndefined();
  });
});
