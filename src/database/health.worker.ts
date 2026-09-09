/// <reference lib="webworker" />
import type { Database, SqlJsStatic } from "sql.js";
import sqlJsSource from "sql.js/dist/sql-asm.js?raw";
import { summarizeSleep } from "../health/calculations";
import { exerciseName, sleepStageName } from "../health/enums";
import type {
  AnalyzeFilters,
  DataPoint,
  DatabaseInfo,
  DailyActivity,
  ExerciseSession,
  HealthReport,
  SleepSession,
  SleepStage,
  SourceInfo,
} from "../health/models";

type Request =
  | { id: number; type: "load"; payload: { bytes: ArrayBuffer; fileName: string } }
  | { id: number; type: "analyze"; payload: AnalyzeFilters };

type SqlValue = string | number | null;

let SQL: SqlJsStatic;
let db: Database | null = null;
let fileName = "";
let tables = new Set<string>();
let cachedDatabaseInfo: DatabaseInfo | null = null;
const reportCache = new Map<string, HealthReport>();

function rows<T extends object>(sql: string, params: SqlValue[] = []): T[] {
  if (!db) throw new Error("Import a database first.");
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const result: T[] = [];
    while (statement.step()) result.push(statement.getAsObject() as T);
    return result;
  } finally {
    statement.free();
  }
}

function scalar(sql: string, params: SqlValue[] = []): number {
  const result = rows<Record<string, number>>(sql, params)[0];
  return result ? Number(Object.values(result)[0] ?? 0) : 0;
}

function has(name: string): boolean {
  return tables.has(name);
}

function sourceWhere(alias: string, sourceId: number | null): { clause: string; params: number[] } {
  return sourceId === null ? { clause: "", params: [] } : { clause: ` AND ${alias}.app_info_id = ?`, params: [sourceId] };
}

function localMillis(alias: string, column: "start_time" | "end_time" | "time" = "start_time"): string {
  const offset = column === "end_time" ? "end_zone_offset" : "start_zone_offset";
  return column === "time" ? `${alias}.time` : `(${alias}.${column} + COALESCE(${alias}.${offset}, 0) * 1000)`;
}

function intervalWhere(alias: string, filters: AnalyzeFilters): { clause: string; params: SqlValue[] } {
  const source = sourceWhere(alias, filters.sourceId);
  return {
    clause: ` AND ${localMillis(alias, "start_time")} < (unixepoch(?) + 86400) * 1000 AND ${localMillis(alias, "end_time")} >= unixepoch(?) * 1000${source.clause}`,
    params: [filters.to, filters.from, ...source.params],
  };
}

function startWhere(alias: string, filters: AnalyzeFilters): { clause: string; params: SqlValue[] } {
  const source = sourceWhere(alias, filters.sourceId);
  return {
    clause: ` AND ${localMillis(alias)} < (unixepoch(?) + 86400) * 1000 AND ${localMillis(alias)} >= unixepoch(?) * 1000${source.clause}`,
    params: [filters.to, filters.from, ...source.params],
  };
}

function instantWhere(alias: string, filters: AnalyzeFilters, column = "time"): { clause: string; params: SqlValue[] } {
  const source = sourceWhere(alias, filters.sourceId);
  return {
    clause: ` AND ${alias}.${column} < (unixepoch(?) + 86400) * 1000 AND ${alias}.${column} >= unixepoch(?) * 1000${source.clause}`,
    params: [filters.to, filters.from, ...source.params],
  };
}

const RECORD_TABLES = [
  "steps_record_table", "distance_record_table", "total_calories_burned_record_table",
  "heart_rate_record_table", "exercise_session_record_table", "sleep_session_record_table",
  "weight_record_table", "resting_heart_rate_record_table", "heart_rate_variability_rmssd_record_table",
  "respiratory_rate_record_table", "oxygen_saturation_record_table", "blood_pressure_record_table",
  "hydration_record_table", "skin_temperature_record_table",
];

