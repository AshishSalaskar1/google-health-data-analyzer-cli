import { isAwakeStage, sleepStageName } from "./enums";
import type { SleepStage, SleepStageTotal } from "./models";

export interface SleepBreakdown {
  asleepMinutes: number;
  awakeMinutes: number;
  efficiency: number;
  awakenings: number;
  transitions: number;
  stageTotals: SleepStageTotal[];
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
  return {
    asleepMinutes,
    awakeMinutes,
    efficiency: durationMinutes ? asleepMinutes / durationMinutes * 100 : 0,
    awakenings: stages.filter((stage, index) => index > 0 && isAwakeStage(stage.type) && !isAwakeStage(stages[index - 1].type)).length,
    transitions: Math.max(0, stages.length - 1),
    stageTotals,
  };
}
