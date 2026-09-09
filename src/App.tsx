import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Database,
  Download,
  Dumbbell,
  FileHeart,
  Footprints,
  HeartPulse,
  Info,
  Menu,
  Moon,
  RotateCcw,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HealthDatabaseClient } from "./database/client";
import type { DatabaseInfo, HealthReport, Units } from "./health/models";
import { exportReport } from "./export/exportReport";

type View = "overview" | "activity" | "heart" | "exercise" | "sleep" | "vitals" | "sources";

const NAV: Array<{ id: View; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "activity", label: "Activity", icon: Footprints },
  { id: "heart", label: "Heart", icon: HeartPulse },
  { id: "exercise", label: "Exercise", icon: Dumbbell },
  { id: "sleep", label: "Sleep", icon: Moon },
  { id: "vitals", label: "Body & vitals", icon: Scale },
  { id: "sources", label: "Sources & quality", icon: Database },
];

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const dateTime = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function distance(meters: number, units: Units): string {
  return units === "metric" ? `${number.format(meters / 1000)} km` : `${number.format(meters / 1609.344)} mi`;
}

function weight(grams: number, units: Units): string {
  return units === "metric" ? `${number.format(grams / 1000)} kg` : `${number.format(grams / 453.59237)} lb`;
}

function energy(joules: number): string {
  return `${number.format(joules / 4184)} kcal`;
}