function discoverSources(): SourceInfo[] {
  if (!has("application_info_table")) return [];
  const available = RECORD_TABLES.filter(has);
  if (!available.length) return [];
  const countExpression = available.map((table) => `(SELECT COUNT(*) FROM ${table} r WHERE r.app_info_id = a.row_id)`).join(" + ");
  return rows<{ id: number; packageName: string; name: string; records: number }>(`
    SELECT a.row_id AS id, a.package_name AS packageName,
           COALESCE(NULLIF(a.app_name, ''), a.package_name, 'Unknown source') AS name,
           ${countExpression} AS records
    FROM application_info_table a
    WHERE (${countExpression}) > 0
    ORDER BY records DESC, name
  `).map((source) => ({ ...source, id: Number(source.id), records: Number(source.records) }));
}

function databaseInfo(): DatabaseInfo {
  if (cachedDatabaseInfo) return cachedDatabaseInfo;
  const ranges: string[] = [];
  for (const table of RECORD_TABLES.filter(has)) {
    const columns = table.includes("weight") || table.includes("resting_heart") || table.includes("variability") || table.includes("respiratory") || table.includes("oxygen") || table.includes("blood_pressure")
      ? { start: "time", end: "time", offset: "0" }
      : { start: "start_time", end: "end_time", offset: "COALESCE(start_zone_offset, 0) * 1000" };
    ranges.push(`SELECT ${columns.start} + ${columns.offset} AS first, ${columns.end} + ${columns.offset} AS last FROM ${table}`);
  }
  const dateRows = ranges.length ? rows<{ minDate: string; maxDate: string }>(`
    SELECT date(MIN(first) / 1000, 'unixepoch') AS minDate, date(MAX(last) / 1000, 'unixepoch') AS maxDate
    FROM (${ranges.join(" UNION ALL ")})
  `) : [];
  const fallback = new Date().toISOString().slice(0, 10);
  cachedDatabaseInfo = {
    fileName,
    schemaVersion: scalar("PRAGMA user_version"),
    minDate: dateRows[0]?.minDate || fallback,
    maxDate: dateRows[0]?.maxDate || fallback,
    sources: discoverSources(),
    availableTables: [...tables].sort(),
  };
  return cachedDatabaseInfo;
}

function pointMetric(table: string, valueColumn: string, filters: AnalyzeFilters): DataPoint[] {
  if (!has(table)) return [];
  const filter = instantWhere("m", filters);
  return rows<{ timestamp: number; value: number }>(`
    SELECT m.time AS timestamp, m.${valueColumn} AS value FROM ${table} m
    WHERE m.${valueColumn} IS NOT NULL ${filter.clause} ORDER BY m.time
  `, filter.params).map((row) => ({ timestamp: Number(row.timestamp), value: Number(row.value) }));
}

interface SessionHeartRate {
  points: DataPoint[];
  minimum: number | null;
  average: number | null;
  maximum: number | null;
}

function sessionHeartRates(sessionTable: string, filters: AnalyzeFilters, bucketMillis: number): Map<number, SessionHeartRate> {
  const result = new Map<number, SessionHeartRate>();
  if (!has("heart_rate_record_table") || !has("heart_rate_record_series_table")) return result;
  const filter = intervalWhere("s", filters);
  const raw = rows<{ sessionId: number; timestamp: number; value: number; secondary: number; minimum: number; maximum: number }>(`
    SELECT s.row_id AS sessionId, CAST(hs.epoch_millis / ? AS INTEGER) * ? AS timestamp,
           ROUND(AVG(hs.beats_per_minute), 1) AS value, COUNT(*) AS secondary,
           MIN(hs.beats_per_minute) AS minimum, MAX(hs.beats_per_minute) AS maximum
    FROM ${sessionTable} s
    JOIN heart_rate_record_table h ON h.start_time < s.end_time AND h.end_time >= s.start_time
    JOIN heart_rate_record_series_table hs ON hs.parent_key = h.row_id
      AND hs.epoch_millis BETWEEN s.start_time AND s.end_time
    WHERE 1=1 ${filter.clause}
    GROUP BY s.row_id, timestamp ORDER BY s.row_id, timestamp
  `, [bucketMillis, bucketMillis, ...filter.params]);
  const aggregates = new Map<number, { weighted: number; samples: number; minimum: number; maximum: number }>();
  for (const row of raw) {
    const sessionId = Number(row.sessionId);
    const session = result.get(sessionId) ?? { points: [], minimum: null, average: null, maximum: null };
    const point = { timestamp: Number(row.timestamp), value: Number(row.value), secondary: Number(row.secondary) };
    session.points.push(point);
    result.set(sessionId, session);
    const aggregate = aggregates.get(sessionId) ?? { weighted: 0, samples: 0, minimum: Infinity, maximum: -Infinity };
    aggregate.weighted += point.value * point.secondary;
    aggregate.samples += point.secondary;
    aggregate.minimum = Math.min(aggregate.minimum, Number(row.minimum));
    aggregate.maximum = Math.max(aggregate.maximum, Number(row.maximum));
    aggregates.set(sessionId, aggregate);
  }
  for (const [sessionId, aggregate] of aggregates) {
    const session = result.get(sessionId)!;
    session.minimum = aggregate.minimum;
    session.average = aggregate.samples ? aggregate.weighted / aggregate.samples : null;
    session.maximum = aggregate.maximum;
  }
  return result;
}

