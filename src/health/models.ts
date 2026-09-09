export type Units = "metric" | "imperial";

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

export interface ExerciseSession {
  id: number;
  start: number;
  end: number;
  durationMinutes: number;
  type: number;
  typeName: string;
  title: string;
  source: string;
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
  exercises: ExerciseSession[];
  weight: DataPoint[];
  sleep: DataPoint[];
  restingHeartRate: DataPoint[];
  hrv: DataPoint[];
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
