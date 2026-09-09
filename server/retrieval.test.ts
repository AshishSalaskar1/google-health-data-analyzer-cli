import { describe, expect, it } from "vitest";
import { retrieveGuidance } from "./retrieval.ts";

describe("local guidance retrieval", () => {
  it("ranks sleep guidance for a sleep query", () => {
    const results = retrieveGuidance("How can I improve sleep consistency?");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title.toLowerCase()).toContain("sleep");
    expect(results[0].id).toBe("G1");
  });
});
