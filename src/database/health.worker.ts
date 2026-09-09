/// <reference lib="webworker" />
import type { Database, SqlJsStatic } from "sql.js";
import sqlJsSource from "sql.js/dist/sql-asm.js?raw";
import { exerciseName } from "../health/enums";
import type {
  AnalyzeFilters,
  DataPoint,
  DatabaseInfo,
  DailyActivity,
  ExerciseSession,
  HealthReport,
  SourceInfo,
} from "../health/models";

type Request =
  | { id: number; type: "load"; payload: { bytes: ArrayBuffer; fileName: string } }
  | { id: number; type: "analyze"; payload: AnalyzeFilters };

let SQL: SqlJsStatic;
let db: Database | null = null;
let fileName = "";
let tables = new Set<string>();

function rows<T extends object>(sql: string, params: Array<string | number | null> = []): T[] {
  if (!db) throw new Error("Import a database first.");
  const statement = db.prepare(sql);
  statement.bind(params);
  const result: T[] = [];
  while (statement.step()) result.push(statement.getAsObject() as T);
  statement.free();
  return result;
}

function scalar(sql: string, params: Array<string | number | null> = []): number {
  const result = rows<Record<string, number>>(sql, params)[0];
  return result ? Number(Object.values(result)[0] ?? 0) : 0;
}

function has(name: string): boolean {
  return tables.has(name);
}

function sourceWhere(alias: string, sourceId: number | null): { clause: string; params: number[] } {
  return sourceId === null ? { clause: "", params: [] } : { clause: ` AND ${alias}.app_info_id = ?`, params: [sourceId] };
}

function intervalWhere(alias: string, filters: AnalyzeFilters): { clause: string; params: Array<string | number> } {
  const source = sourceWhere(alias, filters.sourceId);
  return {
    clause: ` AND ${alias}.start_time < (unixepoch(?) + 86400) * 1000 AND ${alias}.end_time >= unixepoch(?) * 1000${source.clause}`,
    params: [filters.to, filters.from, ...source.params],
  };
}

function startWhere(alias: string, filters: AnalyzeFilters): { clause: string; params: Array<string | number> } {
  const source = sourceWhere(alias, filters.sourceId);
  return {
    clause: ` AND ${alias}.start_time < (unixepoch(?) + 86400) * 1000 AND ${alias}.start_time >= unixepoch(?) * 1000${source.clause}`,
    params: [filters.to, filters.from, ...source.params],
  };
}

function instantWhere(alias: string, filters: AnalyzeFilters, column = "time"): { clause: string; params: Array<string | number> } {
  const source = sourceWhere(alias, filters.sourceId);
  return {
    clause: ` AND ${alias}.${column} < (unixepoch(?) + 86400) * 1000 AND ${alias}.${column} >= unixepoch(?) * 1000${source.clause}`,
    params: [filters.to, filters.from, ...source.params],
  };
}

function discoverSources(): SourceInfo[] {
  if (!has("application_info_table")) return [];
  return rows<{ id: number; packageName: string; name: string; records: number }>(`
    SELECT a.row_id AS id, a.package_name AS packageName,
           COALESCE(NULLIF(a.app_name, ''), a.package_name) AS name,
           (SELECT COUNT(*) FROM steps_record_table s WHERE s.app_info_id = a.row_id) AS records
    FROM application_info_table a
    WHERE EXISTS (SELECT 1 FROM steps_record_table s WHERE s.app_info_id = a.row_id)
       OR EXISTS (SELECT 1 FROM heart_rate_record_table h WHERE h.app_info_id = a.row_id)
       OR EXISTS (SELECT 1 FROM exercise_session_record_table e WHERE e.app_info_id = a.row_id)
    ORDER BY records DESC, name
  `).map((source) => ({ ...source, id: Number(source.id), records: Number(source.records) }));
}

function databaseInfo(): DatabaseInfo {
  const schemaVersion = scalar("PRAGMA user_version");
  const dateRows = has("steps_record_table")
    ? rows<{ minDate: string; maxDate: string }>(`
        SELECT date(MIN(start_time) / 1000, 'unixepoch') AS minDate,
               date(MAX(end_time) / 1000, 'unixepoch') AS maxDate
        FROM steps_record_table
      `)
    : [];
  const fallback = new Date().toISOString().slice(0, 10);
  return {
    fileName,
    schemaVersion,
    minDate: dateRows[0]?.minDate || fallback,
    maxDate: dateRows[0]?.maxDate || fallback,
    sources: discoverSources(),
    availableTables: [...tables].sort(),
  };
}

