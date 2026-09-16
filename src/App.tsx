import { lazy, Suspense, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  Activity, AlertTriangle, ArrowRight, Check, ChevronDown, Database, Download, Dumbbell,
  Bot, FileHeart, Footprints, HeartPulse, Info, Menu, Moon, RotateCcw, Scale, ShieldCheck,
  SlidersHorizontal, Sparkles, Sun, Upload, X,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line,
  LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { HealthDatabaseClient } from "./database/client";
import { exportReport } from "./export/exportReport";
import { SLEEP_STAGE_AWAKE_TYPES, SLEEP_STAGE_DEEP_TYPES, SLEEP_STAGE_LIGHT_TYPES, SLEEP_STAGE_REM_TYPES } from "./health/enums";
import type { DatabaseInfo, HealthReport, SleepSession, Theme, Units } from "./health/models";

const CoachView = lazy(() => import("./coach/CoachView").then((module) => ({ default: module.CoachView })));
const OverallHealthView = lazy(() => import("./overall/OverallHealthView").then((module) => ({ default: module.OverallHealthView })));

type View = "overview" | "overall" | "coach" | "activity" | "heart" | "exercise" | "sleep" | "vitals" | "sources";
type Icon = typeof Activity;

const NAV: Array<{ id: View; label: string; icon: Icon }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "overall", label: "Overall health", icon: Sparkles },
  { id: "coach", label: "AI Health Coach", icon: Bot },
  { id: "activity", label: "Activity", icon: Footprints },
  { id: "heart", label: "Heart", icon: HeartPulse },
  { id: "exercise", label: "Exercise", icon: Dumbbell },
  { id: "sleep", label: "Sleep", icon: Moon },
  { id: "vitals", label: "Body & vitals", icon: Scale },
  { id: "sources", label: "Sources & quality", icon: Database },
];

const STAGE_COLORS: Record<number, string> = { 0: "#8e8e93", 1: "#ff9f0a", 2: "#64d2ff", 3: "#ff9f0a", 4: "#5e5ce6", 5: "#3634a3", 6: "#bf5af2", 7: "#ff9f0a" };
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const dateTime = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const archiveDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const archiveTime = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "No data";
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
}

function distance(meters: number, units: Units): string {
  return units === "metric" ? `${number.format(meters / 1000)} km` : `${number.format(meters / 1609.344)} mi`;
}

function weight(grams: number, units: Units): string {
  return units === "metric" ? `${number.format(grams / 1000)} kg` : `${number.format(grams / 453.59237)} lb`;
}

function energy(joules: number): string {
  return `${number.format(joules / 4184)} kcal`;
}

