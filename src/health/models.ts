export type Units = "metric" | "imperial";
export type Theme = "light" | "dark";

export interface SourceInfo {
  id: number;
  packageName: string;
  name: string;
  records: number;
}

export interface DataPoint {
  timestamp: number;
  value: number;
  secondary?: number;
  label?: string;
}

export interface DailyActivity {
  date: string;
  steps: number;
  distanceMeters: number;
  energyJoules: number;
}

export interface HeartRateSummary {
  minimum: number | null;
  average: number | null;
  maximum: number | null;
}

export interface ExerciseSession extends HeartRateSummary {
  id: number;
  start: number;
  end: number;
  localStart: number;
  localEnd: number;
  durationMinutes: number;
  type: number;
  typeName: string;
  title: string;
  notes: string;
  source: string;
  recordingMethod: number;
  perceivedExertion: number | null;
  hasRoute: boolean;
  lapCount: number;
  segmentCount: number;
  routePointCount: number;
  estimatedSteps: number;
  estimatedDistanceMeters: number;
  estimatedEnergyJoules: number;
  heartRate: DataPoint[];
}

export interface SleepStage {
  start: number;
  end: number;
  localStart: number;
  localEnd: number;
  type: number;
  name: string;
  durationMinutes: number;
}

export interface SleepStageTotal {
  type: number;
  name: string;
  minutes: number;
  percentage: number;
}

export interface SleepSession extends HeartRateSummary {
  id: number;
  start: number;
  end: number;
  localStart: number;
  localEnd: number;
  durationMinutes: number;
  asleepMinutes: number;
  awakeMinutes: number;
  efficiency: number;
  awakenings: number;
  transitions: number;
  title: string;
  source: string;
  stages: SleepStage[];
  stageTotals: SleepStageTotal[];
  heartRate: DataPoint[];
  hrv: number | null;
  restingHeartRate: number | null;
  respiratoryRate: number | null;
  skinTemperatureDelta: number | null;
}

export interface Summary {
  totalSteps: number;
  averageDailySteps: number;
  trackedDays: number;
  totalDistanceMeters: number;
  totalEnergyJoules: number;
  exerciseCount: number;
  exerciseMinutes: number;
  heartRateMin: number | null;
  heartRateAverage: number | null;
  heartRateMax: number | null;
  latestWeightGrams: number | null;
  averageSleepMinutes: number | null;
  averageAsleepMinutes: number | null;
  averageSleepEfficiency: number | null;
}

export interface HealthReport {
  fileName: string;
  schemaVersion: number;
  generatedAt: number;
  range: { min: string; max: string; selectedFrom: string; selectedTo: string };
  summary: Summary;
  activity: DailyActivity[];
  hourlySteps: DataPoint[];
  heartRate: DataPoint[];
  heartRateBucketMinutes: number;
  exercises: ExerciseSession[];
  weight: DataPoint[];
  sleep: SleepSession[];
  restingHeartRate: DataPoint[];
  hrv: DataPoint[];
  respiratoryRate: DataPoint[];
  skinTemperature: DataPoint[];
  oxygen: DataPoint[];
  bloodPressure: DataPoint[];
  hydration: DataPoint[];
  sources: SourceInfo[];
  availableTables: string[];
  warnings: string[];
}

export interface AnalyzeFilters {
  from: string;
  to: string;
  sourceId: number | null;
}

export interface DatabaseInfo {
  fileName: string;
  schemaVersion: number;
  minDate: string;
  maxDate: string;
  sources: SourceInfo[];
  availableTables: string[];
}