function analyze(filters: AnalyzeFilters): HealthReport {
  if (!db) throw new Error("Import a database first.");
  const info = databaseInfo();
  const warnings: string[] = [];

  const stepFilter = startWhere("s", filters);
  const stepRows = has("steps_record_table")
    ? rows<{ date: string; steps: number }>(`
        SELECT date(s.start_time / 1000, 'unixepoch') AS date, SUM(s.count) AS steps
        FROM steps_record_table s WHERE 1=1 ${stepFilter.clause}
        GROUP BY date ORDER BY date
      `, stepFilter.params)
    : [];

  const distanceFilter = startWhere("d", filters);
  const distances = has("distance_record_table")
    ? rows<{ date: string; value: number }>(`
        SELECT date(d.start_time / 1000, 'unixepoch') AS date, SUM(d.distance) AS value
        FROM distance_record_table d WHERE 1=1 ${distanceFilter.clause}
        GROUP BY date
      `, distanceFilter.params)
    : [];

  const calorieFilter = startWhere("c", filters);
  const calories = has("total_calories_burned_record_table")
    ? rows<{ date: string; value: number }>(`
        SELECT date(c.start_time / 1000, 'unixepoch') AS date, SUM(c.energy) AS value
        FROM total_calories_burned_record_table c WHERE 1=1 ${calorieFilter.clause}
        GROUP BY date
      `, calorieFilter.params)
    : [];

  const activityDates = new Set([...stepRows.map((r) => r.date), ...distances.map((r) => r.date), ...calories.map((r) => r.date)]);
  const distanceMap = new Map(distances.map((r) => [r.date, Number(r.value)]));
  const calorieMap = new Map(calories.map((r) => [r.date, Number(r.value)]));
  const stepMap = new Map(stepRows.map((r) => [r.date, Number(r.steps)]));
  const activity: DailyActivity[] = [...activityDates].sort().map((date) => ({
    date,
    steps: stepMap.get(date) ?? 0,
    distanceMeters: distanceMap.get(date) ?? 0,
    energyJoules: calorieMap.get(date) ?? 0,
  }));

  const hourlySteps = has("steps_record_table")
    ? rows<{ timestamp: number; value: number }>(`
        SELECT CAST(strftime('%s', datetime(s.start_time / 1000, 'unixepoch', 'start of hour')) AS INTEGER) * 1000 AS timestamp,
               SUM(s.count) AS value
        FROM steps_record_table s WHERE 1=1 ${stepFilter.clause}
        GROUP BY timestamp ORDER BY timestamp
      `, stepFilter.params).map((r) => ({ timestamp: Number(r.timestamp), value: Number(r.value) }))
    : [];

  const heartFilter = intervalWhere("h", filters);
  const heartRate = has("heart_rate_record_table") && has("heart_rate_record_series_table")
    ? rows<{ timestamp: number; value: number; secondary: number }>(`
        SELECT CAST(hs.epoch_millis / 300000 AS INTEGER) * 300000 AS timestamp,
               ROUND(AVG(hs.beats_per_minute), 1) AS value,
               COUNT(*) AS secondary
        FROM heart_rate_record_series_table hs
        JOIN heart_rate_record_table h ON h.row_id = hs.parent_key
        WHERE 1=1 ${heartFilter.clause}
        GROUP BY timestamp ORDER BY timestamp
      `, heartFilter.params).map((r) => ({ timestamp: Number(r.timestamp), value: Number(r.value), secondary: Number(r.secondary) }))
    : [];
  const heartStats = has("heart_rate_record_table") && has("heart_rate_record_series_table")
    ? rows<{ minimum: number; average: number; maximum: number }>(`
        SELECT MIN(hs.beats_per_minute) AS minimum, AVG(hs.beats_per_minute) AS average,
               MAX(hs.beats_per_minute) AS maximum
        FROM heart_rate_record_series_table hs
        JOIN heart_rate_record_table h ON h.row_id = hs.parent_key
        WHERE 1=1 ${heartFilter.clause}
      `, heartFilter.params)[0]
    : undefined;

  const exerciseFilter = intervalWhere("e", filters);
  const exercises: ExerciseSession[] = has("exercise_session_record_table")
    ? rows<{ id: number; start: number; end: number; type: number; title: string; source: string }>(`
        SELECT e.row_id AS id, e.start_time AS start, e.end_time AS end, e.exercise_type AS type,
               COALESCE(e.title, '') AS title,
               COALESCE(NULLIF(a.app_name, ''), a.package_name, 'Unknown source') AS source
        FROM exercise_session_record_table e
        LEFT JOIN application_info_table a ON a.row_id = e.app_info_id
        WHERE 1=1 ${exerciseFilter.clause}
        ORDER BY e.start_time DESC
      `, exerciseFilter.params).map((r) => ({
        ...r,
        id: Number(r.id), start: Number(r.start), end: Number(r.end), type: Number(r.type),
        durationMinutes: Math.max(0, (Number(r.end) - Number(r.start)) / 60000),
        typeName: exerciseName(Number(r.type)),
      }))
    : [];

  function pointMetric(table: string, valueColumn: string): DataPoint[] {
    if (!has(table)) return [];
    const filter = instantWhere("m", filters);
    return rows<{ timestamp: number; value: number }>(`
      SELECT m.time AS timestamp, m.${valueColumn} AS value FROM ${table} m
      WHERE m.${valueColumn} IS NOT NULL ${filter.clause} ORDER BY m.time
    `, filter.params).map((r) => ({ timestamp: Number(r.timestamp), value: Number(r.value) }));
  }

  const weight = pointMetric("weight_record_table", "weight");
  const restingHeartRate = pointMetric("resting_heart_rate_record_table", "beats_per_minute");
  const hrv = pointMetric("heart_rate_variability_rmssd_record_table", "heart_rate_variability_millis");
  const oxygen = pointMetric("oxygen_saturation_record_table", "percentage");

  const pressureFilter = instantWhere("b", filters);
  const bloodPressure = has("blood_pressure_record_table")
    ? rows<{ timestamp: number; value: number; secondary: number }>(`
        SELECT b.time AS timestamp, b.systolic AS value, b.diastolic AS secondary
        FROM blood_pressure_record_table b WHERE 1=1 ${pressureFilter.clause} ORDER BY b.time
      `, pressureFilter.params).map((r) => ({ timestamp: Number(r.timestamp), value: Number(r.value), secondary: Number(r.secondary) }))
    : [];

  const sleepFilter = intervalWhere("s", filters);
  const sleep = has("sleep_session_record_table")
    ? rows<{ timestamp: number; value: number; label: string }>(`
        SELECT s.start_time AS timestamp, (s.end_time - s.start_time) / 60000.0 AS value,
               COALESCE(s.title, 'Sleep session') AS label
        FROM sleep_session_record_table s WHERE 1=1 ${sleepFilter.clause} ORDER BY s.start_time
      `, sleepFilter.params).map((r) => ({ timestamp: Number(r.timestamp), value: Number(r.value), label: r.label }))
    : [];

  const hydrationFilter = intervalWhere("h", filters);
  const hydration = has("hydration_record_table")
    ? rows<{ timestamp: number; value: number }>(`
        SELECT h.start_time AS timestamp, h.volume AS value FROM hydration_record_table h
        WHERE 1=1 ${hydrationFilter.clause} ORDER BY h.start_time
      `, hydrationFilter.params).map((r) => ({ timestamp: Number(r.timestamp), value: Number(r.value) }))
    : [];

  const sourceCount = filters.sourceId === null ? discoverSources().length : 1;
  if (sourceCount > 1) warnings.push("Multiple applications contribute records. Overlapping intervals may inflate additive totals.");
  if (activity.length === 1) warnings.push("Only one tracked day is available, so longer-term trends cannot be calculated.");
  if (!sleep.length) warnings.push("No sleep sessions are available for the selected period.");
  if (!weight.length) warnings.push("No weight measurements are available for the selected period.");

  const totalSteps = activity.reduce((sum, day) => sum + day.steps, 0);
  const exerciseMinutes = exercises.reduce((sum, session) => sum + session.durationMinutes, 0);
  const averageSleepMinutes = sleep.length ? sleep.reduce((sum, point) => sum + point.value, 0) / sleep.length : null;

  return {
    fileName,
    schemaVersion: info.schemaVersion,
    generatedAt: Date.now(),
    range: { min: info.minDate, max: info.maxDate, selectedFrom: filters.from, selectedTo: filters.to },
    summary: {
      totalSteps,
      averageDailySteps: activity.length ? totalSteps / activity.length : 0,
      trackedDays: activity.length,
      totalDistanceMeters: activity.reduce((sum, day) => sum + day.distanceMeters, 0),
      totalEnergyJoules: activity.reduce((sum, day) => sum + day.energyJoules, 0),
      exerciseCount: exercises.length,
      exerciseMinutes,
      heartRateMin: heartStats?.minimum == null ? null : Number(heartStats.minimum),
      heartRateAverage: heartStats?.average == null ? null : Number(heartStats.average),
      heartRateMax: heartStats?.maximum == null ? null : Number(heartStats.maximum),
      latestWeightGrams: weight.at(-1)?.value ?? null,
      averageSleepMinutes,
    },
    activity,
    hourlySteps,
    heartRate,
    exercises,
    weight,
    sleep,
    restingHeartRate,
    hrv,
    oxygen,
    bloodPressure,
    hydration,
    sources: discoverSources(),
    availableTables: info.availableTables,
    warnings,
  };
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
      tables = new Set(rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name));
      const required = ["steps_record_table", "application_info_table"];
      const missing = required.filter((table) => !has(table));
      if (missing.length) throw new Error(`This is not a supported Health Connect export. Missing: ${missing.join(", ")}.`);
      self.postMessage({ id: request.id, ok: true, data: databaseInfo() });
    } else {
      self.postMessage({ id: request.id, ok: true, data: analyze(request.payload) });
    }
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