function MetricCard({ label, value, detail, tone = "teal" }: { label: string; value: string; detail: string; tone?: string }) {
  return <article className={`metric-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><header className="panel-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}

function Empty({ icon: Icon, title, message }: { icon: Icon; title: string; message: string }) {
  return <div className="empty"><Icon /><h3>{title}</h3><p>{message}</p></div>;
}

function FactHint({ text }: { text: string }) {
  return <button type="button" className="fact-hint" title={text} aria-label={text}><Info aria-hidden="true" /></button>;
}

type TipItem = { value: number; name: string; color?: string; dataKey?: string };
function ChartTip({ active, payload, label, suffix = "", labelFormatter }: { active?: boolean; payload?: TipItem[]; label?: string | number; suffix?: string; labelFormatter?: (label: string | number) => string }) {
  if (!active || !payload?.length) return null;
  const heading = labelFormatter ? labelFormatter(label ?? "") : typeof label === "number" ? dateTime.format(label) : label;
  return <div className="chart-tip"><small>{heading}</small>{payload.filter((item) => item.value != null).map((item, index) => <div className="tip-row" key={`${item.dataKey}-${index}`}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{number.format(item.value)}{suffix}</strong></div>)}</div>;
}

function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: Array<Array<string | number>> }) {
  return <details className="data-table"><summary>View accessible data table</summary><div className="table-wrap"><table><caption>{caption}</caption><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div></details>;
}

function Segmented<T extends string | number>({ values, value, labels, onChange, label }: { values: readonly T[]; value: T; labels: Record<string, string>; onChange: (value: T) => void; label: string }) {
  return <div className="segmented" aria-label={label}>{values.map((item) => <button key={item} aria-pressed={value === item} className={value === item ? "active" : ""} onClick={() => onChange(item)}>{labels[String(item)]}</button>)}</div>;
}

type ActivityMetric = "steps" | "distanceMeters" | "energyJoules";
type RecoveryMetric = "hrv" | "restingHeartRate" | "respiratoryRate" | "skinTemperatureDelta";
function ActivityExplorer({ report, units, compactView = false }: { report: HealthReport; units: Units; compactView?: boolean }) {
  const [metric, setMetric] = useState<ActivityMetric>("steps");
  const [style, setStyle] = useState<"bar" | "line">("line");
  const config = metric === "steps"
    ? { label: "Steps", suffix: " steps", color: "var(--chart-teal)", goal: 10000, format: (value: number) => value }
    : metric === "distanceMeters"
      ? { label: "Distance", suffix: units === "metric" ? " km" : " mi", color: "var(--chart-blue)", goal: 0, format: (value: number) => units === "metric" ? value / 1000 : value / 1609.344 }
      : { label: "Energy", suffix: " kcal", color: "var(--chart-amber)", goal: 0, format: (value: number) => value / 4184 };
  const data = report.activity.map((day) => ({ ...day, displayValue: config.format(day[metric]) }));
  const controls = <div className="chart-controls"><Segmented values={["steps", "distanceMeters", "energyJoules"] as const} value={metric} labels={{ steps: "Steps", distanceMeters: "Distance", energyJoules: "Energy" }} onChange={setMetric} label="Activity metric" />{!compactView && <Segmented values={["bar", "line"] as const} value={style} labels={{ bar: "Bars", line: "Line" }} onChange={setStyle} label="Chart style" />}</div>;
  const common = <><CartesianGrid vertical={false} strokeDasharray="2 7" /><XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={12} tickFormatter={(value) => shortDate.format(new Date(`${value}T00:00:00`))} /><YAxis axisLine={false} tickLine={false} width={50} tickFormatter={(value) => compact.format(value)} /><Tooltip cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }} content={<ChartTip suffix={config.suffix} labelFormatter={(value) => shortDate.format(new Date(`${value}T00:00:00`))} />} />{config.goal > 0 && <ReferenceLine y={config.goal} stroke="var(--chart-amber)" strokeDasharray="3 7" label={{ value: "10k", fill: "var(--muted)", position: "insideTopRight" }} />}</>;
  return <Panel title={`${config.label} over time`} eyebrow="Daily trend" action={controls} className="explorer-panel">
    <div className={`chart ${compactView ? "" : "hero-chart"}`} aria-label={`${config.label} trend`}><ResponsiveContainer>
      {style === "bar" ? <BarChart data={data} barCategoryGap="38%">{common}<Bar name={config.label} dataKey="displayValue" fill={config.color} radius={[10, 10, 10, 10]} /></BarChart>
        : <LineChart data={data}>{common}<Line name={config.label} type="monotone" dataKey="displayValue" stroke={config.color} strokeWidth={3.5} dot={false} activeDot={{ r: 6, strokeWidth: 4, stroke: "var(--surface)" }} /></LineChart>}
    </ResponsiveContainer></div>
    {!compactView && <><div className="chart-foot"><span><SlidersHorizontal /> Hover or tap for exact values</span><span>Switch metric and visual style above</span></div><DataTable caption={`${config.label} by day`} headers={["Date", config.label]} rows={data.map((day) => [shortDate.format(new Date(`${day.date}T00:00:00`)), `${number.format(day.displayValue)}${config.suffix}`])} /></>}
  </Panel>;
}

function HeartChart({ data, average, baseBucket = 5, compactView = false, title = "Heart-rate trace" }: { data: HealthReport["heartRate"]; average: number | null; baseBucket?: number; compactView?: boolean; title?: string }) {
  const availableBuckets = ([5, 15, 60] as const).filter((value) => value >= baseBucket);
  const [bucket, setBucket] = useState<5 | 15 | 60>((availableBuckets[0] ?? 60) as 5 | 15 | 60);
  const [showAverage, setShowAverage] = useState(true);
  const effectiveBucket = Math.max(bucket, baseBucket);
  const chartData = effectiveBucket === baseBucket ? data : Array.from(data.reduce((map, point) => {
    const timestamp = Math.floor(point.timestamp / (effectiveBucket * 60000)) * effectiveBucket * 60000;
    const current = map.get(timestamp) ?? { timestamp, weighted: 0, samples: 0 };
    const samples = point.secondary ?? 1;
    current.weighted += point.value * samples; current.samples += samples; map.set(timestamp, current); return map;
  }, new Map<number, { timestamp: number; weighted: number; samples: number }>()).values()).map((point) => ({ timestamp: point.timestamp, value: point.weighted / point.samples, secondary: point.samples }));
  const controls = <div className="chart-controls"><Segmented values={availableBuckets} value={effectiveBucket as 5 | 15 | 60} labels={{ 5: "5 min", 15: "15 min", 60: "1 hr" }} onChange={setBucket} label="Heart rate resolution" />{!compactView && <label className="check"><input type="checkbox" checked={showAverage} onChange={(event) => setShowAverage(event.target.checked)} /> Average line</label>}</div>;
  return <Panel title={title} eyebrow={`${effectiveBucket}-minute weighted average`} action={controls} className="explorer-panel">
    {chartData.length ? <div className={`chart ${compactView ? "" : "hero-chart"}`} aria-label="Heart-rate timeline"><ResponsiveContainer><AreaChart data={chartData}>
      <defs><linearGradient id={`heart-${compactView ? "small" : "large"}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-coral)" stopOpacity=".28" /><stop offset="1" stopColor="var(--chart-coral)" stopOpacity="0" /></linearGradient></defs>
      <CartesianGrid vertical={false} strokeDasharray="2 7" /><XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} axisLine={false} tickLine={false} tickMargin={12} tickFormatter={(value) => dateTime.format(value)} /><YAxis domain={["dataMin - 10", "dataMax + 10"]} axisLine={false} tickLine={false} width={42} /><Tooltip cursor={{ stroke: "var(--line-strong)" }} content={<ChartTip suffix=" bpm" />} /><Area name="Heart rate" type="monotone" dataKey="value" stroke="var(--chart-coral)" fill={`url(#heart-${compactView ? "small" : "large"})`} strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 4, stroke: "var(--surface)" }} />{showAverage && average !== null && <ReferenceLine y={average} stroke="var(--chart-blue)" strokeDasharray="3 7" />}
    </AreaChart></ResponsiveContainer></div> : <Empty icon={HeartPulse} title="No heart data" message="No samples match the current filters." />}
    {!compactView && chartData.length > 0 && <DataTable caption="Heart rate over time" headers={["Time", "Heart rate", "Samples"]} rows={chartData.map((point) => [dateTime.format(point.timestamp), `${number.format(point.value)} bpm`, point.secondary ?? 1])} />}
  </Panel>;
}

function ImportScreen({ onFile, busy, error }: { onFile: (file: File) => void; busy: boolean; error: string }) {
  const [dragging, setDragging] = useState(false);
  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) onFile(file); };
  return <main className="import-page">
    <div className="import-mark"><FileHeart /><span>Health Studio</span></div>
    <section className="import-copy"><h1>Your health archive.<br />Clear and private.</h1><p>Explore activity, heart rate, workouts, recovery, and recorded sleep stages. Your raw database never leaves this browser.</p></section>
    <label className={`drop-zone ${dragging ? "dragging" : ""} ${busy ? "busy" : ""}`} onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
      <input type="file" accept=".db,.sqlite,.sqlite3,application/x-sqlite3" disabled={busy} onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])} />
      <div className="drop-icon">{busy ? <RotateCcw className="spin" /> : <Upload />}</div><strong>{busy ? "Reading your archive..." : "Open a Health Connect export"}</strong><span>{busy ? "Detailed archives can take a moment" : "Drop a .db file here or choose a file"}</span>{!busy && <b>Choose database <ArrowRight /></b>}
    </label>
    {error && <div className="import-error" role="alert"><AlertTriangle /><span><strong>We could not open this archive.</strong>{error} Try another Health Connect database file.</span></div>}
    <footer className="privacy-strip"><div><ShieldCheck /><span><b>Local archive</b>Never uploaded</span></div><div><Database /><span><b>Read only</b>Original unchanged</span></div><div><Bot /><span><b>Coach opt-in</b>Selected summaries use cloud AI</span></div></footer>
  </main>;
}