function exerciseChildCounts(table: string, filters: AnalyzeFilters): Map<number, number> {
  if (!has(table)) return new Map();
  const filter = intervalWhere("e", filters);
  return new Map(rows<{ sessionId: number; value: number }>(`
    SELECT e.row_id AS sessionId, COUNT(c.parent_key) AS value
    FROM exercise_session_record_table e
    LEFT JOIN ${table} c ON c.parent_key = e.row_id
    WHERE 1=1 ${filter.clause}
    GROUP BY e.row_id
  `, filter.params).map((row) => [Number(row.sessionId), Number(row.value)]));
}

function exerciseOverlapEstimates(table: string, valueColumn: string, filters: AnalyzeFilters): Map<number, number> {
  if (!has(table)) return new Map();
  const filter = intervalWhere("e", filters);
  return new Map(rows<{ sessionId: number; value: number }>(`
    SELECT e.row_id AS sessionId, COALESCE(SUM(r.${valueColumn} *
      (MIN(r.end_time, e.end_time) - MAX(r.start_time, e.start_time)) /
      NULLIF(r.end_time - r.start_time, 0)), 0) AS value
    FROM exercise_session_record_table e
    LEFT JOIN ${table} r ON r.start_time < e.end_time AND r.end_time > e.start_time
    WHERE 1=1 ${filter.clause}
    GROUP BY e.row_id
  `, filter.params).map((row) => [Number(row.sessionId), Number(row.value)]));
}

function analyzeExercises(filters: AnalyzeFilters): ExerciseSession[] {
  if (!has("exercise_session_record_table")) return [];
  const filter = intervalWhere("e", filters);
  const sessions = rows<{
    id: number; start: number; end: number; startOffset: number; endOffset: number; type: number;
    title: string; notes: string; source: string; recordingMethod: number; rpe: number; hasRoute: number;
  }>(`
    SELECT e.row_id AS id, e.start_time AS start, e.end_time AS end,
           COALESCE(e.start_zone_offset, 0) AS startOffset, COALESCE(e.end_zone_offset, 0) AS endOffset,
           e.exercise_type AS type, COALESCE(e.title, '') AS title, COALESCE(e.notes, '') AS notes,
           COALESCE(NULLIF(a.app_name, ''), a.package_name, 'Unknown source') AS source,
           COALESCE(e.recording_method, 0) AS recordingMethod,
           e.session_rate_of_perceived_exertion AS rpe, COALESCE(e.has_route, 0) AS hasRoute
    FROM exercise_session_record_table e
    LEFT JOIN application_info_table a ON a.row_id = e.app_info_id
    WHERE 1=1 ${filter.clause} ORDER BY e.start_time DESC
  `, filter.params);

  const heartBySession = sessionHeartRates("exercise_session_record_table", filters, 10000);
  const lapCounts = exerciseChildCounts("exercise_laps_table", filters);
  const segmentCounts = exerciseChildCounts("exercise_segments_table", filters);
  const routeCounts = exerciseChildCounts("exercise_route_table", filters);
  const stepEstimates = exerciseOverlapEstimates("steps_record_table", "count", filters);
  const distanceEstimates = exerciseOverlapEstimates("distance_record_table", "distance", filters);
  const energyEstimates = exerciseOverlapEstimates("total_calories_burned_record_table", "energy", filters);
  return sessions.map((row) => {
    const start = Number(row.start);
    const end = Number(row.end);
    const heart = heartBySession.get(Number(row.id)) ?? { points: [], minimum: null, average: null, maximum: null };
    const rpe = Number(row.rpe);
    return {
      id: Number(row.id), start, end,
      localStart: start + Number(row.startOffset) * 1000,
      localEnd: end + Number(row.endOffset) * 1000,
      durationMinutes: Math.max(0, (end - start) / 60000),
      type: Number(row.type), typeName: exerciseName(Number(row.type)), title: row.title, notes: row.notes,
      source: row.source, recordingMethod: Number(row.recordingMethod),
      perceivedExertion: Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : null,
      hasRoute: Boolean(row.hasRoute),
      lapCount: lapCounts.get(Number(row.id)) ?? 0,
      segmentCount: segmentCounts.get(Number(row.id)) ?? 0,
      routePointCount: routeCounts.get(Number(row.id)) ?? 0,
      estimatedSteps: stepEstimates.get(Number(row.id)) ?? 0,
      estimatedDistanceMeters: distanceEstimates.get(Number(row.id)) ?? 0,
      estimatedEnergyJoules: energyEstimates.get(Number(row.id)) ?? 0,
      heartRate: heart.points, minimum: heart.minimum, average: heart.average, maximum: heart.maximum,
    };
  });
}