function MetricCard({ label, value, detail, tone = "sage" }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Empty({ icon: Icon, title, message }: { icon: typeof Moon; title: string; message: string }) {
  return <div className="empty"><Icon /><h3>{title}</h3><p>{message}</p></div>;
}

function ChartTip({ active, payload, label, suffix = "", labelFormatter }: { active?: boolean; payload?: Array<{ value: number; name: string; color?: string }>; label?: string | number; suffix?: string; labelFormatter?: (label: string | number) => string }) {
  if (!active || !payload?.length) return null;
  const heading = labelFormatter ? labelFormatter(label ?? "") : typeof label === "number" ? dateTime.format(label) : label;
  return <div className="chart-tip"><small>{heading}</small>{payload.map((item) => <div className="tip-row" key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{number.format(item.value)}{suffix}</strong></div>)}</div>;
}

type ActivityMetric = "steps" | "distanceMeters" | "energyJoules";

function ActivityExplorer({ report, units, compactView = false }: { report: HealthReport; units: Units; compactView?: boolean }) {
  const [metric, setMetric] = useState<ActivityMetric>("steps");
  const [style, setStyle] = useState<"bar" | "line">("bar");
  const config = metric === "steps"
    ? { label: "Steps", suffix: " steps", color: "#6dd58c", goal: 10000, format: (v: number) => v }
    : metric === "distanceMeters"
      ? { label: "Distance", suffix: units === "metric" ? " km" : " mi", color: "#a8c7fa", goal: 0, format: (v: number) => units === "metric" ? v / 1000 : v / 1609.344 }
      : { label: "Energy", suffix: " kcal", color: "#ffca80", goal: 0, format: (v: number) => v / 4184 };
  const data = report.activity.map((day) => ({ ...day, displayValue: config.format(day[metric]) }));
  const controls = <div className="chart-controls" aria-label="Activity chart controls">
    <div className="segmented">{(["steps", "distanceMeters", "energyJoules"] as ActivityMetric[]).map((value) => <button key={value} className={metric === value ? "active" : ""} onClick={() => setMetric(value)}>{value === "distanceMeters" ? "Distance" : value === "energyJoules" ? "Energy" : "Steps"}</button>)}</div>
    {!compactView && <div className="segmented"><button className={style === "bar" ? "active" : ""} onClick={() => setStyle("bar")}>Bars</button><button className={style === "line" ? "active" : ""} onClick={() => setStyle("line")}>Line</button></div>}
  </div>;
  return <Panel title={`${config.label} over time`} eyebrow="Interactive timeline" action={controls} className="explorer-panel">
    <div className={`chart ${compactView ? "" : "hero-chart"}`} role="img" aria-label={`${config.label} trend for the selected period`}><ResponsiveContainer>
      {style === "bar" ? <BarChart data={data}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={(v) => shortDate.format(new Date(`${v}T00:00:00`))} /><YAxis width={48} tickFormatter={(v) => number.format(v)} /><Tooltip content={<ChartTip suffix={config.suffix} labelFormatter={(v) => shortDate.format(new Date(`${v}T00:00:00`))} />} />{config.goal > 0 && <ReferenceLine y={config.goal} stroke="#ffca80" strokeDasharray="5 5" label={{ value: "10k goal", fill: "#b8c2bd", position: "insideTopRight" }} />}<Bar name={config.label} dataKey="displayValue" fill={config.color} radius={[6,6,0,0]} />{!compactView && data.length > 5 && <Brush dataKey="date" height={28} stroke="#a8c7fa" fill="#181d1b" travellerWidth={10} />}</BarChart>
      : <LineChart data={data}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={(v) => shortDate.format(new Date(`${v}T00:00:00`))} /><YAxis width={48} tickFormatter={(v) => number.format(v)} /><Tooltip content={<ChartTip suffix={config.suffix} />} /><Line name={config.label} type="monotone" dataKey="displayValue" stroke={config.color} strokeWidth={3} dot={{ r: 4, fill: config.color }} activeDot={{ r: 7 }} />{!compactView && data.length > 5 && <Brush dataKey="date" height={28} stroke="#a8c7fa" fill="#181d1b" />}</LineChart>}
    </ResponsiveContainer></div>
    {!compactView && <div className="chart-foot"><span><SlidersHorizontal /> Hover for exact values</span><span>Drag the navigator to zoom into a range</span></div>}
  </Panel>;
}

function HeartExplorer({ report, compactView = false }: { report: HealthReport; compactView?: boolean }) {
  const [bucket, setBucket] = useState<5 | 15 | 60>(5);
  const [showAverage, setShowAverage] = useState(true);
  const [showPoints, setShowPoints] = useState(false);
  const data = bucket === 5 ? report.heartRate : Array.from(report.heartRate.reduce((map, point) => {
    const timestamp = Math.floor(point.timestamp / (bucket * 60000)) * bucket * 60000;
    const current = map.get(timestamp) ?? { timestamp, weighted: 0, samples: 0 };
    const samples = point.secondary ?? 1;
    current.weighted += point.value * samples; current.samples += samples; map.set(timestamp, current); return map;
  }, new Map<number, { timestamp: number; weighted: number; samples: number }>()).values()).map((point) => ({ timestamp: point.timestamp, value: point.weighted / point.samples, secondary: point.samples }));
  const controls = <div className="chart-controls" aria-label="Heart chart controls"><div className="segmented">{([5,15,60] as const).map((value) => <button key={value} className={bucket === value ? "active" : ""} onClick={() => setBucket(value)}>{value === 60 ? "1 hr" : `${value} min`}</button>)}</div>{!compactView && <div className="chart-toggles"><label><input type="checkbox" checked={showAverage} onChange={(e) => setShowAverage(e.target.checked)} />Average</label><label><input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} />Points</label></div>}</div>;
  return <Panel title="Heart-rate trace" eyebrow={`${bucket}-minute weighted average`} action={controls} className="explorer-panel">
    {data.length ? <div className={`chart ${compactView ? "" : "hero-chart"}`} role="img" aria-label="Heart rate timeline with zoom controls"><ResponsiveContainer><AreaChart data={data}><defs><linearGradient id={`heartFill${compactView ? "Small" : "Large"}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb4ab" stopOpacity=".32"/><stop offset="1" stopColor="#ffb4ab" stopOpacity="0"/></linearGradient></defs><CartesianGrid vertical={false}/><XAxis dataKey="timestamp" type="number" domain={["dataMin","dataMax"]} tickFormatter={(v) => new Date(v).toLocaleTimeString([], {hour:"numeric",minute: bucket === 5 ? "2-digit" : undefined})}/><YAxis domain={["dataMin - 10","dataMax + 10"]} width={42} tickFormatter={(v) => String(Math.round(v))}/><Tooltip content={<ChartTip suffix=" bpm"/>}/><Area name="Heart rate" type="monotone" dataKey="value" stroke="#ffb4ab" fill={`url(#heartFill${compactView ? "Small" : "Large"})`} strokeWidth={2.5} dot={showPoints ? { r: 2, fill: "#ffb4ab" } : false} activeDot={{r:6}}/>{showAverage && report.summary.heartRateAverage !== null && <ReferenceLine y={report.summary.heartRateAverage} stroke="#a8c7fa" strokeDasharray="6 5" label={{value:`avg ${Math.round(report.summary.heartRateAverage)}`,fill:"#a8c7fa",position:"insideTopRight"}}/>}{!compactView && data.length > 10 && <Brush dataKey="timestamp" height={30} stroke="#a8c7fa" fill="#181d1b" tickFormatter={(v) => new Date(v).toLocaleTimeString([], {hour:"numeric"})}/>}</AreaChart></ResponsiveContainer></div>:<Empty icon={HeartPulse} title="No heart data" message="No samples match the current filters."/>}
    {!compactView && <div className="chart-foot"><span><SlidersHorizontal /> {data.length} visible points</span><span>Use the navigator handles to inspect a smaller window</span></div>}
  </Panel>;
}

function ImportScreen({ onFile, busy, error }: { onFile: (file: File) => void; busy: boolean; error: string }) {
  const [dragging, setDragging] = useState(false);
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };
  return (
    <main className="import-page">
      <div className="import-mark"><FileHeart /><span>HC / STUDIO</span></div>
      <section className="import-copy">
        <span className="kicker">Your health archive, made legible</span>
        <h1>Read the signal<br />inside your data.</h1>
        <p>Open a Health Connect SQLite export and explore movement, heart rate, exercise, sleep, and body trends. Nothing leaves this browser.</p>
      </section>
      <label
        className={`drop-zone ${dragging ? "dragging" : ""} ${busy ? "busy" : ""}`}
        onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDragOver={(e) => e.preventDefault()} onDrop={drop}
      >
        <input type="file" accept=".db,.sqlite,.sqlite3,application/x-sqlite3" disabled={busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <div className="drop-icon">{busy ? <RotateCcw className="spin" /> : <Upload />}</div>
        <strong>{busy ? "Reading your archive..." : "Drop your Health Connect export"}</strong>
        <span>{busy ? "Large archives can take a moment" : "or choose a .db file"}</span>
        {!busy && <b>Choose database <ArrowRight /></b>}
      </label>
      {error && <div className="import-error"><AlertTriangle />{error}</div>}
      <footer className="privacy-strip">
        <div><ShieldCheck /><span><b>Local by design</b>Your file is processed in memory and is never uploaded.</span></div>
        <div><Database /><span><b>Read only</b>The original database is never changed.</span></div>
        <div><RotateCcw /><span><b>Ephemeral</b>Refresh the page to clear the imported archive.</span></div>
      </footer>
    </main>
  );
}

function Overview({ report, units }: { report: HealthReport; units: Units }) {
  const s = report.summary;
  const maxSteps = Math.max(...report.activity.map((d) => d.steps), 1);
  return <>
    <div className="page-intro"><div><span className="kicker">Selected period</span><h1>Your day, in signals.</h1></div><p>{shortDate.format(new Date(`${report.range.selectedFrom}T00:00:00`))} to {shortDate.format(new Date(`${report.range.selectedTo}T00:00:00`))} · {s.trackedDays} tracked {s.trackedDays === 1 ? "day" : "days"}</p></div>
    <section className="day-trace" aria-label="Daily step trace">
      <div className="trace-title"><span>Activity trace</span><b>{compact.format(s.totalSteps)} steps</b></div>
      <div className="trace-bars">{report.activity.map((day) => <div key={day.date} title={`${day.date}: ${day.steps.toLocaleString()} steps`}><i style={{ height: `${Math.max(8, day.steps / maxSteps * 100)}%` }} /></div>)}</div>
      <div className="trace-foot"><span>{report.range.selectedFrom}</span><span>Goal line: 10k / day</span><span>{report.range.selectedTo}</span></div>
    </section>
    <div className="metrics-grid">
      <MetricCard label="Daily movement" value={compact.format(s.averageDailySteps)} detail="average steps per tracked day" />
      <MetricCard label="Ground covered" value={distance(s.totalDistanceMeters, units)} detail="recorded distance" tone="blue" />
      <MetricCard label="Energy" value={energy(s.totalEnergyJoules)} detail="total calories recorded" tone="amber" />
      <MetricCard label="Heart signal" value={s.heartRateAverage === null ? "No data" : `${Math.round(s.heartRateAverage)} bpm`} detail={s.heartRateMin === null ? "No samples" : `${Math.round(s.heartRateMin)}–${Math.round(s.heartRateMax!)} bpm range`} tone="coral" />
    </div>
    <div className="two-col overview-charts"><ActivityExplorer report={report} units={units} compactView /><HeartExplorer report={report} compactView /></div>
  </>;
}

function ActivityView({ report, units }: { report: HealthReport; units: Units }) {
  return <><div className="page-intro"><div><span className="kicker">Movement ledger</span><h1>Activity</h1></div><p>Switch metrics and chart forms, then drag the navigator to inspect a smaller range.</p></div><div className="metrics-grid three"><MetricCard label="Total steps" value={report.summary.totalSteps.toLocaleString()} detail={`${report.summary.trackedDays} tracked days`} /><MetricCard label="Distance" value={distance(report.summary.totalDistanceMeters, units)} detail="across all sources" tone="blue" /><MetricCard label="Energy" value={energy(report.summary.totalEnergyJoules)} detail="recorded expenditure" tone="amber" /></div><ActivityExplorer report={report} units={units}/><Panel title="Recorded days" eyebrow="Accessible data table"><div className="table-wrap"><table><thead><tr><th>Date</th><th>Steps</th><th>Distance</th><th>Energy</th></tr></thead><tbody>{[...report.activity].reverse().map(day=><tr key={day.date}><td>{day.date}</td><td>{day.steps.toLocaleString()}</td><td>{distance(day.distanceMeters,units)}</td><td>{energy(day.energyJoules)}</td></tr>)}</tbody></table></div></Panel></>;
}

function HeartView({ report }: { report: HealthReport }) {
  const s=report.summary;
  return <><div className="page-intro"><div><span className="kicker">Cardiovascular signal</span><h1>Heart</h1></div><p>Change the time resolution, reveal individual points, and zoom into dense sensor windows.</p></div><div className="metrics-grid three"><MetricCard label="Low" value={s.heartRateMin===null?"—":`${Math.round(s.heartRateMin)} bpm`} detail="selected period" tone="blue"/><MetricCard label="Average" value={s.heartRateAverage===null?"—":`${Math.round(s.heartRateAverage)} bpm`} detail={`${report.heartRate.reduce((n,p)=>n+(p.secondary??0),0).toLocaleString()} sensor samples`} tone="coral"/><MetricCard label="High" value={s.heartRateMax===null?"—":`${Math.round(s.heartRateMax)} bpm`} detail="selected period" tone="amber"/></div><HeartExplorer report={report}/></>;
}

function ExerciseView({ report }: { report: HealthReport }) {
  return <><div className="page-intro"><div><span className="kicker">Deliberate movement</span><h1>Exercise</h1></div><p>Sessions recorded by your connected applications.</p></div><div className="metrics-grid three"><MetricCard label="Sessions" value={String(report.summary.exerciseCount)} detail="selected period"/><MetricCard label="Total time" value={`${Math.round(report.summary.exerciseMinutes)} min`} detail="recorded exercise" tone="blue"/><MetricCard label="Average session" value={report.summary.exerciseCount?`${Math.round(report.summary.exerciseMinutes/report.summary.exerciseCount)} min`:"—"} detail="per session" tone="amber"/></div><Panel title="Session log" eyebrow="Recent first">{report.exercises.length?<div className="session-list">{report.exercises.map(session=><article key={session.id}><div className="session-icon"><Dumbbell/></div><div><strong>{session.title||session.typeName}</strong><span>{dateTime.format(session.start)} · {session.source}</span></div><b>{Math.round(session.durationMinutes)} min</b></article>)}</div>:<Empty icon={Dumbbell} title="No exercise sessions" message="No sessions match the current filters."/>}</Panel></>;
}

function SleepView({ report }: { report: HealthReport }) {
  return <><div className="page-intro"><div><span className="kicker">Rest and rhythm</span><h1>Sleep</h1></div><p>Duration and timing from recorded sleep sessions.</p></div><Panel title="Sleep sessions" eyebrow="Nightly record">{report.sleep.length?<div className="chart tall"><ResponsiveContainer><BarChart data={report.sleep}><CartesianGrid vertical={false}/><XAxis dataKey="timestamp" tickFormatter={v=>shortDate.format(v)}/><YAxis/><Tooltip content={<ChartTip suffix=" min"/>}/><Bar dataKey="value" fill="#5f6f91" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>:<Empty icon={Moon} title="No sleep data in this archive" message="The database contains the sleep schema, but no sessions are recorded for this period."/>}</Panel></>;
}

function VitalsView({ report, units }: { report: HealthReport; units: Units }) {
  const latest=report.summary.latestWeightGrams;
  return <><div className="page-intro"><div><span className="kicker">Long-view measurements</span><h1>Body & vitals</h1></div><p>Measurements are shown without diagnostic interpretation.</p></div><div className="metrics-grid three"><MetricCard label="Latest weight" value={latest===null?"No data":weight(latest,units)} detail={report.weight.length?dateTime.format(report.weight.at(-1)!.timestamp):"selected period"}/><MetricCard label="Resting heart rate" value={report.restingHeartRate.length?`${Math.round(report.restingHeartRate.at(-1)!.value)} bpm`:"No data"} detail="latest measurement" tone="coral"/><MetricCard label="Oxygen saturation" value={report.oxygen.length?`${number.format(report.oxygen.at(-1)!.value)}%`:"No data"} detail="latest measurement" tone="blue"/></div><div className="two-col"><Panel title="Weight" eyebrow="Trend">{report.weight.length?<div className="chart"><ResponsiveContainer><LineChart data={report.weight.map(p=>({...p,value:units==="metric"?p.value/1000:p.value/453.59237}))}><CartesianGrid vertical={false}/><XAxis dataKey="timestamp" tickFormatter={v=>shortDate.format(v)}/><YAxis domain={["dataMin - 2","dataMax + 2"]}/><Tooltip content={<ChartTip suffix={units==="metric"?" kg":" lb"}/>} /><Line dataKey="value" stroke="#537b69" strokeWidth={2}/></LineChart></ResponsiveContainer></div>:<Empty icon={Scale} title="No weight trend" message="No measurements match the current filters."/>}</Panel><Panel title="Other vitals" eyebrow="Availability"><div className="availability"><span><HeartPulse/>Resting heart rate<b>{report.restingHeartRate.length} records</b></span><span><Activity/>HRV<b>{report.hrv.length} records</b></span><span><ShieldCheck/>Oxygen saturation<b>{report.oxygen.length} records</b></span><span><HeartPulse/>Blood pressure<b>{report.bloodPressure.length} records</b></span></div></Panel></div></>;
}

function SourcesView({ report }: { report: HealthReport }) {
  return <><div className="page-intro"><div><span className="kicker">Provenance & coverage</span><h1>Sources & quality</h1></div><p>Understand where records came from and where the archive is incomplete.</p></div><div className="two-col"><Panel title="Contributing apps" eyebrow="Source registry"><div className="source-list">{report.sources.map(s=><article key={s.id}><div><Database/><span><strong>{s.name}</strong><small>{s.packageName}</small></span></div><b>{s.records.toLocaleString()} step records</b></article>)}</div></Panel><Panel title="Data notes" eyebrow="Quality"><div className="warnings">{report.warnings.map((warning,i)=><div key={i}><Info/><p>{warning}</p></div>)}</div></Panel></div><Panel title="Archive profile" eyebrow="Schema"><div className="profile-grid"><span><small>Schema version</small><b>{report.schemaVersion}</b></span><span><small>Available tables</small><b>{report.availableTables.length}</b></span><span><small>Archive file</small><b>{report.fileName}</b></span><span><small>Stored here</small><b>Browser memory only</b></span></div></Panel></>;
}

export default function App() {
  const clientRef = useRef<HealthDatabaseClient | null>(null);
  const [info,setInfo]=useState<DatabaseInfo|null>(null);
  const [report,setReport]=useState<HealthReport|null>(null);
  const [view,setView]=useState<View>("overview");
  const [units,setUnits]=useState<Units>("metric");
  const [from,setFrom]=useState(""); const [to,setTo]=useState("");
  const [sourceId,setSourceId]=useState<number|null>(null);
  const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [menu,setMenu]=useState(false);

  useEffect(()=>{const client=new HealthDatabaseClient();clientRef.current=client;return()=>client.dispose()},[]);
  const analyze=async(nextInfo:DatabaseInfo, nextFrom=from||nextInfo.minDate,nextTo=to||nextInfo.maxDate,nextSource=sourceId)=>{setBusy(true);setError("");try{setReport(await clientRef.current!.analyze({from:nextFrom,to:nextTo,sourceId:nextSource}));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false)}};
  const load=async(file:File)=>{setBusy(true);setError("");try{const loaded=await clientRef.current!.load(file);setInfo(loaded);setFrom(loaded.minDate);setTo(loaded.maxDate);setSourceId(null);await analyze(loaded,loaded.minDate,loaded.maxDate,null);}catch(e){setError(e instanceof Error?e.message:String(e));setInfo(null);setReport(null);}finally{setBusy(false)}};
  const applyPreset=(days:number|null)=>{const nextTo=info!.maxDate;const nextFrom=days===null?info!.minDate:new Date(new Date(`${nextTo}T00:00:00`).getTime()-(days-1)*86400000).toISOString().slice(0,10);const boundedFrom=nextFrom<info!.minDate?info!.minDate:nextFrom;setFrom(boundedFrom);setTo(nextTo);void analyze(info!,boundedFrom,nextTo,sourceId)};
  const reset=()=>{location.reload()};
  if(!info||!report)return <ImportScreen onFile={load} busy={busy} error={error}/>;
  const content= view==="overview"?<Overview report={report} units={units}/>:view==="activity"?<ActivityView report={report} units={units}/>:view==="heart"?<HeartView report={report}/>:view==="exercise"?<ExerciseView report={report}/>:view==="sleep"?<SleepView report={report}/>:view==="vitals"?<VitalsView report={report} units={units}/>:<SourcesView report={report}/>;
  return <div className="app-shell">
    <aside className={menu?"open":""}><div className="brand"><FileHeart/><span>Health Connect<b>Studio</b></span><button onClick={()=>setMenu(false)} aria-label="Close menu"><X/></button></div><nav>{NAV.map(item=><button key={item.id} className={view===item.id?"active":""} onClick={()=>{setView(item.id);setMenu(false)}}><item.icon/>{item.label}</button>)}</nav><div className="aside-foot"><ShieldCheck/><span>Local session<b>{report.fileName}</b></span><button onClick={reset} title="Clear database"><RotateCcw/></button></div></aside>
    <div className="workspace"><header className="topbar"><button className="mobile-menu" onClick={()=>setMenu(true)} aria-label="Open menu"><Menu/></button><div className="quick-ranges" aria-label="Quick date ranges"><button onClick={()=>applyPreset(7)}>7D</button><button onClick={()=>applyPreset(30)}>30D</button><button onClick={()=>applyPreset(90)}>90D</button><button className={from===info.minDate&&to===info.maxDate?"active":""} onClick={()=>applyPreset(null)}>All</button></div><div className="filters"><label>From<input type="date" min={info.minDate} max={to} value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" min={from} max={info.maxDate} value={to} onChange={e=>setTo(e.target.value)}/></label><label>Source<select value={sourceId??""} onChange={e=>setSourceId(e.target.value?Number(e.target.value):null)}><option value="">All sources</option>{info.sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="apply" disabled={busy} onClick={()=>analyze(info)}>{busy?<RotateCcw className="spin"/>:"Apply"}</button></div><div className="top-actions"><div className="unit-toggle"><button className={units==="metric"?"active":""} onClick={()=>setUnits("metric")}>Metric</button><button className={units==="imperial"?"active":""} onClick={()=>setUnits("imperial")}>Imperial</button></div><button className="export" onClick={()=>exportReport(report,units)}><Download/>Export</button></div></header>{error&&<div className="workspace-error"><AlertTriangle/>{error}</div>}<main className="content">{content}</main></div>
  </div>;
}