function PageIntro({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return <div className="page-intro"><div><span className="kicker">{kicker}</span><h1>{title}</h1></div><p>{children}</p></div>;
}

function HealthRibbon({ report }: { report: HealthReport }) {
  const days = report.activity.map((day) => day.date);
  const maxSteps = Math.max(...report.activity.map((day) => day.steps), 1);
  return <section className="health-ribbon" aria-label="Daily health ribbon"><div className="ribbon-head"><span>Health day ribbon</span><small>Movement, exercise, and sleep coverage by local day</small></div><div className="ribbon-grid">
    {days.map((date) => { const dayStart = new Date(`${date}T00:00:00Z`).getTime(); const dayEnd = dayStart + 86400000; const sleep = report.sleep.find((session) => session.localEnd >= dayStart && session.localEnd < dayEnd); const workouts = report.exercises.filter((session) => session.localStart >= dayStart && session.localStart < dayEnd).length; const activity = report.activity.find((day) => day.date === date)!; const summary = `${date}: ${activity.steps.toLocaleString()} steps, ${workouts} workouts${sleep ? `, ${formatDuration(sleep.asleepMinutes)} asleep` : ""}`; return <div className="ribbon-day" key={date} tabIndex={0} aria-label={summary}><span>{archiveDate.format(dayStart)}</span><div className="ribbon-track" aria-hidden="true"><i className="ribbon-sleep" style={{ height: `${sleep ? Math.max(15, sleep.asleepMinutes / 480 * 100) : 0}%` }} /><i className="ribbon-steps" style={{ height: `${Math.max(4, activity.steps / maxSteps * 100)}%` }} />{workouts > 0 && <b>{workouts}</b>}</div></div>; })}
  </div><div className="ribbon-legend"><span><i className="sleep-dot" />Sleep</span><span><i className="step-dot" />Steps</span><span><b>1</b> Workout</span></div></section>;
}

function Overview({ report, units, navigate }: { report: HealthReport; units: Units; navigate: (view: View) => void }) {
  const summary = report.summary;
  return <><PageIntro kicker="Selected period" title="Your health, in context.">{shortDate.format(new Date(`${report.range.selectedFrom}T00:00:00`))} to {shortDate.format(new Date(`${report.range.selectedTo}T00:00:00`))}. Trends are descriptive, not medical advice.</PageIntro>
    <HealthRibbon report={report} />
    <div className="metrics-grid five"><MetricCard label="Daily movement" value={compact.format(summary.averageDailySteps)} detail="average steps" /><MetricCard label="Distance" value={distance(summary.totalDistanceMeters, units)} detail="recorded movement" tone="blue" /><MetricCard label="Exercise" value={formatDuration(summary.exerciseMinutes)} detail={`${summary.exerciseCount} sessions`} tone="amber" /><MetricCard label="Sleep" value={formatDuration(summary.averageAsleepMinutes)} detail={`${number.format(summary.averageSleepEfficiency ?? 0)}% efficiency`} tone="violet" /><MetricCard label="Heart" value={summary.heartRateAverage === null ? "No data" : `${Math.round(summary.heartRateAverage)} bpm`} detail={summary.heartRateMin === null ? "No samples" : `${Math.round(summary.heartRateMin)}–${Math.round(summary.heartRateMax!)} range`} tone="coral" /></div>
    <div className="insight-grid"><button onClick={() => navigate("sleep")} className="insight-card"><Moon /><span><small>Latest sleep</small><strong>{report.sleep[0] ? formatDuration(report.sleep[0].asleepMinutes) : "No session"}</strong><em>{report.sleep[0] ? `${number.format(report.sleep[0].efficiency)}% efficient · ${report.sleep[0].awakenings} awakenings` : "Import contains no sleep in this range"}</em></span><ArrowRight /></button><button onClick={() => navigate("exercise")} className="insight-card"><Dumbbell /><span><small>Latest workout</small><strong>{report.exercises[0]?.typeName ?? "No session"}</strong><em>{report.exercises[0] ? `${formatDuration(report.exercises[0].durationMinutes)} · ${report.exercises[0].average ? `${Math.round(report.exercises[0].average)} bpm average` : "no heart rate"}` : "No exercise in this range"}</em></span><ArrowRight /></button></div>
    <div className="two-col overview-charts"><ActivityExplorer report={report} units={units} compactView /><HeartChart data={report.heartRate} average={summary.heartRateAverage} baseBucket={report.heartRateBucketMinutes} compactView /></div>
  </>;
}

function ActivityView({ report, units }: { report: HealthReport; units: Units }) {
  return <><PageIntro kicker="Movement ledger" title="Activity">Move between daily totals and exact records without losing the selected date range.</PageIntro><div className="metrics-grid three"><MetricCard label="Total steps" value={report.summary.totalSteps.toLocaleString()} detail={`${report.summary.trackedDays} tracked days`} /><MetricCard label="Distance" value={distance(report.summary.totalDistanceMeters, units)} detail="across sources" tone="blue" /><MetricCard label="Energy" value={energy(report.summary.totalEnergyJoules)} detail="recorded expenditure" tone="amber" /></div><ActivityExplorer report={report} units={units} /><Panel title="Recorded days" eyebrow="Data table"><div className="table-wrap"><table><thead><tr><th>Date</th><th>Steps</th><th>Distance</th><th>Energy</th></tr></thead><tbody>{[...report.activity].reverse().map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.steps.toLocaleString()}</td><td>{distance(day.distanceMeters, units)}</td><td>{energy(day.energyJoules)}</td></tr>)}</tbody></table></div></Panel></>;
}

function HeartView({ report }: { report: HealthReport }) {
  const summary = report.summary;
  return <><PageIntro kicker="Cardiovascular signal" title="Heart">Inspect the sensor trace at different resolutions. Missing periods remain visible as gaps in coverage.</PageIntro><div className="metrics-grid three"><MetricCard label="Low" value={summary.heartRateMin === null ? "—" : `${Math.round(summary.heartRateMin)} bpm`} detail="selected period" tone="blue" /><MetricCard label="Average" value={summary.heartRateAverage === null ? "—" : `${Math.round(summary.heartRateAverage)} bpm`} detail={`${report.heartRate.reduce((sum, point) => sum + (point.secondary ?? 0), 0).toLocaleString()} samples`} tone="coral" /><MetricCard label="High" value={summary.heartRateMax === null ? "—" : `${Math.round(summary.heartRateMax)} bpm`} detail="selected period" tone="amber" /></div><HeartChart data={report.heartRate} average={summary.heartRateAverage} baseBucket={report.heartRateBucketMinutes} /></>;
}