function instantAverage(table: string, column: string, start: number, end: number): number | null {
  if (!has(table)) return null;
  const value = rows<{ value: number | null }>(`SELECT AVG(${column}) AS value FROM ${table} WHERE time BETWEEN ? AND ?`, [start, end])[0]?.value;
  return value == null ? null : Number(value);
}

function analyzeSleep(filters: AnalyzeFilters): SleepSession[] {
  if (!has("sleep_session_record_table")) return [];
  const filter = intervalWhere("s", filters);
  const sessions = rows<{
    id: number; start: number; end: number; startOffset: number; endOffset: number; title: string; source: string;
  }>(`
    SELECT s.row_id AS id, s.start_time AS start, s.end_time AS end,
           COALESCE(s.start_zone_offset, 0) AS startOffset, COALESCE(s.end_zone_offset, 0) AS endOffset,
           COALESCE(NULLIF(s.title, ''), 'Sleep session') AS title,
           COALESCE(NULLIF(a.app_name, ''), a.package_name, 'Unknown source') AS source
    FROM sleep_session_record_table s
    LEFT JOIN application_info_table a ON a.row_id = s.app_info_id
    WHERE 1=1 ${filter.clause} ORDER BY s.start_time DESC
  `, filter.params);

  const detailed = filters.from === filters.to;
  const heartBySession = detailed ? sessionHeartRates("sleep_session_record_table", filters, 60000) : new Map<number, SessionHeartRate>();
  const allStageRows = has("sleep_stages_table") ? rows<{ sessionId: number; start: number; end: number; type: number }>(`
    SELECT st.parent_key AS sessionId, st.stage_start_time AS start, st.stage_end_time AS end, st.stage_type AS type
    FROM sleep_stages_table st
    JOIN sleep_session_record_table s ON s.row_id = st.parent_key
    WHERE 1=1 ${filter.clause} ORDER BY st.parent_key, st.stage_start_time
  `, filter.params) : [];
  const stagesBySession = new Map<number, Array<{ start: number; end: number; type: number }>>();
  for (const stage of allStageRows) {
    const sessionId = Number(stage.sessionId);
    const grouped = stagesBySession.get(sessionId) ?? [];
    grouped.push(stage);
    stagesBySession.set(sessionId, grouped);
  }

  return sessions.map((row) => {
    const start = Number(row.start);
    const end = Number(row.end);
    const startOffset = Number(row.startOffset);
    const stageRows = stagesBySession.get(Number(row.id)) ?? [];
    const stages: SleepStage[] = stageRows.map((stage) => ({
      start: Number(stage.start), end: Number(stage.end),
      localStart: Number(stage.start) + startOffset * 1000, localEnd: Number(stage.end) + startOffset * 1000,
      type: Number(stage.type), name: sleepStageName(Number(stage.type)),
      durationMinutes: Math.max(0, (Number(stage.end) - Number(stage.start)) / 60000),
    }));
    const durationMinutes = Math.max(0, (end - start) / 60000);
    const breakdown = summarizeSleep(stages, durationMinutes);
    const heart = heartBySession.get(Number(row.id)) ?? { points: [], minimum: null, average: null, maximum: null };
    const skinTemperatureDelta = has("skin_temperature_record_table") && has("skin_temperature_delta_table")
      ? rows<{ value: number | null }>(`
          SELECT AVG(d.delta) AS value FROM skin_temperature_delta_table d
          JOIN skin_temperature_record_table s ON s.row_id = d.parent_key
          WHERE s.start_time < ? AND s.end_time > ?
        `, [end, start])[0]?.value ?? null
      : null;
    return {
      id: Number(row.id), start, end, localStart: start + startOffset * 1000,
      localEnd: end + Number(row.endOffset) * 1000, durationMinutes,
      asleepMinutes: breakdown.asleepMinutes, awakeMinutes: breakdown.awakeMinutes,
      efficiency: breakdown.efficiency, awakenings: breakdown.awakenings,
      transitions: breakdown.transitions, title: row.title, source: row.source, stages, stageTotals: breakdown.stageTotals,
      heartRate: heart.points, minimum: heart.minimum, average: heart.average, maximum: heart.maximum,
      hrv: instantAverage("heart_rate_variability_rmssd_record_table", "heart_rate_variability_millis", start, end),
      restingHeartRate: instantAverage("resting_heart_rate_record_table", "beats_per_minute", start, end),
      respiratoryRate: instantAverage("respiratory_rate_record_table", "rate", start, end),
      skinTemperatureDelta: skinTemperatureDelta == null ? null : Number(skinTemperatureDelta),
    };
  });
}

