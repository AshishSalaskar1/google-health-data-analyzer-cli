import { isAwakeStage, sleepStageName } from "./enums";
import type { SleepDetailedMetrics, SleepSession, SleepStage, SleepStageTotal } from "./models";

export interface SleepBreakdown {
  asleepMinutes: number;
  awakeMinutes: number;
  efficiency: number;
  awakenings: number;
  transitions: number;
  stageTotals: SleepStageTotal[];
  detailed: SleepDetailedMetrics;
}

const REM_TYPES = [6];
const DEEP_TYPES = [5];
const LIGHT_TYPES = [2, 4];

function minutesForTypes(stageTotals: SleepStageTotal[], types: number[]): number {
  return stageTotals.filter((stage) => types.includes(stage.type)).reduce((sum, stage) => sum + stage.minutes, 0);
}

export function summarizeSleep(stages: SleepStage[], durationMinutes: number): SleepBreakdown {
  const totalByType = new Map<number, number>();
  stages.forEach((stage) => totalByType.set(stage.type, (totalByType.get(stage.type) ?? 0) + stage.durationMinutes));
  const stageTotals = [...totalByType].map(([type, minutes]) => ({
    type,
    name: sleepStageName(type),
    minutes,
    percentage: durationMinutes ? minutes / durationMinutes * 100 : 0,
  })).sort((a, b) => a.type - b.type);
  const awakeMinutes = stages.filter((stage) => isAwakeStage(stage.type)).reduce((sum, stage) => sum + stage.durationMinutes, 0);
  const stagedMinutes = stages.reduce((sum, stage) => sum + stage.durationMinutes, 0);
  const asleepMinutes = stages.length ? Math.max(0, stagedMinutes - awakeMinutes) : durationMinutes;
  const awakenings = stages.filter((stage, index) => index > 0 && isAwakeStage(stage.type) && !isAwakeStage(stages[index - 1].type)).length;

  // Sleep onset/offset are the first/last recorded asleep stages; used to derive latency and
  // wake-after-sleep-onset only when the archive actually recorded a transition into sleep.
  const onsetIndex = stages.findIndex((stage) => !isAwakeStage(stage.type));
  let offsetIndex = -1;
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    if (!isAwakeStage(stages[index].type)) { offsetIndex = index; break; }
  }
  const hasStageData = stages.length > 0;
  const sleepLatencyMinutes = hasStageData && onsetIndex > 0
    ? stages.slice(0, onsetIndex).reduce((sum, stage) => sum + stage.durationMinutes, 0)
    : hasStageData && onsetIndex === 0 ? 0 : null;
  const wakeAfterSleepOnsetMinutes = hasStageData && onsetIndex >= 0 && offsetIndex >= onsetIndex
    ? stages.slice(onsetIndex, offsetIndex + 1).filter((stage) => isAwakeStage(stage.type)).reduce((sum, stage) => sum + stage.durationMinutes, 0)
    : null;
  const longestAwakeStretchMinutes = hasStageData
    ? stages.filter((stage) => isAwakeStage(stage.type)).reduce((max, stage) => Math.max(max, stage.durationMinutes), 0)
    : null;
  const fragmentationPerHour = hasStageData && asleepMinutes > 0 ? awakenings / (asleepMinutes / 60) : null;
  const remMinutes = hasStageData ? minutesForTypes(stageTotals, REM_TYPES) : null;
  const deepMinutes = hasStageData ? minutesForTypes(stageTotals, DEEP_TYPES) : null;
  const lightMinutes = hasStageData ? minutesForTypes(stageTotals, LIGHT_TYPES) : null;

  return {
    asleepMinutes,
    awakeMinutes,
    efficiency: durationMinutes ? asleepMinutes / durationMinutes * 100 : 0,
    awakenings,
    transitions: Math.max(0, stages.length - 1),
    stageTotals,
    detailed: {
      hasStageData,
      sleepLatencyMinutes,
      wakeAfterSleepOnsetMinutes,
      longestAwakeStretchMinutes,
      fragmentationPerHour,
      remMinutes,
      remPercentOfSleep: remMinutes !== null && asleepMinutes > 0 ? remMinutes / asleepMinutes * 100 : null,
      deepMinutes,
      deepPercentOfSleep: deepMinutes !== null && asleepMinutes > 0 ? deepMinutes / asleepMinutes * 100 : null,
      lightMinutes,
      lightPercentOfSleep: lightMinutes !== null && asleepMinutes > 0 ? lightMinutes / asleepMinutes * 100 : null,
    },
  };
}

// Reference point used to "unwrap" clock times so an overnight bedtime (e.g. 23:30) and an
// early bedtime (e.g. 00:30) land on a comparable, non-wrapping scale for variability math.
const SCHEDULE_REFERENCE_MINUTES = 12 * 60;

function shiftedTimeOfDay(localMs: number): number {
  const minutesOfDay = ((localMs / 60000) % 1440 + 1440) % 1440;
  return (minutesOfDay - SCHEDULE_REFERENCE_MINUTES + 1440) % 1440;
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export interface SleepScheduleConsistency {
  bedtimeConsistencyMinutes: number | null;
  wakeConsistencyMinutes: number | null;
}

/** Lower values mean more consistent bed/wake clock times across recorded nights. */
export function summarizeSleepSchedule(sessions: SleepSession[]): SleepScheduleConsistency {
  return {
    bedtimeConsistencyMinutes: standardDeviation(sessions.map((session) => shiftedTimeOfDay(session.localStart))),
    wakeConsistencyMinutes: standardDeviation(sessions.map((session) => shiftedTimeOfDay(session.localEnd))),
  };
}
