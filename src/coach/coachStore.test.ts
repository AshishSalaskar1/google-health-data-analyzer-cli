import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PROFILE, loadCoachState, saveCoachState } from "./coachStore";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
});

describe("coach persistence", () => {
  it("omits large evidence data while keeping its citation metadata", () => {
    expect(saveCoachState({ consented: true, profile: EMPTY_PROFILE, messages: [{ id: "1", role: "assistant", content: "Answer", createdAt: 1, evidence: [{ id: "H1", title: "Sleep", kind: "health", source: "Archive", data: { trace: Array(1000).fill(1) } }] }] })).toBe(true);
    const evidence = loadCoachState().messages[0].evidence?.[0];
    expect(evidence?.data).toBeNull();
    expect(evidence?.title).toBe("Sleep");
  });

  it("does not throw when browser storage rejects the write", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, removeItem: () => undefined, setItem: () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); } });
    expect(saveCoachState({ consented: true, profile: EMPTY_PROFILE, messages: [] })).toBe(false);
  });
});