function analyze(filters: AnalyzeFilters): HealthReport {
  if (!db) throw new Error("Import a database first.");
  if (!filters.from || !filters.to || filters.from > filters.to) throw new Error("Choose a valid date range.");
  const cacheKey = `${filters.from}|${filters.to}|${filters.sourceId ?? "all"}`;
  const cached = reportCache.get(cacheKey);
  if (cached) return cached;
  const info = databaseInfo();
  const warnings: string[] = [];
  const selectedDays = Math.max(1, Math.round((Date.parse(filters.to) - Date.parse(filters.from)) / 86400000) + 1);
  const heartBucketMillis = selectedDays <= 1 ? 60000 : selectedDays <= 14 ? 900000 : 3600000;

  const stepFilter = startWhere("s", filters);
  const stepRows = has("steps_record_table") ? rows<{ date: string; steps: number }>(`
    SELECT date(${localMillis("s")} / 1000, 'unixepoch') AS date, SUM(s.count) AS steps
    FROM steps_record_table s WHERE 1=1 ${stepFilter.clause} GROUP BY date ORDER BY date
  `, stepFilter.params) : [];
  const distanceFilter = startWhere("d", filters);
  const distances = has("distance_record_table") ? rows<{ date: string; value: number }>(`
    SELECT date(${localMillis("d")} / 1000, 'unixepoch') AS date, SUM(d.distance) AS value
    FROM distance_record_table d WHERE 1=1 ${distanceFilter.clause} GROUP BY date
  `, distanceFilter.params) : [];
  const calorieFilter = startWhere("c", filters);
  const calories = has("total_calories_burned_record_table") ? rows<{ date: string; value: number }>(`
    SELECT date(${localMillis("c")} / 1000, 'unixepoch') AS date, SUM(c.energy) AS value
    FROM total_calories_burned_record_table c WHERE 1=1 ${calorieFilter.clause} GROUP BY date
  `, calorieFilter.params) : [];
  const activityDates = new Set([...stepRows.map((row) => row.date), ...distances.map((row) => row.date), ...calories.map((row) => row.date)]);
  const stepMap = new Map(stepRows.map((row) => [row.date, Number(row.steps)]));
  const distanceMap = new Map(distances.map((row) => [row.date, Number(row.value)]));
  const calorieMap = new Map(calories.map((row) => [row.date, Number(row.value)]));
  const activity: DailyActivity[] = [...activityDates].sort().map((date) => ({
    date, steps: stepMap.get(date) ?? 0, distanceMeters: distanceMap.get(date) ?? 0, energyJoules: calorieMap.get(date) ?? 0,
  }));

  const hourlySteps = has("steps_record_table") ? rows<{ timestamp: number; value: number }>(`
    SELECT CAST(${localMillis("s")} / 3600000 AS INTEGER) * 3600000 AS timestamp, SUM(s.count) AS value
    FROM steps_record_table s WHERE 1=1 ${stepFilter.clause} GROUP BY timestamp ORDER BY timestamp
  `, stepFilter.params).map((row) => ({ timestamp: Number(row.timestamp), value: Number(row.value) })) : [];

  const heartFilter = intervalWhere("h", filters);
  const heartBuckets = has("heart_rate_record_table") && has("heart_rate_record_series_table") ? rows<{ timestamp: number; value: number; secondary: number; minimum: number; maximum: number }>(`
    SELECT CAST(hs.epoch_millis / ? AS INTEGER) * ? AS timestamp,
           ROUND(AVG(hs.beats_per_minute), 1) AS value, COUNT(*) AS secondary,
           MIN(hs.beats_per_minute) AS minimum, MAX(hs.beats_per_minute) AS maximum
    FROM heart_rate_record_series_table hs JOIN heart_rate_record_table h ON h.row_id = hs.parent_key
    WHERE 1=1 ${heartFilter.clause} GROUP BY timestamp ORDER BY timestamp
  `, [heartBucketMillis, heartBucketMillis, ...heartFilter.params]) : [];
  const heartRate = heartBuckets.map((row) => ({ timestamp: Number(row.timestamp), value: Number(row.value), secondary: Number(row.secondary) }));
  const heartSamples = heartBuckets.reduce((sum, row) => sum + Number(row.secondary), 0);
  const heartStats = heartBuckets.length ? {
    minimum: Math.min(...heartBuckets.map((row) => Number(row.minimum))),
    average: heartSamples ? heartBuckets.reduce((sum, row) => sum + Number(row.value) * Number(row.secondary), 0) / heartSamples : 0,
    maximum: Math.max(...heartBuckets.map((row) => Number(row.maximum))),
  } : undefined;

  const exercises = analyzeExercises(filters);
  const sleep = analyzeSleep(filters);
  const weight = pointMetric("weight_record_table", "weight", filters);
  const restingHeartRate = pointMetric("resting_heart_rate_record_table", "beats_per_minute", filters);
  const hrv = pointMetric("heart_rate_variability_rmssd_record_table", "heart_rate_variability_millis", filters);
  const respiratoryRate = pointMetric("respiratory_rate_record_table", "rate", filters);
  const oxygen = pointMetric("oxygen_saturation_record_table", "percentage", filters);
  const pressureFilter = instantWhere("b", filters);
  const bloodPressure = has("blood_pressure_record_table") ? rows<{ timestamp: number; value: number; secondary: number }>(`
    SELECT b.time AS timestamp, b.systolic AS value, b.diastolic AS secondary
    FROM blood_pressure_record_table b WHERE 1=1 ${pressureFilter.clause} ORDER BY b.time
  `, pressureFilter.params).map((row) => ({ timestamp: Number(row.timestamp), value: Number(row.value), secondary: Number(row.secondary) })) : [];
  const hydrationFilter = intervalWhere("h", filters);
  const hydration = has("hydration_record_table") ? rows<{ timestamp: number; value: number }>(`
    SELECT h.start_time AS timestamp, h.volume AS value FROM hydration_record_table h
    WHERE 1=1 ${hydrationFilter.clause} ORDER BY h.start_time
  `, hydrationFilter.params).map((row) => ({ timestamp: Number(row.timestamp), value: Number(row.value) })) : [];
  const skinTemperature = has("skin_temperature_record_table") && has("skin_temperature_delta_table") ? rows<{ timestamp: number; value: number }>(`
    SELECT d.epoch_millis AS timestamp, d.delta AS value FROM skin_temperature_delta_table d
    JOIN skin_temperature_record_table s ON s.row_id = d.parent_key
    WHERE 1=1 ${intervalWhere("s", filters).clause} ORDER BY d.epoch_millis
  `, intervalWhere("s", filters).params).map((row) => ({ timestamp: Number(row.timestamp), value: Number(row.value) })) : [];

  const sourceCount = filters.sourceId === null ? info.sources.length : 1;
  if (sourceCount > 1) warnings.push("Multiple applications contribute records. Additive totals can include overlapping intervals.");
  if (!sleep.length) warnings.push("No sleep sessions are available for the selected period.");
  if (exercises.some((session) => session.estimatedSteps || session.estimatedDistanceMeters)) warnings.push("Workout steps, distance, and energy are estimates based on overlapping record times, not direct session links.");
  if (!weight.length) warnings.push("Weight is sparse or unavailable for the selected period.");

  const totalSteps = activity.reduce((sum, day) => sum + day.steps, 0);
  const exerciseMinutes = exercises.reduce((sum, session) => sum + session.durationMinutes, 0);
  const averageSleepMinutes = sleep.length ? sleep.reduce((sum, session) => sum + session.durationMinutes, 0) / sleep.length : null;
  const averageAsleepMinutes = sleep.length ? sleep.reduce((sum, session) => sum + session.asleepMinutes, 0) / sleep.length : null;
  const averageSleepEfficiency = sleep.length ? sleep.reduce((sum, session) => sum + session.efficiency, 0) / sleep.length : null;

  const report: HealthReport = {
    fileName, schemaVersion: info.schemaVersion, generatedAt: Date.now(),
    range: { min: info.minDate, max: info.maxDate, selectedFrom: filters.from, selectedTo: filters.to },
    summary: {
      totalSteps, averageDailySteps: activity.length ? totalSteps / activity.length : 0, trackedDays: activity.length,
      totalDistanceMeters: activity.reduce((sum, day) => sum + day.distanceMeters, 0),
      totalEnergyJoules: activity.reduce((sum, day) => sum + day.energyJoules, 0),
      exerciseCount: exercises.length, exerciseMinutes,
      heartRateMin: heartStats?.minimum == null ? null : Number(heartStats.minimum),
      heartRateAverage: heartStats?.average == null ? null : Number(heartStats.average),
      heartRateMax: heartStats?.maximum == null ? null : Number(heartStats.maximum),
      latestWeightGrams: weight.at(-1)?.value ?? null,
      averageSleepMinutes, averageAsleepMinutes, averageSleepEfficiency,
    },
    activity, hourlySteps, heartRate, heartRateBucketMinutes: heartBucketMillis / 60000,
    exercises, weight, sleep, restingHeartRate, hrv, respiratoryRate,
    skinTemperature, oxygen, bloodPressure, hydration, sources: info.sources,
    availableTables: info.availableTables, warnings,
  };
  reportCache.set(cacheKey, report);
  if (reportCache.size > 8) reportCache.delete(reportCache.keys().next().value!);
  return report;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    if (!SQL) {
      const createSqlJs = new Function(`${sqlJsSource}; return initSqlJs;`)() as () => Promise<SqlJsStatic>;
      SQL = await createSqlJs();
    }
    if (request.type === "load") {
      const bytes = new Uint8Array(request.payload.bytes);
      if (String.fromCharCode(...bytes.slice(0, 15)) !== "SQLite format 3") throw new Error("This file is not a SQLite database.");
      db?.close();
      db = new SQL.Database(bytes);
      fileName = request.payload.fileName;
      cachedDatabaseInfo = null;
      reportCache.clear();
      tables = new Set(rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name));
      if (!has("application_info_table") || !RECORD_TABLES.some(has)) {
        throw new Error("This is not a supported Health Connect export.");
      }
      const intervalTables = RECORD_TABLES.filter((table) => has(table) && !table.includes("weight") && !table.includes("resting_heart") && !table.includes("variability") && !table.includes("respiratory") && !table.includes("oxygen") && !table.includes("blood_pressure"));
      for (const table of intervalTables) {
        db.run(`CREATE INDEX IF NOT EXISTS analyzer_${table}_start_end ON ${table}(start_time, end_time)`);
      }
      if (has("heart_rate_record_series_table")) db.run("CREATE INDEX IF NOT EXISTS analyzer_heart_samples_time ON heart_rate_record_series_table(epoch_millis)");
      self.postMessage({ id: request.id, ok: true, data: databaseInfo() });
    } else {
      self.postMessage({ id: request.id, ok: true, data: analyze(request.payload) });
    }
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
