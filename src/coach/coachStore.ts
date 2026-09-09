import type { CoachMessage, CoachProfile, WeeklyPlan } from "./models";

const KEY = "health-coach-state-v1";
export const EMPTY_PROFILE: CoachProfile = { name: "", goals: "", preferences: "", constraints: "" };

export interface CoachState {
  consented: boolean;
  profile: CoachProfile;
  messages: CoachMessage[];
  weeklyPlan?: WeeklyPlan;
}

export function loadCoachState(): CoachState {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<CoachState> | null;
    if (parsed) return { consented: Boolean(parsed.consented), profile: { ...EMPTY_PROFILE, ...parsed.profile }, messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-30) : [], weeklyPlan: parsed.weeklyPlan };
  } catch { /* Ignore invalid local state. */ }
  return { consented: false, profile: EMPTY_PROFILE, messages: [] };
}

export function saveCoachState(state: CoachState): boolean {
  try {
    const messages = state.messages.slice(-30).map((message) => ({
      ...message,
      evidence: message.evidence?.map(({ data: _data, ...evidence }) => ({ ...evidence, data: null })),
    }));
    localStorage.setItem(KEY, JSON.stringify({ ...state, messages }));
    return true;
  } catch {
    return false;
  }
}

export function clearCoachState(): void {
  localStorage.removeItem(KEY);
}