function ExerciseView({ report, units }: { report: HealthReport; units: Units }) {
  const [selectedId, setSelectedId] = useState(report.exercises[0]?.id ?? 0);
  const selected = report.exercises.find((session) => session.id === selectedId) ?? report.exercises[0];
  const byType = Array.from(report.exercises.reduce((map, session) => map.set(session.typeName, (map.get(session.typeName) ?? 0) + session.durationMinutes), new Map<string, number>()), ([type, minutes]) => ({ type, minutes }));
  const scatter = report.exercises.filter((session) => session.average !== null).map((session) => ({ ...session, x: session.durationMinutes, y: session.average }));
  return <><PageIntro kicker="Training record" title="Exercise">Session detail combines recorded workout boundaries with heart rate and clearly marked time-overlap estimates.</PageIntro><div className="metrics-grid three"><MetricCard label="Sessions" value={String(report.summary.exerciseCount)} detail="selected period" /><MetricCard label="Total time" value={formatDuration(report.summary.exerciseMinutes)} detail="recorded exercise" tone="blue" /><MetricCard label="Average session" value={report.summary.exerciseCount ? formatDuration(report.summary.exerciseMinutes / report.summary.exerciseCount) : "—"} detail="per session" tone="amber" /></div>
    <div className="two-col exercise-overview"><Panel title="Minutes by activity" eyebrow="Volume"><div className="chart"><ResponsiveContainer><BarChart data={byType} layout="vertical" barCategoryGap="42%"><CartesianGrid horizontal={false} strokeDasharray="2 7" /><XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value)}m`} /><YAxis dataKey="type" type="category" axisLine={false} tickLine={false} width={105} /><Tooltip cursor={{ fill: "var(--surface-strong)", opacity: .55 }} content={<ChartTip suffix=" min" />} /><Bar dataKey="minutes" name="Minutes" fill="var(--chart-blue)" radius={[0, 12, 12, 0]} /></BarChart></ResponsiveContainer></div></Panel><Panel title="Duration and intensity" eyebrow="Session comparison"><div className="chart"><ResponsiveContainer><ScatterChart><CartesianGrid strokeDasharray="2 7" /><XAxis dataKey="x" name="Duration" unit=" min" domain={[0, "dataMax + 10"]} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value)}m`} /><YAxis dataKey="y" name="Average heart rate" unit=" bpm" domain={["dataMin - 10", "dataMax + 10"]} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value)}`} /><Tooltip cursor={{ stroke: "var(--line-strong)", strokeDasharray: "3 5" }} /><Scatter data={scatter} fill="var(--chart-coral)" /></ScatterChart></ResponsiveContainer></div></Panel></div>
    <div className="exercise-layout"><Panel title="Sessions" eyebrow="Choose a workout" className="session-panel">{report.exercises.length ? <div className="session-list">{report.exercises.map((session) => <button key={session.id} className={selected?.id === session.id ? "selected" : ""} onClick={() => setSelectedId(session.id)}><span className="session-icon"><Dumbbell /></span><span><strong>{session.title || session.typeName}</strong><small>{archiveDate.format(session.localStart)} · {archiveTime.format(session.localStart)} · {session.source}</small></span><b>{formatDuration(session.durationMinutes)}</b></button>)}</div> : <Empty icon={Dumbbell} title="No exercise sessions" message="No sessions match the current filters." />}</Panel>
      {selected && <Panel title={selected.title || selected.typeName} eyebrow={`${archiveDate.format(selected.localStart)} · ${archiveTime.format(selected.localStart)}–${archiveTime.format(selected.localEnd)}`} className="workout-detail"><div className="detail-stats"><span><small>Duration</small><b>{formatDuration(selected.durationMinutes)}</b></span><span><small>Heart rate</small><b>{selected.average === null ? "No data" : `${Math.round(selected.average)} bpm`}</b></span><span><small>Estimated steps</small><b>{Math.round(selected.estimatedSteps).toLocaleString()}</b></span><span><small>Estimated distance</small><b>{distance(selected.estimatedDistanceMeters, units)}</b></span></div>{selected.heartRate.length ? <div className="chart"><ResponsiveContainer><AreaChart data={selected.heartRate}><defs><linearGradient id="workoutHeart" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-coral)" stopOpacity=".25" /><stop offset="1" stopColor="var(--chart-coral)" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="2 7" /><XAxis dataKey="timestamp" axisLine={false} tickLine={false} tickMargin={12} tickFormatter={(value) => dateTime.format(value)} /><YAxis axisLine={false} tickLine={false} domain={["dataMin - 10", "dataMax + 10"]} /><Tooltip cursor={{ stroke: "var(--line-strong)" }} content={<ChartTip suffix=" bpm" />} /><Area dataKey="value" name="Heart rate" type="monotone" stroke="var(--chart-coral)" fill="url(#workoutHeart)" strokeWidth={3} dot={false} activeDot={{ r: 6, stroke: "var(--surface)", strokeWidth: 4 }} /></AreaChart></ResponsiveContainer></div> : <Empty icon={HeartPulse} title="No heart-rate trace" message="No heart samples overlap this workout." />}<div className="capability-row"><span className={selected.lapCount ? "available" : ""}>Laps <b>{selected.lapCount || "Not recorded"}</b></span><span className={selected.segmentCount ? "available" : ""}>Sets & segments <b>{selected.segmentCount || "Not recorded"}</b></span><span className={selected.routePointCount ? "available" : ""}>Route <b>{selected.routePointCount ? `${selected.routePointCount} points` : "Not recorded"}</b></span></div><p className="data-note"><Info /> Steps, distance, and energy are estimates from records overlapping this session. Heart-rate samples are directly timestamped.</p></Panel>}
    </div>
  </>;
}

const SLEEP_LANES = [
  { name: "Awake", types: SLEEP_STAGE_AWAKE_TYPES, color: STAGE_COLORS[1] },
  { name: "REM", types: SLEEP_STAGE_REM_TYPES, color: STAGE_COLORS[6] },
  { name: "Light", types: SLEEP_STAGE_LIGHT_TYPES, color: STAGE_COLORS[4] },
  { name: "Deep", types: SLEEP_STAGE_DEEP_TYPES, color: STAGE_COLORS[5] },
];

function sleepLane(type: number): number {
  const index = SLEEP_LANES.findIndex((lane) => lane.types.includes(type));
  return index < 0 ? 2 : index;
}

function SleepHypnogram({ session }: { session: SleepSession }) {
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const width = 1000;
  const laneHeight = 66;
  const barHeight = 34;
  const duration = session.end - session.start || 1;
  const x = (time: number) => (time - session.start) / duration * width;
  const y = (type: number) => sleepLane(type) * laneHeight + (laneHeight - barHeight) / 2;
  const percentOfSleep: Record<string, number | null> = {
    REM: session.detailed.remPercentOfSleep,
    Deep: session.detailed.deepPercentOfSleep,
    Light: session.detailed.lightPercentOfSleep,
  };
  return <div className="sleep-timeline" aria-label={`Recorded sleep stages from ${archiveTime.format(session.localStart)} to ${archiveTime.format(session.localEnd)}`}>
    <div className="sleep-lane-labels">{SLEEP_LANES.map((lane) => { const total = session.stageTotals.filter((stage) => lane.types.includes(stage.type)).reduce((sum, stage) => sum + stage.minutes, 0); const percent = percentOfSleep[lane.name] ?? null; return <div key={lane.name}><strong>{lane.name}</strong><span>{formatDuration(total)}{percent !== null && <em>{number.format(percent)}% of sleep</em>}</span></div>; })}</div>
    <div className="sleep-svg-wrap"><svg viewBox={`0 0 ${width} ${laneHeight * 4}`} preserveAspectRatio="none" shapeRendering="geometricPrecision" role="img">
      {SLEEP_LANES.map((lane, index) => <rect key={lane.name} x="0" y={index * laneHeight + (laneHeight - barHeight) / 2} width={width} height={barHeight} rx="17" fill="var(--sleep-track)" />)}
      {session.stages.slice(1).map((stage, index) => { const previous = session.stages[index]; const fromY = y(previous.type) + barHeight / 2; const toY = y(stage.type) + barHeight / 2; const position = Math.round(x(stage.start)) + .5; return fromY === toY ? null : <line className="sleep-stage-connector" key={`line-${stage.start}`} x1={position} x2={position} y1={fromY} y2={toY} stroke={STAGE_COLORS[stage.type]} strokeWidth="2" vectorEffect="non-scaling-stroke" />; })}
      {session.stages.map((stage, index) => <g key={`${stage.start}-${index}`} tabIndex={0} role="button" aria-label={`${stage.name}, ${Math.round(stage.durationMinutes)} minutes, ${archiveTime.format(stage.localStart)} to ${archiveTime.format(stage.localEnd)}`} onMouseEnter={() => setActiveStage(index)} onMouseLeave={() => setActiveStage(null)} onFocus={() => setActiveStage(index)} onBlur={() => setActiveStage(null)}><title>{stage.name}: {archiveTime.format(stage.localStart)}–{archiveTime.format(stage.localEnd)} · ${Math.round(stage.durationMinutes)} min</title><rect className="sleep-stage-segment" x={Math.round(x(stage.start))} y={y(stage.type)} width={Math.max(3, Math.round(x(stage.end) - x(stage.start)))} height={barHeight} rx="12" fill={STAGE_COLORS[stage.type]} vectorEffect="non-scaling-stroke" /></g>)}
    </svg>{activeStage !== null && (() => { const stage = session.stages[activeStage]; const midpoint = x(stage.start + (stage.end - stage.start) / 2) / width * 100; return <div className="sleep-stage-tooltip" role="tooltip" style={{ left: `${Math.max(10, Math.min(90, midpoint))}%`, top: `${y(stage.type) + barHeight + 5}px` }}><strong>{stage.name}</strong><span>{archiveTime.format(stage.localStart)}–{archiveTime.format(stage.localEnd)}</span><small>{Math.round(stage.durationMinutes)} min</small></div>; })()}<div className="sleep-time-axis"><span>{archiveTime.format(session.localStart)}</span><span>{archiveTime.format(session.localStart + duration / 2)}</span><span>{archiveTime.format(session.localEnd)}</span></div></div>
  </div>;
}

function SleepHistory({ sessions, selectedId, onSelect }: { sessions: SleepSession[]; selectedId: number; onSelect: (id: number) => void }) {
  const chronological = [...sessions].reverse();
  const max = Math.max(...chronological.map((session) => session.durationMinutes), 1);
  return <section className="sleep-history"><header><div><span className="eyebrow">Recent nights</span><h2>Sleep consistency</h2></div><p>Recorded stage mix and total session length</p></header><div className="sleep-history-scroll">{chronological.map((session) => <button key={session.id} className={session.id === selectedId ? "selected" : ""} onClick={() => onSelect(session.id)} aria-label={`${archiveDate.format(session.localEnd)}, ${formatDuration(session.asleepMinutes)}, ${number.format(session.efficiency)} percent efficiency`}><div className="history-stack" style={{ height: `${Math.max(38, session.durationMinutes / max * 100)}%` }}>{session.stageTotals.filter((stage) => [1, 4, 5, 6].includes(stage.type)).map((stage) => <i key={stage.type} style={{ height: `${stage.percentage}%`, background: STAGE_COLORS[stage.type] }} />)}</div><strong>{archiveDate.format(session.localEnd)}</strong><span>{formatDuration(session.asleepMinutes)}</span></button>)}</div></section>;
}

function SleepView({ report }: { report: HealthReport }) {
  const [selectedId, setSelectedId] = useState(report.sleep[0]?.id ?? 0);
  const [recoveryMetric, setRecoveryMetric] = useState<RecoveryMetric>("hrv");
  const selected = report.sleep.find((session) => session.id === selectedId) ?? report.sleep[0];
  const isSingleDay = report.range.selectedFrom === report.range.selectedTo;
  if (!selected) return <><PageIntro kicker="Rest and recovery" title="Sleep">Recorded sleep detail from your archive.</PageIntro><Empty icon={Moon} title="No sleep data" message="No sessions match the current filters." /></>;
  const efficiencyCopy = selected.efficiency >= 90 ? "Your recorded sleep efficiency was high." : selected.efficiency >= 80 ? "Your recorded sleep efficiency was moderate." : "A larger share of this session was recorded awake.";
  const detail = selected.detailed;
  const stageFact = (minutes: number | null) => minutes === null ? "Not recorded" : formatDuration(minutes);
  const bedtimeConsistency = report.summary.sleepBedtimeConsistencyMinutes;
  const wakeConsistency = report.summary.sleepWakeConsistencyMinutes;
  const recoveryConfig = {
    hrv: { label: "HRV", suffix: " ms", color: "var(--chart-blue)" },
    restingHeartRate: { label: "Resting heart rate", suffix: " bpm", color: "var(--chart-coral)" },
    respiratoryRate: { label: "Breathing", suffix: "/min", color: "var(--chart-teal)" },
    skinTemperatureDelta: { label: "Skin temperature", suffix: "°", color: "var(--chart-amber)" },
  }[recoveryMetric];
  const recoveryData = [...report.sleep].reverse().map((session) => ({ timestamp: session.localEnd, value: session[recoveryMetric] }));
  const recoveryAvailability = {
    hrv: report.sleep.some((session) => session.hrv !== null),
    restingHeartRate: report.sleep.some((session) => session.restingHeartRate !== null),
    respiratoryRate: report.sleep.some((session) => session.respiratoryRate !== null),
    skinTemperatureDelta: report.sleep.some((session) => session.skinTemperatureDelta !== null),
  };
  const hasRecoveryData = recoveryAvailability[recoveryMetric];
  return <div className="sleep-page">{isSingleDay ? <div className="sleep-hero"><div><span className="kicker">Sleep · {archiveDate.format(selected.localEnd)}</span><h1>{formatDuration(selected.asleepMinutes)}</h1><strong>{archiveTime.format(selected.localStart)}–{archiveTime.format(selected.localEnd)}</strong><p>You spent {formatDuration(selected.durationMinutes)} in the sleep session, with {number.format(selected.efficiency)}% efficiency. {efficiencyCopy}</p></div><div className="sleep-hero-orbit"><Moon /><span><b>{selected.awakenings}</b> awakenings</span><span><b>{selected.average === null ? "—" : Math.round(selected.average)}</b> avg bpm</span></div></div> : <><PageIntro kicker="Rest and recovery" title="Sleep">Review sleep and recovery across the selected period. Choose a night below to inspect its recorded signals.</PageIntro><div className="metrics-grid four"><MetricCard label="Average asleep" value={formatDuration(report.summary.averageAsleepMinutes)} detail={`${report.sleep.length} recorded sessions`} tone="violet" /><MetricCard label="Average efficiency" value={report.summary.averageSleepEfficiency === null ? "—" : `${number.format(report.summary.averageSleepEfficiency)}%`} detail="asleep ÷ session time" /><MetricCard label="Sleep schedule" value={bedtimeConsistency === null ? "Needs 2+ nights" : `±${Math.round(bedtimeConsistency)}m bedtime`} detail={wakeConsistency === null ? "Wake spread unavailable" : `±${Math.round(wakeConsistency)}m wake time`} tone="amber" /><MetricCard label="Selected night" value={formatDuration(selected.asleepMinutes)} detail={archiveDate.format(selected.localEnd)} tone="blue" /></div><SleepHistory sessions={report.sleep} selectedId={selected.id} onSelect={setSelectedId} /></>}
    <section className="sleep-focus"><header><div><span className="eyebrow">Recorded timeline</span><h2>Sleep stages · {archiveDate.format(selected.localEnd)}</h2></div><div className="sleep-source">{selected.source} · {selected.stages.length} intervals</div></header><SleepHypnogram session={selected} /><div className="sleep-facts">
      <span><small>In bed</small><b>{formatDuration(selected.durationMinutes)}</b></span>
      <span><small>Asleep</small><b>{formatDuration(selected.asleepMinutes)}</b></span>
      <span><small>Deep sleep</small><b>{stageFact(detail.deepMinutes)}</b></span>
      <span><small>Awake</small><b>{formatDuration(selected.awakeMinutes)}</b></span>
      <span><small>Efficiency</small><b>{number.format(selected.efficiency)}%</b></span>
      <span><small>Sleep latency<FactHint text="Time between the start of this session and the first recorded asleep stage. Only shown when the archive recorded stage-level detail." /></small><b>{stageFact(detail.sleepLatencyMinutes)}</b></span>
      <span><small>Awake after onset<FactHint text="Recorded awake time between falling asleep and your final asleep stage — distinct from total awake time, which also covers time before sleep onset." /></small><b>{stageFact(detail.wakeAfterSleepOnsetMinutes)}</b></span>
      <span><small>Longest awake stretch<FactHint text="The single longest recorded awake stage during this session." /></small><b>{stageFact(detail.longestAwakeStretchMinutes)}</b></span>
      <span><small>Fragmentation<FactHint text="Recorded awakenings per hour asleep. A higher value suggests more interrupted sleep; it is not a clinical score." /></small><b>{detail.fragmentationPerHour === null ? "Not recorded" : `${number.format(detail.fragmentationPerHour)}/hr`}</b></span>
    </div>{!detail.hasStageData && <p className="data-note"><Info /> This session has no recorded sleep stages, so latency, awake-after-onset, and stage composition can't be derived. A missing value here reflects missing sensor data, not necessarily poor sleep.</p>}</section>
    <section className="sleep-recovery"><div className="recovery-copy"><span className="eyebrow">Overnight signals</span><h2>Recovery context</h2><p>{isSingleDay ? "Sensor readings captured during this sleep session." : `Measurements for ${archiveDate.format(selected.localEnd)}. Choose a signal to compare it across the selected period.`} These are measurements, not a readiness score.</p><div className="recovery-list"><button className={recoveryMetric === "hrv" ? "active" : ""} disabled={!recoveryAvailability.hrv} onClick={() => setRecoveryMetric("hrv")}><small>HRV</small><b>{selected.hrv === null ? "Not recorded" : `${number.format(selected.hrv)} ms`}</b></button><button className={recoveryMetric === "restingHeartRate" ? "active" : ""} disabled={!recoveryAvailability.restingHeartRate} onClick={() => setRecoveryMetric("restingHeartRate")}><small>Resting heart rate</small><b>{selected.restingHeartRate === null ? "Not recorded" : `${number.format(selected.restingHeartRate)} bpm`}</b></button><button className={recoveryMetric === "respiratoryRate" ? "active" : ""} disabled={!recoveryAvailability.respiratoryRate} onClick={() => setRecoveryMetric("respiratoryRate")}><small>Breathing</small><b>{selected.respiratoryRate === null ? "Not recorded" : `${number.format(selected.respiratoryRate)}/min`}</b></button><button className={recoveryMetric === "skinTemperatureDelta" ? "active" : ""} disabled={!recoveryAvailability.skinTemperatureDelta} onClick={() => setRecoveryMetric("skinTemperatureDelta")}><small>Skin temperature</small><b>{selected.skinTemperatureDelta === null ? "Not recorded" : `${selected.skinTemperatureDelta > 0 ? "+" : ""}${number.format(selected.skinTemperatureDelta)}°`}</b></button></div></div>{isSingleDay ? selected.heartRate.length > 0 && <div className="overnight-chart"><ResponsiveContainer><AreaChart data={selected.heartRate}><defs><linearGradient id="sleepHeart" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-coral)" stopOpacity=".22" /><stop offset="1" stopColor="var(--chart-coral)" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="2 7" /><XAxis dataKey="timestamp" axisLine={false} tickLine={false} tickMargin={12} tickFormatter={(value) => archiveTime.format(value + (selected.localStart - selected.start))} /><YAxis axisLine={false} tickLine={false} domain={["dataMin - 5", "dataMax + 5"]} /><Tooltip content={<ChartTip suffix=" bpm" />} /><Area dataKey="value" name="Heart rate" type="monotone" stroke="var(--chart-coral)" strokeWidth={3} fill="url(#sleepHeart)" dot={false} activeDot={{ r: 6, stroke: "var(--surface)", strokeWidth: 4 }} /></AreaChart></ResponsiveContainer></div> : hasRecoveryData ? <div className="overnight-chart recovery-trend"><div className="recovery-chart-head"><strong>{recoveryConfig.label} by night</strong><span>Selected: {archiveDate.format(selected.localEnd)}</span></div><ResponsiveContainer><LineChart data={recoveryData} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}><CartesianGrid vertical={false} /><XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} axisLine={false} tickLine={false} tickMargin={12} tickFormatter={(value) => archiveDate.format(value)} /><YAxis domain={["auto", "auto"]} axisLine={false} tickLine={false} width={42} /><Tooltip cursor={{ stroke: "var(--line-strong)" }} content={<ChartTip suffix={recoveryConfig.suffix} labelFormatter={(value) => archiveDate.format(Number(value))} />} /><ReferenceLine x={selected.localEnd} stroke={recoveryConfig.color} strokeDasharray="3 5" /><Line dataKey="value" name={recoveryConfig.label} type="monotone" connectNulls={false} stroke={recoveryConfig.color} strokeWidth={3} dot={{ r: 3, fill: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "var(--surface)", strokeWidth: 3 }} /></LineChart></ResponsiveContainer></div> : <Empty icon={Activity} title={`No nightly ${recoveryConfig.label.toLowerCase()} data`} message="This archive did not record this recovery signal during the nights in the selected period." />}</section>
  </div>;
}

function MiniTrend({ title, data, suffix, color }: { title: string; data: HealthReport["hrv"]; suffix: string; color: string }) {
  return <Panel title={title} eyebrow={`${data.length} measurements`}>{data.length ? <div className="chart"><ResponsiveContainer><LineChart data={data}><CartesianGrid vertical={false} strokeDasharray="2 7" /><XAxis dataKey="timestamp" axisLine={false} tickLine={false} tickMargin={12} tickFormatter={(value) => shortDate.format(value)} /><YAxis domain={["auto", "auto"]} axisLine={false} tickLine={false} /><Tooltip cursor={{ stroke: "var(--line-strong)" }} content={<ChartTip suffix={suffix} />} /><Line name={title} dataKey="value" type="monotone" stroke={color} strokeWidth={3} dot={false} activeDot={{ r: 6, stroke: "var(--surface)", strokeWidth: 4 }} /></LineChart></ResponsiveContainer></div> : <Empty icon={Activity} title={`No ${title.toLowerCase()} data`} message="This measurement is not available for the selected period." />}</Panel>;
}

function VitalsView({ report, units }: { report: HealthReport; units: Units }) {
  const latest = report.summary.latestWeightGrams;
  return <><PageIntro kicker="Recovery and body" title="Body & vitals">Measurements are presented as recorded, without diagnosis or health scoring.</PageIntro><div className="metrics-grid four"><MetricCard label="Latest weight" value={latest === null ? "No data" : weight(latest, units)} detail={report.weight.length ? dateTime.format(report.weight.at(-1)!.timestamp) : "selected period"} /><MetricCard label="Resting heart rate" value={report.restingHeartRate.length ? `${Math.round(report.restingHeartRate.at(-1)!.value)} bpm` : "No data"} detail="latest measurement" tone="coral" /><MetricCard label="HRV" value={report.hrv.length ? `${number.format(report.hrv.at(-1)!.value)} ms` : "No data"} detail="latest RMSSD" tone="blue" /><MetricCard label="Respiratory rate" value={report.respiratoryRate.length ? `${number.format(report.respiratoryRate.at(-1)!.value)}/min` : "No data"} detail="latest measurement" tone="amber" /></div><div className="two-col"><MiniTrend title="Heart-rate variability" data={report.hrv} suffix=" ms" color="var(--chart-blue)" /><MiniTrend title="Resting heart rate" data={report.restingHeartRate} suffix=" bpm" color="var(--chart-coral)" /><MiniTrend title="Respiratory rate" data={report.respiratoryRate} suffix="/min" color="var(--chart-teal)" /><MiniTrend title="Skin temperature delta" data={report.skinTemperature} suffix="°" color="var(--chart-amber)" /></div></>;
}

function SourcesView({ report }: { report: HealthReport }) {
  return <><PageIntro kicker="Provenance and coverage" title="Sources & quality">Understand what was recorded, what is estimated, and where this archive has gaps.</PageIntro><div className="two-col"><Panel title="Contributing apps" eyebrow="All supported metrics"><div className="source-list">{report.sources.map((source) => <article key={source.id}><div><Database /><span><strong>{source.name}</strong><small>{source.packageName}</small></span></div><b>{source.records.toLocaleString()} records</b></article>)}</div></Panel><Panel title="Read with care" eyebrow="Data notes"><div className="warnings">{report.warnings.map((warning, index) => <div key={index}><Info /><p>{warning}</p></div>)}</div></Panel></div><Panel title="Archive profile" eyebrow="Technical details"><div className="profile-grid"><span><small>Schema version</small><b>{report.schemaVersion}</b></span><span><small>Available tables</small><b>{report.availableTables.length}</b></span><span><small>Archive file</small><b>{report.fileName}</b></span><span><small>Processing</small><b>Browser memory only</b></span></div></Panel></>;
}

export default function App({ initialFile, initialTheme }: { initialFile?: File; initialTheme?: Theme }) {
  const clientRef = useRef<HealthDatabaseClient | null>(null);
  const analyzeVersion = useRef(0);
  const [info, setInfo] = useState<DatabaseInfo | null>(null);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [view, setView] = useState<View>("overview");
  const [units, setUnits] = useState<Units>("metric");
  const [theme, setTheme] = useState<Theme>(() => initialTheme ?? (localStorage.getItem("health-theme") === "dark" ? "dark" : "light"));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [appliedSourceId, setAppliedSourceId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => { const client = new HealthDatabaseClient(); clientRef.current = client; return () => client.dispose(); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("health-theme", theme); }, [theme]);
  useEffect(() => { if (!initialFile) return; const timer = window.setTimeout(() => void load(initialFile)); return () => window.clearTimeout(timer); }, [initialFile]);

  const analyze = async (nextInfo: DatabaseInfo, nextFrom = from || nextInfo.minDate, nextTo = to || nextInfo.maxDate, nextSource = sourceId) => {
    const version = ++analyzeVersion.current;
    setBusy(true); setError("");
    try { const nextReport = await clientRef.current!.analyze({ from: nextFrom, to: nextTo, sourceId: nextSource }); if (version === analyzeVersion.current) { setReport(nextReport); setAppliedSourceId(nextSource); } return true; }
    catch (cause) { if (version === analyzeVersion.current) setError(`${cause instanceof Error ? cause.message : String(cause)} Check the selected dates and source, then try again.`); return false; }
    finally { if (version === analyzeVersion.current) setBusy(false); }
  };
  const load = async (file: File) => { setBusy(true); setError(""); try { const loaded = await clientRef.current!.load(file); setInfo(loaded); setFrom(loaded.minDate); setTo(loaded.maxDate); setSourceId(null); await analyze(loaded, loaded.minDate, loaded.maxDate, null); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setInfo(null); setReport(null); setBusy(false); } };
  const applyPreset = (days: number | null) => { if (!info) return; const nextTo = info.maxDate; const nextFrom = days === null ? info.minDate : new Date(new Date(`${nextTo}T00:00:00Z`).getTime() - (days - 1) * 86400000).toISOString().slice(0, 10); setFrom(nextFrom < info.minDate ? info.minDate : nextFrom); setTo(nextTo); };
  const reset = () => { if (window.confirm("Close this local archive? You will return to the import screen. The original file will not be changed.")) location.reload(); };
  if (!info || !report) return <ImportScreen onFile={load} busy={busy} error={error} />;
  const filtersDirty = from !== report.range.selectedFrom || to !== report.range.selectedTo || sourceId !== appliedSourceId;

  const coachAnalyze = (nextFrom: string, nextTo: string) => clientRef.current!.analyze({ from: nextFrom, to: nextTo, sourceId: null });
  const content = view === "overview" ? <Overview report={report} units={units} navigate={setView} /> : view === "overall" ? <Suspense fallback={<div className="view-loading" role="status">Opening overall health...</div>}><OverallHealthView key={`${report.generatedAt}-${units}`} report={report} units={units} /></Suspense> : view === "coach" ? <Suspense fallback={<div className="view-loading" role="status">Opening your private coach...</div>}><CoachView info={info} report={report} analyze={coachAnalyze} /></Suspense> : view === "activity" ? <ActivityView report={report} units={units} /> : view === "heart" ? <HeartView report={report} /> : view === "exercise" ? <ExerciseView report={report} units={units} /> : view === "sleep" ? <SleepView report={report} /> : view === "vitals" ? <VitalsView report={report} units={units} /> : <SourcesView report={report} />;
  return <div className="app-shell" data-view={view}><a className="skip-link" href="#main-content">Skip to content</a>{menu && <button className="menu-scrim" onClick={() => setMenu(false)} aria-label="Close navigation" />}
    <aside className={menu ? "open" : ""}><div className="brand"><FileHeart /><span>Health<b>Studio</b></span><button onClick={() => setMenu(false)} aria-label="Close menu"><X /></button></div><nav aria-label="Health sections">{NAV.map((item) => <button key={item.id} aria-current={view === item.id ? "page" : undefined} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setMenu(false); }}><item.icon />{item.label}</button>)}</nav><div className="aside-foot"><ShieldCheck /><span>Local session<b title={report.fileName}>{report.fileName}</b></span><button onClick={reset} title="Clear database" aria-label="Clear database"><RotateCcw /></button></div></aside>
    <div className="workspace"><header className="topbar"><div className="topbar-primary"><button className="mobile-menu" onClick={() => setMenu(true)} aria-label="Open menu"><Menu /></button><div className="range-summary"><span>Viewing</span><strong>{shortDate.format(new Date(`${report.range.selectedFrom}T00:00:00`))} – {shortDate.format(new Date(`${report.range.selectedTo}T00:00:00`))}</strong></div><button className={`refine ${filtersDirty ? "pending" : ""}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>Refine <ChevronDown /></button><div className="top-actions"><button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>{theme === "light" ? <Moon /> : <Sun />}</button><div className="unit-toggle" aria-label="Measurement units"><button className={units === "metric" ? "active" : ""} onClick={() => setUnits("metric")}>Metric</button><button className={units === "imperial" ? "active" : ""} onClick={() => setUnits("imperial")}>Imperial</button></div><button className="export" onClick={() => { exportReport(report, units); setStatus("Report export started."); }}><Download />Export</button></div></div>{filtersOpen && <div className="filter-drawer"><div className="quick-ranges" aria-label="Quick date ranges">{[7, 30, 90].map((days) => <button key={days} onClick={() => applyPreset(days)}>{days}D</button>)}<button className={from === info.minDate && to === info.maxDate ? "active" : ""} onClick={() => applyPreset(null)}>All</button></div><div className="filters"><label>From<input type="date" min={info.minDate} max={to} value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" min={from} max={info.maxDate} value={to} onChange={(event) => setTo(event.target.value)} /></label><label>Source<select value={sourceId ?? ""} onChange={(event) => setSourceId(event.target.value ? Number(event.target.value) : null)}><option value="">All sources</option>{info.sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label><button className={`apply ${filtersDirty ? "pending" : ""}`} disabled={busy || !filtersDirty} onClick={() => void analyze(info).then((applied) => { if (applied) setFiltersOpen(false); })}>{busy ? <RotateCcw className="spin" /> : filtersDirty ? "Apply changes" : <><Check />Applied</>}</button></div></div>}</header><div className="sr-status" aria-live="polite">{status}</div>{error && <div className="workspace-error" role="alert"><AlertTriangle /><span><strong>We could not update this view.</strong>{error}</span></div>}<main id="main-content" className="content"><div className="view-transition" key={view}>{content}</div></main><footer className="app-footer"><span><ShieldCheck />Data stays in this browser</span><span>Health Studio · Read-only analysis</span></footer></div>
  </div>;
}
