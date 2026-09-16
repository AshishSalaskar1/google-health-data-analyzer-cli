const EXERCISE_TYPES: Record<number, string> = {
  2: "Badminton", 4: "Baseball", 8: "Biking", 9: "Stationary biking",
  13: "Calisthenics", 16: "Cricket", 25: "Elliptical", 33: "Hiking",
  36: "Ice skating", 41: "Martial arts", 46: "Rowing", 47: "Rowing machine",
  53: "Walking", 54: "Water polo", 55: "Weightlifting", 56: "Wheelchair",
  58: "Other workout", 79: "Running",
};

const SLEEP_STAGES: Record<number, string> = {
  0: "Unknown",
  1: "Awake",
  2: "Sleeping",
  3: "Out of bed",
  4: "Light",
  5: "Deep",
  6: "REM",
  7: "Awake in bed",
};

// Single source of truth for stage-type groupings used across sleep calculations and the sleep UI.
export const SLEEP_STAGE_AWAKE_TYPES = [1, 3, 7];
export const SLEEP_STAGE_REM_TYPES = [6];
export const SLEEP_STAGE_DEEP_TYPES = [5];
export const SLEEP_STAGE_LIGHT_TYPES = [2, 4];

export function exerciseName(type: number): string {
  return EXERCISE_TYPES[type] ?? `Activity ${type}`;
}

export function sleepStageName(type: number): string {
  return SLEEP_STAGES[type] ?? `Stage ${type}`;
}

export function isAwakeStage(type: number): boolean {
  return (SLEEP_STAGE_AWAKE_TYPES as number[]).includes(type);
}
