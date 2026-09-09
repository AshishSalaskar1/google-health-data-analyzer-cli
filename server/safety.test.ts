import { describe, expect, it } from "vitest";
import { emergencyResponse } from "./safety.ts";

describe("emergency routing", () => {
  it("routes acute symptoms away from coaching", () => expect(emergencyResponse("I have chest pain and can't breathe")).toContain("emergency"));
  it("allows ordinary wellness questions", () => expect(emergencyResponse("How was my sleep?")) .toBeNull());
});
